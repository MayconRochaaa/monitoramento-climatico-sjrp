// backend/server.js

const express = require('express');
const cors = require('cors');
const axios = require('axios'); 
require('dotenv').config(); 
const cron = require('node-cron');

const db = require('./config/db'); 

const app = express();
const port = 3000;

// Middleware para parsear JSON no corpo das requisições POST
app.use(express.json());
app.use(cors());

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

// Helper para formatar data como YYYY-MM-DD
const formatDateToYYYYMMDD = (date) => {
    const d = new Date(date);
    // Usar UTC para consistência, pois as datas da API e do banco de dados podem não ter fuso horário explícito
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0'); // Meses são 0-indexados
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// --- Lógica de Geração de Alertas ---

const ALERT_RULES = {
    TEMP_THRESHOLD_MAX_CURRENT: 40, // °C para tempo atual
    TEMP_THRESHOLD_MAX_FORECAST: 38, // °C para previsão
    RAIN_THRESHOLD_CURRENT: 20, // mm/h para tempo atual 
    POP_THRESHOLD_FORECAST: 0.6, // Probabilidade de precipitação (60%) para previsão
    WIND_THRESHOLD_MS: 11.11, // m/s (~40 km/h) para atual e previsão
};

// Função auxiliar para processar a inserção de um alerta, verificar duplicados e identificar subscritores
async function processAlertInsertion(alertToInsert, updateCountCallback) {
    try {
        const typeExists = await db.query('SELECT id FROM alert_types WHERE id = $1', [alertToInsert.alert_type_id]);
        if (typeExists.rows.length === 0) {
            console.warn(`[Alert Generation] Tipo de alerta ID '${alertToInsert.alert_type_id}' não encontrado. Alerta para ${alertToInsert.city_name} não será inserido.`);
            return;
        }

        const checkDuplicateQuery = 'SELECT id FROM alerts WHERE city_id = $1 AND alert_type_id = $2 AND alert_date = $3';
        const duplicateResult = await db.query(checkDuplicateQuery, [alertToInsert.city_id, alertToInsert.alert_type_id, alertToInsert.alert_date]);

        if (duplicateResult.rows.length === 0) {
            const insertQuery = 'INSERT INTO alerts (city_id, alert_type_id, alert_date, description, severity) VALUES ($1, $2, $3, $4, $5) RETURNING id';
            const insertedAlert = await db.query(insertQuery, [
                alertToInsert.city_id,
                alertToInsert.alert_type_id,
                alertToInsert.alert_date,
                alertToInsert.description,
                alertToInsert.severity
            ]);
            const newAlertId = insertedAlert.rows[0].id;
            console.log(`[Alert Generation] Alerta GERADO para ${alertToInsert.city_name} (Tipo: ${alertToInsert.alert_type_id}, Data: ${alertToInsert.alert_date}), ID: ${newAlertId}`);
            if (updateCountCallback) updateCountCallback(1);

            const subscribersQuery = `
                SELECT u.email 
                FROM users u
                JOIN user_city_subscriptions ucs ON u.id = ucs.user_id
                WHERE ucs.city_id = $1;
            `;
            const subscribersResult = await db.query(subscribersQuery, [alertToInsert.city_id]);
            if (subscribersResult.rows.length > 0) {
                const emails = subscribersResult.rows.map(row => row.email);
                console.log(`[Notification Prep] Alerta ID ${newAlertId} para ${alertToInsert.city_name} (Data: ${alertToInsert.alert_date}, Tipo: ${alertToInsert.alert_type_id}) deve ser enviado para: ${emails.join(', ')}`);
            }
        }
    } catch (dbError) {
        console.error(`[Alert Generation] Erro DB ao inserir/processar alerta para ${alertToInsert.city_name} (Tipo: ${alertToInsert.alert_type_id}):`, dbError.message);
    }
}


async function checkWeatherAndGenerateAlerts() {
    console.log(`[${new Date().toISOString()}] [Alert Generation] Iniciando verificação de tempo (atual e previsão)...`);
    let alertsGeneratedCount = 0;
    try {
        const citiesResult = await db.query('SELECT id, name, latitude, longitude FROM cities');
        const cities = citiesResult.rows;
        if (cities.length === 0) { console.log('[Alert Generation] Nenhuma cidade encontrada.'); return; }
        const todayYYYYMMDD = formatDateToYYYYMMDD(new Date());

        for (const city of cities) {
            if (!city.latitude || !city.longitude) { console.warn(`[Alert Generation] Coordenadas ausentes para ${city.name}.`); continue; }
            
            // 1. Verificar Tempo Atual e Gerar Alertas para HOJE
            try {
                const weatherApiUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${city.latitude}&lon=${city.longitude}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=pt_br`;
                const weatherResponse = await axios.get(weatherApiUrl);
                const weatherData = weatherResponse.data;
                const temperature = weatherData.main.temp;
                const rain1h = weatherData.rain ? weatherData.rain['1h'] : 0; 
                const windSpeed = weatherData.wind.speed;

                if (temperature > ALERT_RULES.TEMP_THRESHOLD_MAX_CURRENT) { 
                    await processAlertInsertion({ city_id: city.id, city_name: city.name, alert_type_id: 'onda_calor', alert_date: todayYYYYMMDD, description: `Temperatura atual elevada de ${temperature.toFixed(1)}°C.`, severity: 'alta' }, (count) => alertsGeneratedCount += count);
                }
                if (rain1h > ALERT_RULES.RAIN_THRESHOLD_CURRENT) { 
                    await processAlertInsertion({ city_id: city.id, city_name: city.name, alert_type_id: 'chuvas_fortes', alert_date: todayYYYYMMDD, description: `Chuva intensa atual de ${rain1h}mm/h.`, severity: 'alta' }, (count) => alertsGeneratedCount += count);
                }
                if (windSpeed > ALERT_RULES.WIND_THRESHOLD_MS) {
                    const windSpeedKmh = (windSpeed * 3.6).toFixed(1);
                    await processAlertInsertion({ city_id: city.id, city_name: city.name, alert_type_id: 'ventos_fortes', alert_date: todayYYYYMMDD, description: `Ventos fortes atuais de ${windSpeedKmh} km/h.`, severity: 'media' }, (count) => alertsGeneratedCount += count);
                }
            } catch (currentWeatherError) { console.error(`[Alert Generation] Erro tempo ATUAL para ${city.name}:`, currentWeatherError.message); }

            // 2. Verificar Previsão e Gerar Alertas FUTUROS
            try {
                const forecastApiUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${city.latitude}&lon=${city.longitude}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=pt_br`;
                const forecastResponse = await axios.get(forecastApiUrl);
                const forecastData = forecastResponse.data;
                const dailyForecasts = {};
                forecastData.list.forEach(item => {
                    const date = item.dt_txt.split(' ')[0]; 
                    if (!dailyForecasts[date]) { dailyForecasts[date] = { date: date, temps_max: [], pops: [], weatherDescriptions: [], windSpeeds: [] }; }
                    dailyForecasts[date].temps_max.push(item.main.temp_max); 
                    dailyForecasts[date].pops.push(item.pop || 0); 
                    dailyForecasts[date].weatherDescriptions.push(item.weather[0].description.toLowerCase());
                    dailyForecasts[date].windSpeeds.push(item.wind.speed);
                });
                for (const dateKey in dailyForecasts) {
                    if (dateKey === todayYYYYMMDD) continue; 
                    const dayData = dailyForecasts[dateKey];
                    const forecastDate = dayData.date; 
                    const maxTemp = Math.max(...dayData.temps_max);
                    const maxPop = Math.max(...dayData.pops);
                    const maxWindSpeed = Math.max(...dayData.windSpeeds);
                    if (maxTemp > ALERT_RULES.TEMP_THRESHOLD_MAX_FORECAST) {
                        await processAlertInsertion({ city_id: city.id, city_name: city.name, alert_type_id: 'onda_calor', alert_date: forecastDate, description: `Previsão de temperatura máxima de ${maxTemp.toFixed(1)}°C.`, severity: 'media' }, (count) => alertsGeneratedCount += count);
                    }
                    const hasRainDescription = dayData.weatherDescriptions.some(desc => desc.includes('chuva') || desc.includes('tempestade') || desc.includes('temporal'));
                    if (maxPop > ALERT_RULES.POP_THRESHOLD_FORECAST && hasRainDescription) {
                        await processAlertInsertion({ city_id: city.id, city_name: city.name, alert_type_id: 'chuvas_fortes', alert_date: forecastDate, description: `Previsão de ${ (maxPop * 100).toFixed(0)}% de chance de chuva.`, severity: 'media' }, (count) => alertsGeneratedCount += count);
                    }
                    if (maxWindSpeed > ALERT_RULES.WIND_THRESHOLD_MS) {
                        const windSpeedKmh = (maxWindSpeed * 3.6).toFixed(1);
                        await processAlertInsertion({ city_id: city.id, city_name: city.name, alert_type_id: 'ventos_fortes', alert_date: forecastDate, description: `Previsão de ventos fortes de até ${windSpeedKmh} km/h.`, severity: 'media' }, (count) => alertsGeneratedCount += count);
                    }
                }
            } catch (forecastError) { console.error(`[Alert Generation] Erro PREVISÃO para ${city.name}:`, forecastError.message); }
        }
        console.log(`[${new Date().toISOString()}] [Alert Generation] Verificação concluída. ${alertsGeneratedCount} novos alertas gerados (atuais e futuros).`);
    } catch (error) { console.error(`[${new Date().toISOString()}] [Alert Generation] Erro geral:`, error); }
}

// --- Endpoints da API ---
app.get('/api/cidades', async (req, res) => {
    try {
        const result = await db.query('SELECT id, name, latitude, longitude FROM cities ORDER BY name');
        const citiesFormatted = result.rows.map(city => ({ id: city.id, name: city.name, coords: [parseFloat(city.latitude), parseFloat(city.longitude)] }));
        res.json(citiesFormatted);
    } catch (err) { console.error('Erro /api/cidades:', err); res.status(500).json({ error: 'Erro ao buscar cidades' }); }
});

app.get('/api/tipos-alerta', async (req, res) => {
    try {
        const result = await db.query('SELECT id, name, icon, color_class AS "colorClass" FROM alert_types ORDER BY name');
        res.json(result.rows);
    } catch (err) { console.error('Erro /api/tipos-alerta:', err); res.status(500).json({ error: 'Erro ao buscar tipos de alerta' }); }
});

app.get('/api/weather/current/:cityId', async (req, res) => {
    const { cityId } = req.params;
    if (!OPENWEATHER_API_KEY) { return res.status(500).json({ error: 'Configuração do servidor incompleta (API Key).' }); }
    try {
        const cityResult = await db.query('SELECT latitude, longitude FROM cities WHERE id = $1', [cityId]);
        if (cityResult.rows.length === 0) { return res.status(404).json({ error: 'Cidade não encontrada.' }); }
        const { latitude, longitude } = cityResult.rows[0];
        const weatherApiUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=pt_br`;
        const weatherResponse = await axios.get(weatherApiUrl);
        const wd = weatherResponse.data;
        const relevantData = {
            cityId: cityId, temperature: wd.main.temp, feelsLike: wd.main.feels_like, humidity: wd.main.humidity,
            pressure: wd.main.pressure, windSpeed: wd.wind.speed, windDirection: wd.wind.deg,
            description: wd.weather[0].description, icon: wd.weather[0].icon, 
            sunrise: new Date(wd.sys.sunrise * 1000).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}),
            sunset: new Date(wd.sys.sunset * 1000).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}),
            rain_1h: wd.rain ? wd.rain['1h'] : 0, timestamp: new Date(wd.dt * 1000).toISOString()
        };
        res.json(relevantData);
    } catch (error) {
        console.error(`Erro /api/weather/current/${cityId}:`, error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Erro ao buscar dados meteorológicos atuais.' });
    }
});

app.get('/api/weather/forecast/:cityId', async (req, res) => {
    const { cityId } = req.params;
    if (!OPENWEATHER_API_KEY) { return res.status(500).json({ error: 'Configuração do servidor incompleta (API Key).' }); }
    try {
        const cityResult = await db.query('SELECT name, latitude, longitude FROM cities WHERE id = $1', [cityId]);
        if (cityResult.rows.length === 0) { return res.status(404).json({ error: 'Cidade não encontrada.' }); }
        const { name: cityName, latitude, longitude } = cityResult.rows[0];
        const forecastApiUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=pt_br`;
        const forecastResponse = await axios.get(forecastApiUrl);
        const forecastData = forecastResponse.data;
        const dailyForecasts = {};
        forecastData.list.forEach(item => {
            const date = item.dt_txt.split(' ')[0]; 
            if (!dailyForecasts[date]) {
                dailyForecasts[date] = {
                    date: date, 
                    displayDate: new Date(date + "T00:00:00Z").toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }),
                    temps_max: [], temps_min: [], pops: [], weatherDescriptions: [], windSpeeds: [], icons: []
                };
            }
            dailyForecasts[date].temps_max.push(item.main.temp_max);
            dailyForecasts[date].temps_min.push(item.main.temp_min);
            dailyForecasts[date].pops.push(item.pop || 0);
            dailyForecasts[date].weatherDescriptions.push(item.weather[0].description.toLowerCase());
            dailyForecasts[date].windSpeeds.push(item.wind.speed);
            dailyForecasts[date].icons.push(item.weather[0].icon);
        });
        const processedForecast = Object.values(dailyForecasts).map(day => {
            let representativeIndex = Math.floor(day.weatherDescriptions.length / 2); 
            const rainIndex = day.weatherDescriptions.findIndex(d => d.includes('chuva') || d.includes('tempestade'));
            if (rainIndex !== -1) { representativeIndex = rainIndex; }
            return {
                date: day.date, displayDate: day.displayDate,
                minTemp: Math.min(...day.temps_min), maxTemp: Math.max(...day.temps_max),
                description: day.weatherDescriptions[representativeIndex] || day.weatherDescriptions[0],
                icon: day.icons[representativeIndex] || day.icons[0],
            };
        }).slice(0, 5); 
        res.json({ cityId, cityName, forecast: processedForecast });
    } catch (error) {
        console.error(`Erro /api/weather/forecast/${cityId}:`, error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Erro ao buscar dados de previsão meteorológica.' });
    }
});

app.get('/api/alertas', async (req, res) => {
    let { startDate, endDate, cityIds, alertTypeIds } = req.query;
    try {
        let query = `
            SELECT a.id, a.city_id AS "cityId", c.name AS "city", c.latitude, c.longitude,
                   a.alert_type_id AS "typeId", at.name AS "type", 
                   TO_CHAR(a.alert_date, 'DD/MM/YYYY') AS "date", 
                   a.description, a.severity
            FROM alerts a
            JOIN cities c ON a.city_id = c.id
            JOIN alert_types at ON a.alert_type_id = at.id
        `;
        const conditions = []; const queryParams = []; let paramIndex = 1;
        if (startDate) { conditions.push(`a.alert_date >= $${paramIndex++}`); queryParams.push(startDate); }
        if (endDate) { conditions.push(`a.alert_date <= $${paramIndex++}`); queryParams.push(endDate); }
        if (cityIds) {
            const cityIdArray = cityIds.split(',');
            const cityPlaceholders = cityIdArray.map(() => `$${paramIndex++}`).join(', ');
            conditions.push(`a.city_id IN (${cityPlaceholders})`); queryParams.push(...cityIdArray);
        }
        if (alertTypeIds) {
            const alertTypeIdArray = alertTypeIds.split(',');
            const typePlaceholders = alertTypeIdArray.map(() => `$${paramIndex++}`).join(', ');
            conditions.push(`a.alert_type_id IN (${typePlaceholders})`); queryParams.push(...alertTypeIdArray);
        }
        if (conditions.length > 0) { query += ' WHERE ' + conditions.join(' AND '); }
        query += ' ORDER BY a.alert_date DESC, c.name ASC;'; 
        const result = await db.query(query, queryParams);
        const alertsFormatted = result.rows.map(alert => ({
            ...alert, coords: [parseFloat(alert.latitude), parseFloat(alert.longitude)]
        }));
        res.json(alertsFormatted);
    } catch (err) {
        console.error('Erro /api/alertas:', err); res.status(500).json({ error: 'Erro ao buscar alertas' });
    }
});

app.post('/api/subscribe', async (req, res) => {
    const { email, cityIds } = req.body; 

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ error: 'Formato de e-mail inválido.', success: false });
    }
    if (!cityIds || !Array.isArray(cityIds) || cityIds.length === 0) {
        return res.status(400).json({ error: 'Pelo menos uma cidade deve ser selecionada para subscrição.', success: false });
    }

    console.log(`POST /api/subscribe - Tentativa de subscrição/atualização para email: ${email}, cidades: ${cityIds.join(',')}`);

    const client = await db.pool.connect(); 
    let isNewUser = false;

    try {
        await client.query('BEGIN'); 

        // 1. Encontrar ou criar o utilizador
        let userResult = await client.query('SELECT id FROM users WHERE email = $1', [email]);
        let userId;

        if (userResult.rows.length > 0) {
            userId = userResult.rows[0].id;
            console.log(`Utilizador existente encontrado com ID: ${userId} para email: ${email}. Atualizando subscrições...`);
            // Se o utilizador existe, remove todas as subscrições antigas dele antes de adicionar as novas
            await client.query('DELETE FROM user_city_subscriptions WHERE user_id = $1', [userId]);
            console.log(`Subscrições antigas para user_id ${userId} removidas.`);
        } else {
            const insertUserResult = await client.query('INSERT INTO users (email) VALUES ($1) RETURNING id', [email]);
            userId = insertUserResult.rows[0].id;
            isNewUser = true;
            console.log(`Novo utilizador criado com ID: ${userId} para email: ${email}`);
        }

        // 2. Adicionar as novas subscrições de cidade
        let newSubscriptionsCount = 0;
        for (const cityId of cityIds) {
            const cityExists = await client.query('SELECT id FROM cities WHERE id = $1', [cityId]);
            if (cityExists.rows.length === 0) {
                console.warn(`Tentativa de subscrever cidade inexistente (ID: ${cityId}) para o utilizador ${email}. A ignorar esta cidade.`);
                continue; 
            }
            // Como já limpamos as subscrições antigas para utilizadores existentes, podemos inserir diretamente.
            // A restrição de chave primária composta (user_id, city_id) ainda protegeria contra duplicados
            // se não tivéssemos limpado, mas limpar primeiro simplifica.
            await client.query(
                'INSERT INTO user_city_subscriptions (user_id, city_id) VALUES ($1, $2)',
                [userId, cityId]
            );
            newSubscriptionsCount++;
        }
        console.log(`${newSubscriptionsCount} novas subscrições adicionadas para user_id ${userId}.`);

        await client.query('COMMIT'); 
        
        const message = isNewUser ? 
            `Subscrição realizada com sucesso para ${email} em ${newSubscriptionsCount} cidade(s).` :
            `Preferências de alerta para ${email} atualizadas com ${newSubscriptionsCount} cidade(s) subscritas.`;
        
        res.status(isNewUser ? 201 : 200).json({ message: message, success: true });
    
    } catch (error) {
        try {
            await client.query('ROLLBACK');
            console.log('ROLLBACK bem-sucedido devido a erro na transação.');
        } catch (rollbackError) {
            console.error('Erro ao tentar executar ROLLBACK:', rollbackError.message);
        }
        console.error('Erro final durante o processo de subscrição:', error.message, error.stack);
        res.status(500).json({ error: 'Erro ao processar a subscrição.', details: error.message, success: false });
    
    } finally {
        client.release(); 
        console.log(`Cliente do banco de dados liberado.`);
    }
});

app.get('/api/trigger-alert-generation', async (req, res) => {
    console.log('GET /api/trigger-alert-generation - Disparando geração de alertas...');
    try {
        await checkWeatherAndGenerateAlerts(); 
        res.status(200).json({ message: 'Verificação de alertas concluída.' });
    } catch (error) {
        console.error('Erro ao disparar geração de alertas:', error);
        res.status(500).json({ error: 'Erro ao processar geração de alertas.' });
    }
});

cron.schedule('0 * * * *', () => { 
   console.log(`[${new Date().toISOString()}] [Scheduler] Executando verificação agendada...`);
   checkWeatherAndGenerateAlerts();
});
console.log(`[${new Date().toISOString()}] [Scheduler] Agendador configurado para rodar a cada hora.`);

app.listen(port, () => {
    console.log(`Servidor backend a correr em http://localhost:${port}`);
});
