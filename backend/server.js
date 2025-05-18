// backend/server.js

const express = require('express');
const cors = require('cors');
const axios = require('axios'); 
require('dotenv').config(); 
const cron = require('node-cron'); // Importa node-cron

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

// --- Lógica de Geração de Alertas ---

const ALERT_RULES = {
    TEMP_THRESHOLD: 40, // °C
    RAIN_THRESHOLD: 25, // mm/h
    WIND_THRESHOLD_MS: 11.11, // m/s (equivalente a ~40 km/h)
};

async function checkWeatherAndGenerateAlerts() {
    console.log(`[${new Date().toISOString()}] [Alert Generation] Iniciando verificação de tempo e geração de alertas...`);
    let alertsGeneratedCount = 0;

    try {
        const citiesResult = await db.query('SELECT id, name, latitude, longitude FROM cities');
        const cities = citiesResult.rows;

        if (cities.length === 0) {
            console.log('[Alert Generation] Nenhuma cidade encontrada no banco de dados para verificar.');
            return;
        }

        const todayYYYYMMDD = formatDateToYYYYMMDD(new Date());

        for (const city of cities) {
            // console.log(`[Alert Generation] Verificando tempo para ${city.name} (ID: ${city.id})`); // Log menos verboso para o agendador
            if (!city.latitude || !city.longitude) {
                console.warn(`[Alert Generation] Coordenadas ausentes para ${city.name}. A ignorar.`);
                continue;
            }

            try {
                const weatherApiUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${city.latitude}&lon=${city.longitude}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=pt_br`;
                const weatherResponse = await axios.get(weatherApiUrl);
                const weatherData = weatherResponse.data;

                const temperature = weatherData.main.temp;
                const rain1h = weatherData.rain ? weatherData.rain['1h'] : 0;
                const windSpeed = weatherData.wind.speed;

                // console.log(`[Alert Generation] Dados para ${city.name}: Temp: ${temperature}°C, Chuva (1h): ${rain1h}mm, Vento: ${windSpeed}m/s`);

                // Avaliar regras de alerta (com ifs independentes como você ajustou)
                if (temperature > ALERT_RULES.TEMP_THRESHOLD) {
                    await processAlertInsertion({
                        city_id: city.id, city_name: city.name, alert_type_id: 'onda_calor', alert_date: todayYYYYMMDD,
                        description: `Temperatura elevada de ${temperature.toFixed(1)}°C registada. Risco de onda de calor.`,
                        severity: 'alta'
                    }, (count) => alertsGeneratedCount += count);
                }
                if (rain1h > ALERT_RULES.RAIN_THRESHOLD) {
                     await processAlertInsertion({
                        city_id: city.id, city_name: city.name, alert_type_id: 'chuvas_fortes', alert_date: todayYYYYMMDD,
                        description: `Chuva intensa de ${rain1h}mm na última hora. Risco de alagamentos.`,
                        severity: 'alta'
                    }, (count) => alertsGeneratedCount += count);
                }
                if (windSpeed > ALERT_RULES.WIND_THRESHOLD_MS) {
                    const windSpeedKmh = (windSpeed * 3.6).toFixed(1);
                    await processAlertInsertion({
                        city_id: city.id, city_name: city.name, alert_type_id: 'ventos_fortes', alert_date: todayYYYYMMDD,
                        description: `Ventos fortes de ${windSpeedKmh} km/h (${windSpeed.toFixed(1)} m/s) registados.`,
                        severity: 'media'
                    }, (count) => alertsGeneratedCount += count);
                }

            } catch (weatherError) {
                console.error(`[Alert Generation] Erro ao buscar ou processar tempo para ${city.name}:`, weatherError.message);
            }
        }
        console.log(`[${new Date().toISOString()}] [Alert Generation] Verificação concluída. ${alertsGeneratedCount} novos alertas foram gerados.`);

    } catch (error) {
        console.error(`[${new Date().toISOString()}] [Alert Generation] Erro geral na função checkWeatherAndGenerateAlerts:`, error);
    }
}

// Função auxiliar para processar a inserção de um alerta e verificar duplicados
async function processAlertInsertion(alertToInsert, updateCountCallback) {
    try {
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
            console.log(`[Alert Generation] Alerta GERADO para ${alertToInsert.city_name} (Tipo: ${alertToInsert.alert_type_id}), ID do Alerta: ${insertedAlert.rows[0].id}`);
            updateCountCallback(1); // Incrementa o contador de alertas gerados
        } else {
            // console.log(`[Alert Generation] Alerta duplicado para ${alertToInsert.city_name} (Tipo: ${alertToInsert.alert_type_id}) na data ${alertToInsert.alert_date}. Não será inserido.`);
        }
    } catch (dbError) {
        console.error(`[Alert Generation] Erro ao inserir alerta para ${alertToInsert.city_name} (Tipo: ${alertToInsert.alert_type_id}):`, dbError);
    }
}


// --- Endpoints da API (sem alterações, exceto logs menos verbosos se desejar) ---

app.get('/api/cidades', async (req, res) => {
    try {
        const result = await db.query('SELECT id, name, latitude, longitude FROM cities ORDER BY name');
        const citiesFormatted = result.rows.map(city => ({
            id: city.id, name: city.name, coords: [parseFloat(city.latitude), parseFloat(city.longitude)] 
        }));
        res.json(citiesFormatted);
    } catch (err) {
        console.error('Erro ao buscar cidades:', err); res.status(500).json({ error: 'Erro ao buscar cidades' });
    }
});

app.get('/api/tipos-alerta', async (req, res) => {
    try {
        const result = await db.query('SELECT id, name, icon, color_class AS "colorClass" FROM alert_types ORDER BY name');
        res.json(result.rows);
    } catch (err)
        {
        console.error('Erro ao buscar tipos de alerta:', err); res.status(500).json({ error: 'Erro ao buscar tipos de alerta' });
    }
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
            sunrise: new Date(wd.sys.sunrise * 1000).toLocaleTimeString('pt-BR'),
            sunset: new Date(wd.sys.sunset * 1000).toLocaleTimeString('pt-BR'),
            rain_1h: wd.rain ? wd.rain['1h'] : 0, timestamp: new Date(wd.dt * 1000).toISOString()
        };
        res.json(relevantData);
    } catch (error) {
        console.error(`Erro ao buscar dados meteorológicos para ${cityId}:`, error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Erro ao buscar dados meteorológicos.' });
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
        console.error('Erro ao buscar alertas do banco de dados:', err);
        res.status(500).json({ error: 'Erro interno do servidor ao buscar alertas.' });
    }
});

// Endpoint para disparar a geração de alertas manualmente (para teste)
app.get('/api/trigger-alert-generation', async (req, res) => {
    console.log('GET /api/trigger-alert-generation - Disparando geração de alertas...');
    try {
        await checkWeatherAndGenerateAlerts(); 
        res.status(200).json({ message: 'Verificação de alertas concluída. Verifique os logs do servidor e o banco de dados.' });
    } catch (error) {
        console.error('Erro ao disparar a geração de alertas:', error);
        res.status(500).json({ error: 'Erro ao processar a geração de alertas.' });
    }
});

// --- Agendador ---
// Descomente e ajuste a expressão cron conforme necessário.
// Exemplos de expressões cron:
// '0 * * * *'      - A cada hora, no minuto 0 (ex: 1:00, 2:00, 3:00)
// '*/30 * * * *'   - A cada 30 minutos
// '0 0 * * *'      - Todo dia à meia-noite
// '0 7 * * 1-5'    - De segunda a sexta às 7:00 da manhã

cron.schedule('*/30 * * * *', () => { // Executa no minuto 0 de cada hora
   console.log(`[${new Date().toISOString()}] [Scheduler] Executando verificação de tempo e geração de alertas agendada...`);
   checkWeatherAndGenerateAlerts();
});
console.log(`[${new Date().toISOString()}] [Scheduler] Agendador para verificação de alertas configurado para rodar a cada hora.`);


app.listen(port, () => {
    console.log(`Servidor backend a correr em http://localhost:${port}`);
    // Opcional: Executar uma vez ao iniciar o servidor para popular alertas iniciais
    // console.log(`[${new Date().toISOString()}] [Startup] Executando verificação de alertas ao iniciar...`);
    // checkWeatherAndGenerateAlerts(); 
});
