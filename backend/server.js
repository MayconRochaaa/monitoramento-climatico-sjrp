// backend/server.js

const express = require('express');
const cors = require('cors');
const axios = require('axios'); // Importa o axios
require('dotenv').config(); // Carrega variáveis de ambiente do .env

const db = require('./config/db'); 

const app = express();
const port = 3000;

app.use(cors());

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

// --- Endpoints da API ---

app.get('/api/cidades', async (req, res) => {
    try {
        // console.log('GET /api/cidades - Buscando do banco de dados...');
        const result = await db.query('SELECT id, name, latitude, longitude FROM cities ORDER BY name');
        const citiesFormatted = result.rows.map(city => ({
            id: city.id,
            name: city.name,
            coords: [parseFloat(city.latitude), parseFloat(city.longitude)] 
        }));
        // console.log(`GET /api/cidades - Enviando ${citiesFormatted.length} cidades do banco de dados.`);
        res.json(citiesFormatted);
    } catch (err) {
        console.error('Erro ao buscar cidades do banco de dados:', err);
        res.status(500).json({ error: 'Erro interno do servidor ao buscar cidades.' });
    }
});

app.get('/api/tipos-alerta', async (req, res) => {
    try {
        // console.log('GET /api/tipos-alerta - Buscando do banco de dados...');
        const result = await db.query('SELECT id, name, icon, color_class AS "colorClass" FROM alert_types ORDER BY name');
        // console.log(`GET /api/tipos-alerta - Enviando ${result.rows.length} tipos de alerta do banco de dados.`);
        res.json(result.rows);
    } catch (err) {
        console.error('Erro ao buscar tipos de alerta do banco de dados:', err);
        res.status(500).json({ error: 'Erro interno do servidor ao buscar tipos de alerta.' });
    }
});

// NOVO Endpoint: Buscar dados meteorológicos atuais para uma cidade
app.get('/api/weather/current/:cityId', async (req, res) => {
    const { cityId } = req.params;
    console.log(`GET /api/weather/current/${cityId} - Buscando dados meteorológicos...`);

    if (!OPENWEATHER_API_KEY) {
        console.error('Chave da API OpenWeather não configurada.');
        return res.status(500).json({ error: 'Configuração do servidor incompleta (API Key).' });
    }

    try {
        // 1. Buscar coordenadas da cidade no banco de dados
        const cityResult = await db.query('SELECT latitude, longitude FROM cities WHERE id = $1', [cityId]);
        
        if (cityResult.rows.length === 0) {
            return res.status(404).json({ error: 'Cidade não encontrada.' });
        }
        
        const { latitude, longitude } = cityResult.rows[0];

        // 2. Chamar a API do OpenWeather
        const weatherApiUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=pt_br`;
        
        console.log(`Chamando OpenWeather API: ${weatherApiUrl.replace(OPENWEATHER_API_KEY, '***API_KEY***')}`); // Não logar a chave
        
        const weatherResponse = await axios.get(weatherApiUrl);
        
        // 3. Formatar e retornar os dados relevantes
        const weatherData = weatherResponse.data;
        const relevantData = {
            cityId: cityId,
            temperature: weatherData.main.temp,
            feelsLike: weatherData.main.feels_like,
            humidity: weatherData.main.humidity,
            pressure: weatherData.main.pressure,
            windSpeed: weatherData.wind.speed, // m/s
            windDirection: weatherData.wind.deg,
            description: weatherData.weather[0].description,
            icon: weatherData.weather[0].icon, // Código do ícone do OpenWeather
            sunrise: new Date(weatherData.sys.sunrise * 1000).toLocaleTimeString('pt-BR'),
            sunset: new Date(weatherData.sys.sunset * 1000).toLocaleTimeString('pt-BR'),
            rain_1h: weatherData.rain ? weatherData.rain['1h'] : 0, // Volume de chuva na última hora em mm
            timestamp: new Date(weatherData.dt * 1000).toISOString()
        };

        console.log(`Dados meteorológicos para ${cityId}:`, relevantData);
        res.json(relevantData);

    } catch (error) {
        console.error(`Erro ao buscar dados meteorológicos para ${cityId}:`, error.response ? error.response.data : error.message);
        if (error.response && error.response.status === 401) {
             return res.status(401).json({ error: 'Chave da API OpenWeather inválida ou não autorizada.' });
        }
        if (error.response && error.response.status === 404 && error.response.data && error.response.data.message === 'city not found') {
            return res.status(404).json({ error: 'Cidade não encontrada pela API OpenWeather (verifique coordenadas).' });
        }
        res.status(500).json({ error: 'Erro ao buscar dados meteorológicos.' });
    }
});


app.get('/api/alertas', async (req, res) => {
    // console.log('GET /api/alertas - Recebidos query params:', req.query);
    let { startDate, endDate, cityIds, alertTypeIds } = req.query;

    try {
        let query = `
            SELECT 
                a.id, 
                a.city_id AS "cityId", 
                c.name AS "city", 
                c.latitude, 
                c.longitude,
                a.alert_type_id AS "typeId", 
                at.name AS "type", 
                TO_CHAR(a.alert_date, 'DD/MM/YYYY') AS "date",
                a.description, 
                a.severity
            FROM alerts a
            JOIN cities c ON a.city_id = c.id
            JOIN alert_types at ON a.alert_type_id = at.id
        `;
        
        const conditions = [];
        const queryParams = [];
        let paramIndex = 1;

        if (startDate) {
            conditions.push(`a.alert_date >= $${paramIndex++}`);
            queryParams.push(startDate); 
        }
        if (endDate) {
            conditions.push(`a.alert_date <= $${paramIndex++}`);
            queryParams.push(endDate); 
        }
        if (cityIds) {
            const cityIdArray = cityIds.split(',');
            const cityPlaceholders = cityIdArray.map(() => `$${paramIndex++}`).join(', ');
            conditions.push(`a.city_id IN (${cityPlaceholders})`);
            queryParams.push(...cityIdArray);
        }
        if (alertTypeIds) {
            const alertTypeIdArray = alertTypeIds.split(',');
            const typePlaceholders = alertTypeIdArray.map(() => `$${paramIndex++}`).join(', ');
            conditions.push(`a.alert_type_id IN (${typePlaceholders})`);
            queryParams.push(...alertTypeIdArray);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        query += ' ORDER BY a.alert_date DESC, c.name ASC;'; 

        // console.log('SQL Query para /api/alertas:', query);
        // console.log('SQL Params para /api/alertas:', queryParams);

        const result = await db.query(query, queryParams);

        const alertsFormatted = result.rows.map(alert => ({
            id: alert.id,
            cityId: alert.cityId,
            city: alert.city,
            typeId: alert.typeId,
            type: alert.type,
            date: alert.date, 
            description: alert.description,
            severity: alert.severity,
            coords: [parseFloat(alert.latitude), parseFloat(alert.longitude)]
        }));
        
        // console.log(`GET /api/alertas - Enviando ${alertsFormatted.length} alertas filtrados do banco de dados.`);
        res.json(alertsFormatted);

    } catch (err) {
        console.error('Erro ao buscar alertas do banco de dados:', err);
        res.status(500).json({ error: 'Erro interno do servidor ao buscar alertas.' });
    }
});


app.listen(port, () => {
    console.log(`Servidor backend a correr em http://localhost:${port}`);
});
