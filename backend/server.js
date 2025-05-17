// backend/server.js

const express = require('express');
const cors = require('cors');
const db = require('./config/db'); // Importa a configuração do banco de dados

const app = express();
const port = 3000;

app.use(cors());

// --- Endpoints da API ---

app.get('/api/cidades', async (req, res) => {
    try {
        console.log('GET /api/cidades - Buscando do banco de dados...');
        const result = await db.query('SELECT id, name, latitude, longitude FROM cities ORDER BY name');
        
        // Transforma o resultado para o formato esperado pelo frontend (com coords como array)
        const citiesFormatted = result.rows.map(city => ({
            id: city.id,
            name: city.name,
            coords: [parseFloat(city.latitude), parseFloat(city.longitude)] 
        }));

        console.log(`GET /api/cidades - Enviando ${citiesFormatted.length} cidades do banco de dados.`);
        res.json(citiesFormatted);
    } catch (err) {
        console.error('Erro ao buscar cidades do banco de dados:', err);
        res.status(500).json({ error: 'Erro interno do servidor ao buscar cidades.' });
    }
});

app.get('/api/tipos-alerta', async (req, res) => {
    try {
        console.log('GET /api/tipos-alerta - Buscando do banco de dados...');
        const result = await db.query('SELECT id, name, icon, color_class AS "colorClass" FROM alert_types ORDER BY name');
        console.log(`GET /api/tipos-alerta - Enviando ${result.rows.length} tipos de alerta do banco de dados.`);
        res.json(result.rows);
    } catch (err) {
        console.error('Erro ao buscar tipos de alerta do banco de dados:', err);
        res.status(500).json({ error: 'Erro interno do servidor ao buscar tipos de alerta.' });
    }
});

app.get('/api/alertas', async (req, res) => {
    console.log('GET /api/alertas - Recebidos query params:', req.query);
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
                TO_CHAR(a.alert_date, 'DD/MM/YYYY') AS "date", -- Formata a data para DD/MM/YYYY
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
            queryParams.push(startDate); // Espera formato YYYY-MM-DD
        }
        if (endDate) {
            conditions.push(`a.alert_date <= $${paramIndex++}`);
            queryParams.push(endDate); // Espera formato YYYY-MM-DD
        }
        if (cityIds) {
            const cityIdArray = cityIds.split(',');
            // Cria placeholders como ($X, $Y, $Z)
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

        query += ' ORDER BY a.alert_date DESC, c.name ASC;'; // Ordena os resultados

        console.log('SQL Query para /api/alertas:', query);
        console.log('SQL Params para /api/alertas:', queryParams);

        const result = await db.query(query, queryParams);

        // Formata a resposta para incluir 'coords' como um array
        const alertsFormatted = result.rows.map(alert => ({
            id: alert.id,
            cityId: alert.cityId,
            city: alert.city,
            typeId: alert.typeId,
            type: alert.type,
            date: alert.date, // Já formatada pelo TO_CHAR
            description: alert.description,
            severity: alert.severity,
            coords: [parseFloat(alert.latitude), parseFloat(alert.longitude)]
        }));
        
        console.log(`GET /api/alertas - Enviando ${alertsFormatted.length} alertas filtrados do banco de dados.`);
        res.json(alertsFormatted);

    } catch (err) {
        console.error('Erro ao buscar alertas do banco de dados:', err);
        res.status(500).json({ error: 'Erro interno do servidor ao buscar alertas.' });
    }
});


app.listen(port, () => {
    console.log(`Servidor backend a correr em http://localhost:${port}`);
});