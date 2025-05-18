// backend/server.js

const express = require('express');
const cors = require('cors');
const axios = require('axios'); 
require('dotenv').config(); 
const cron = require('node-cron');

const db = require('./config/db'); 

const app = express();
const port = 3000;

app.use(cors());

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

// Helper para formatar data como YYYY-MM-DD
const formatDateToYYYYMMDD = (date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// --- Lógica de Geração de Alertas (sem alterações nesta etapa) ---
const ALERT_RULES = {
    TEMP_THRESHOLD: 40, RAIN_THRESHOLD: 25, WIND_THRESHOLD_MS: 11.11,
};
async function checkWeatherAndGenerateAlerts() {
    console.log(`[${new Date().toISOString()}] [Alert Generation] Iniciando verificação...`);
    let alertsGeneratedCount = 0;
    try {
        const citiesResult = await db.query('SELECT id, name, latitude, longitude FROM cities');
        const cities = citiesResult.rows;
        if (cities.length === 0) { console.log('[Alert Generation] Nenhuma cidade encontrada.'); return; }
        const todayYYYYMMDD = formatDateToYYYYMMDD(new Date());
        for (const city of cities) {
            if (!city.latitude || !city.longitude) { console.warn(`[Alert Generation] Coordenadas ausentes para ${city.name}.`); continue; }
            try {
                const weatherApiUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${city.latitude}&lon=${city.longitude}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=pt_br`;
                const weatherResponse = await axios.get(weatherApiUrl);
                const weatherData = weatherResponse.data;
                const temperature = weatherData.main.temp;
                const rain1h = weatherData.rain ? weatherData.rain['1h'] : 0;
                const windSpeed = weatherData.wind.speed;

                if (temperature > ALERT_RULES.TEMP_THRESHOLD) {
                    await processAlertInsertion({ city_id: city.id, city_name: city.name, alert_type_id: 'onda_calor', alert_date: todayYYYYMMDD, description: `Temperatura elevada de ${temperature.toFixed(1)}°C.`, severity: 'alta' }, (count) => alertsGeneratedCount += count);
                }
                if (rain1h > ALERT_RULES.RAIN_THRESHOLD) {
                     await processAlertInsertion({ city_id: city.id, city_name: city.name, alert_type_id: 'chuvas_fortes', alert_date: todayYYYYMMDD, description: `Chuva intensa de ${rain1h}mm/h.`, severity: 'alta' }, (count) => alertsGeneratedCount += count);
                }
                if (windSpeed > ALERT_RULES.WIND_THRESHOLD_MS) {
                    const windSpeedKmh = (windSpeed * 3.6).toFixed(1);
                    await processAlertInsertion({ city_id: city.id, city_name: city.name, alert_type_id: 'ventos_fortes', alert_date: todayYYYYMMDD, description: `Ventos fortes de ${windSpeedKmh} km/h.`, severity: 'media' }, (count) => alertsGeneratedCount += count);
                }
            } catch (weatherError) { console.error(`[Alert Generation] Erro para ${city.name}:`, weatherError.message); }
        }
        console.log(`[${new Date().toISOString()}] [Alert Generation] Verificação concluída. ${alertsGeneratedCount} novos alertas gerados.`);
    } catch (error) { console.error(`[${new Date().toISOString()}] [Alert Generation] Erro geral:`, error); }
}
async function processAlertInsertion(alertToInsert, updateCountCallback) {
    try {
        const checkDuplicateQuery = 'SELECT id FROM alerts WHERE city_id = $1 AND alert_type_id = $2 AND alert_date = $3';
        const duplicateResult = await db.query(checkDuplicateQuery, [alertToInsert.city_id, alertToInsert.alert_type_id, alertToInsert.alert_date]);
        if (duplicateResult.rows.length === 0) {
            const insertQuery = 'INSERT INTO alerts (city_id, alert_type_id, alert_date, description, severity) VALUES ($1, $2, $3, $4, $5) RETURNING id';
            const insertedAlert = await db.query(insertQuery, [alertToInsert.city_id, alertToInsert.alert_type_id, alertToInsert.alert_date, alertToInsert.description, alertToInsert.severity]);
            console.log(`[Alert Generation] Alerta GERADO para ${alertToInsert.city_name} (Tipo: ${alertToInsert.alert_type_id}), ID: ${insertedAlert.rows[0].id}`);
            updateCountCallback(1);
        }
    } catch (dbError) { console.error(`[Alert Generation] Erro DB para ${alertToInsert.city_name}:`, dbError); }
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

// NOVO Endpoint: Buscar previsão do tempo para uma cidade
app.get('/api/weather/forecast/:cityId', async (req, res) => {
    const { cityId } = req.params;
    console.log(`GET /api/weather/forecast/${cityId} - Buscando previsão do tempo...`);

    if (!OPENWEATHER_API_KEY) {
        return res.status(500).json({ error: 'Configuração do servidor incompleta (API Key).' });
    }

    try {
        const cityResult = await db.query('SELECT name, latitude, longitude FROM cities WHERE id = $1', [cityId]);
        if (cityResult.rows.length === 0) {
            return res.status(404).json({ error: 'Cidade não encontrada.' });
        }
        const { name: cityName, latitude, longitude } = cityResult.rows[0];

        const forecastApiUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=pt_br`;
        
        console.log(`Chamando OpenWeather Forecast API: ${forecastApiUrl.replace(OPENWEATHER_API_KEY, '***API_KEY***')}`);
        
        const forecastResponse = await axios.get(forecastApiUrl);
        const forecastData = forecastResponse.data;

        // Processar os dados da previsão para agrupar por dia e extrair informações relevantes
        const dailyForecasts = {};
        forecastData.list.forEach(item => {
            const date = item.dt_txt.split(' ')[0]; // Pega apenas a parte da data (YYYY-MM-DD)
            if (!dailyForecasts[date]) {
                dailyForecasts[date] = {
                    date: date, // Data no formato YYYY-MM-DD
                    displayDate: new Date(date + "T00:00:00").toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }), // Ex: Sáb, 17/Mai
                    temps: [],
                    weatherEntries: []
                };
            }
            dailyForecasts[date].temps.push(item.main.temp);
            dailyForecasts[date].weatherEntries.push({
                time: item.dt_txt.split(' ')[1].substring(0, 5), // HH:MM
                temp: item.main.temp,
                description: item.weather[0].description,
                icon: item.weather[0].icon,
                pop: item.pop // Probabilidade de precipitação (0 a 1)
            });
        });

        const processedForecast = Object.values(dailyForecasts).map(day => {
            // Para o resumo do dia, podemos pegar o ícone e descrição do meio-dia ou o mais frequente
            const middayEntry = day.weatherEntries.find(e => e.time === '12:00') || 
                                day.weatherEntries.find(e => e.time === '15:00') || 
                                day.weatherEntries[Math.floor(day.weatherEntries.length / 2)]; // Fallback
            return {
                date: day.date,
                displayDate: day.displayDate,
                minTemp: Math.min(...day.temps),
                maxTemp: Math.max(...day.temps),
                description: middayEntry ? middayEntry.description : day.weatherEntries[0].description,
                icon: middayEntry ? middayEntry.icon : day.weatherEntries[0].icon,
                // Opcional: incluir a lista detalhada de entradas de 3 horas se o frontend precisar
                // hourlyDetails: day.weatherEntries 
            };
        }).slice(0, 5); // Limita aos próximos 5 dias

        console.log(`Previsão para ${cityName} (ID: ${cityId}) processada.`);
        res.json({ cityId, cityName, forecast: processedForecast });

    } catch (error) {
        console.error(`Erro ao buscar previsão para ${cityId}:`, error.response ? error.response.data : error.message);
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
