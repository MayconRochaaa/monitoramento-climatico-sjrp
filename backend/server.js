// backend/server.js

const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();
const cron = require('node-cron');
const nodemailer = require('nodemailer');

const db = require('./config/db');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS,
    },
    tls: {
        //rejectUnauthorized: false
    }
});

// --- Função para Envio de E-mail (Modificada para aceitar múltiplos alertas) ---
async function sendNotificationEmail(toEmail, subject, alertsList) {
    if (!EMAIL_USER || !EMAIL_PASS) {
        console.warn('[Email Notification] Credenciais de e-mail não configuradas. E-mail não será enviado.');
        return;
    }
    if (!alertsList || alertsList.length === 0) {
        console.log(`[Email Notification] Nenhum alerta para enviar para ${toEmail}.`);
        return;
    }

    let alertsHtml = '';
    alertsList.forEach(alertDetails => {
        alertsHtml += `
            <div style="border: 1px solid #ddd; padding: 10px; margin-bottom: 15px; border-radius: 5px; background-color: #f9f9f9;">
                <h3 style="color: #555; margin-top: 0;">Alerta em ${alertDetails.cityName}</h3>
                <ul style="list-style-type: none; padding-left: 0;">
                    <li><strong>Data do Alerta:</strong> ${alertDetails.alertDate}</li>
                    <li><strong>Tipo de Alerta:</strong> ${alertDetails.alertType}</li>
                    <li><strong>Descrição:</strong> ${alertDetails.description}</li>
                    <li><strong>Severidade:</strong> ${alertDetails.severity}</li>
                </ul>
            </div>
        `;
    });

    const htmlBody = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #eee; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="text-align: center; border-bottom: 1px solid #eee; padding-bottom: 15px; margin-bottom: 20px;">
                    <h1 style="color: #c0392b; margin: 0;">Resumo de Alertas Climáticos</h1>
                </div>
                <p>Olá,</p>
                <p>Foram gerados os seguintes alertas climáticos para áreas de seu interesse:</p>
                ${alertsHtml}
                <p>Por favor, tome as precauções necessárias.</p>
                <p>Para mais detalhes, acesse nossa plataforma de monitoramento.</p>
                <br>
                <p style="text-align: center; font-size: 0.9em; color: #777;">
                    Atenciosamente,<br>
                    <strong>Equipe do Monitoramento Climático SJRP</strong>
                </p>
            </div>
        </div>
    `;

    const mailOptions = {
        from: `"Monitoramento Climático SJRP" <${EMAIL_USER}>`,
        to: toEmail,
        subject: subject,
        html: htmlBody,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[Email Notification] E-mail de resumo de alertas enviado para: ${toEmail} | Assunto: ${subject}`);
    } catch (error) {
        console.error(`[Email Notification] Erro ao enviar e-mail de resumo para ${toEmail}:`, error.message);
    }
}

const formatDateToYYYYMMDD = (date) => {
    const d = new Date(date);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const ALERT_RULES = {
    TEMP_THRESHOLD_MAX_CURRENT: 40,
    TEMP_THRESHOLD_MAX_FORECAST: 38,
    RAIN_THRESHOLD_CURRENT: 20,
    POP_THRESHOLD_FORECAST: 0.6,
    WIND_THRESHOLD_MS: 11.11,
};

// Modificada para coletar alertas em vez de enviar imediatamente
async function processAlertInsertion(alertToInsert, alertsByUserEmail, updateCountCallback) {
    try {
        const typeExistsResult = await db.query('SELECT id, name FROM alert_types WHERE id = $1', [alertToInsert.alert_type_id]);
        if (typeExistsResult.rows.length === 0) {
            console.warn(`[Alert Generation] Tipo de alerta ID '${alertToInsert.alert_type_id}' não encontrado. Alerta para ${alertToInsert.city_name} não será inserido.`);
            return;
        }
        const alertTypeName = typeExistsResult.rows[0].name;

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
                const alertDetailsForEmail = {
                    cityName: alertToInsert.city_name,
                    alertDate: new Date(alertToInsert.alert_date + "T00:00:00Z").toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
                    alertType: alertTypeName,
                    description: alertToInsert.description,
                    severity: alertToInsert.severity,
                };

                subscribersResult.rows.forEach(row => {
                    const email = row.email;
                    if (!alertsByUserEmail[email]) {
                        alertsByUserEmail[email] = [];
                    }
                    alertsByUserEmail[email].push(alertDetailsForEmail);
                    console.log(`[Notification Prep] Alerta ID ${newAlertId} para ${alertToInsert.city_name} adicionado à fila de e-mail para ${email}`);
                });
            }
        }
    } catch (dbError) {
        console.error(`[Alert Generation] Erro DB ao inserir/processar alerta para ${alertToInsert.city_name} (Tipo: ${alertToInsert.alert_type_id}):`, dbError.message);
    }
}

// Modificada para enviar e-mails agrupados no final
async function checkWeatherAndGenerateAlerts() {
    console.log(`[${new Date().toISOString()}] [Alert Generation] Iniciando verificação de tempo (atual e previsão)...`);
    let alertsGeneratedCount = 0;
    const alertsByUserEmail = {}; // Estrutura para coletar alertas por e-mail

    try {
        const citiesResult = await db.query('SELECT id, name, latitude, longitude FROM cities');
        const cities = citiesResult.rows;
        if (cities.length === 0) { console.log('[Alert Generation] Nenhuma cidade encontrada.'); return; }
        const todayYYYYMMDD = formatDateToYYYYMMDD(new Date());

        for (const city of cities) {
            if (!city.latitude || !city.longitude) { console.warn(`[Alert Generation] Coordenadas ausentes para ${city.name}.`); continue; }

            // 1. Verificar Tempo Atual
            try {
                const weatherApiUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${city.latitude}&lon=${city.longitude}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=pt_br`;
                const weatherResponse = await axios.get(weatherApiUrl);
                const weatherData = weatherResponse.data;
                const temperature = weatherData.main.temp;
                const rain1h = weatherData.rain ? weatherData.rain['1h'] : 0;
                const windSpeed = weatherData.wind.speed;

                if (temperature > ALERT_RULES.TEMP_THRESHOLD_MAX_CURRENT) {
                    await processAlertInsertion({ city_id: city.id, city_name: city.name, alert_type_id: 'onda_calor', alert_date: todayYYYYMMDD, description: `Temperatura atual elevada de ${temperature.toFixed(1)}°C.`, severity: 'alta' }, alertsByUserEmail, (count) => alertsGeneratedCount += count);
                }
                if (rain1h > ALERT_RULES.RAIN_THRESHOLD_CURRENT) {
                    await processAlertInsertion({ city_id: city.id, city_name: city.name, alert_type_id: 'chuvas_fortes', alert_date: todayYYYYMMDD, description: `Chuva intensa atual de ${rain1h}mm/h.`, severity: 'alta' }, alertsByUserEmail, (count) => alertsGeneratedCount += count);
                }
                if (windSpeed > ALERT_RULES.WIND_THRESHOLD_MS) {
                    const windSpeedKmh = (windSpeed * 3.6).toFixed(1);
                    await processAlertInsertion({ city_id: city.id, city_name: city.name, alert_type_id: 'ventos_fortes', alert_date: todayYYYYMMDD, description: `Ventos fortes atuais de ${windSpeedKmh} km/h.`, severity: 'media' }, alertsByUserEmail, (count) => alertsGeneratedCount += count);
                }
            } catch (currentWeatherError) { console.error(`[Alert Generation] Erro tempo ATUAL para ${city.name}:`, currentWeatherError.message); }

            // 2. Verificar Previsão
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
                        await processAlertInsertion({ city_id: city.id, city_name: city.name, alert_type_id: 'onda_calor', alert_date: forecastDate, description: `Previsão de temperatura máxima de ${maxTemp.toFixed(1)}°C.`, severity: 'media' }, alertsByUserEmail, (count) => alertsGeneratedCount += count);
                    }
                    const hasRainDescription = dayData.weatherDescriptions.some(desc => desc.includes('chuva') || desc.includes('tempestade') || desc.includes('temporal'));
                    if (maxPop > ALERT_RULES.POP_THRESHOLD_FORECAST && hasRainDescription) {
                        await processAlertInsertion({ city_id: city.id, city_name: city.name, alert_type_id: 'chuvas_fortes', alert_date: forecastDate, description: `Previsão de ${ (maxPop * 100).toFixed(0)}% de chance de chuva.`, severity: 'media' }, alertsByUserEmail, (count) => alertsGeneratedCount += count);
                    }
                    if (maxWindSpeed > ALERT_RULES.WIND_THRESHOLD_MS) {
                        const windSpeedKmh = (maxWindSpeed * 3.6).toFixed(1);
                        await processAlertInsertion({ city_id: city.id, city_name: city.name, alert_type_id: 'ventos_fortes', alert_date: forecastDate, description: `Previsão de ventos fortes de até ${windSpeedKmh} km/h.`, severity: 'media' }, alertsByUserEmail, (count) => alertsGeneratedCount += count);
                    }
                }
            } catch (forecastError) { console.error(`[Alert Generation] Erro PREVISÃO para ${city.name}:`, forecastError.message); }
        }
        console.log(`[${new Date().toISOString()}] [Alert Generation] Verificação concluída. ${alertsGeneratedCount} novos alertas gerados (atuais e futuros).`);

        // Enviar e-mails agrupados
        console.log(`[${new Date().toISOString()}] [Email Dispatch] Preparando para enviar e-mails agrupados...`);
        for (const email in alertsByUserEmail) {
            if (alertsByUserEmail[email].length > 0) {
                const subject = `Resumo de Alertas Climáticos (${alertsByUserEmail[email].length} alerta(s))`;
                await sendNotificationEmail(email, subject, alertsByUserEmail[email]);
            }
        }
        console.log(`[${new Date().toISOString()}] [Email Dispatch] Envio de e-mails agrupados concluído.`);

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

        let userResult = await client.query('SELECT id FROM users WHERE email = $1', [email]);
        let userId;

        if (userResult.rows.length > 0) {
            userId = userResult.rows[0].id;
            console.log(`Utilizador existente encontrado com ID: ${userId} para email: ${email}. Atualizando subscrições...`);
            await client.query('DELETE FROM user_city_subscriptions WHERE user_id = $1', [userId]);
            console.log(`Subscrições antigas para user_id ${userId} removidas.`);
        } else {
            const insertUserResult = await client.query('INSERT INTO users (email) VALUES ($1) RETURNING id', [email]);
            userId = insertUserResult.rows[0].id;
            isNewUser = true;
            console.log(`Novo utilizador criado com ID: ${userId} para email: ${email}`);
        }

        let newSubscriptionsCount = 0;
        for (const cityId of cityIds) {
            const cityExists = await client.query('SELECT id FROM cities WHERE id = $1', [cityId]);
            if (cityExists.rows.length === 0) {
                console.warn(`Tentativa de subscrever cidade inexistente (ID: ${cityId}) para o utilizador ${email}. A ignorar esta cidade.`);
                continue;
            }
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

app.post('/api/test-email', async (req, res) => {
    const { toEmail, subject, text } = req.body; // 'text' aqui pode ser uma string simples
    if (!toEmail || !subject || !text) {
        return res.status(400).json({ error: "Campos 'toEmail', 'subject', e 'text' são obrigatórios." });
    }
    try {
        // Para simular a nova estrutura, vamos envolver 'text' como se fosse uma lista de um alerta
        const testAlertDetailsList = [{
            cityName: "Cidade Teste",
            alertDate: new Date().toLocaleDateString('pt-BR'),
            alertType: "Tipo Teste",
            description: text, // Usando o texto fornecido como descrição
            severity: "teste"
        }];
        await sendNotificationEmail(toEmail, subject, testAlertDetailsList);
        res.status(200).json({ message: `Tentativa de envio de e-mail de teste para ${toEmail} concluída.` });
    } catch (error) {
        console.error('Erro ao enviar e-mail de teste:', error);
        res.status(500).json({ error: 'Erro ao enviar e-mail de teste.', details: error.message });
    }
});

cron.schedule('0 * * * *', () => {
   console.log(`[${new Date().toISOString()}] [Scheduler] Executando verificação agendada...`);
   checkWeatherAndGenerateAlerts();
});
console.log(`[${new Date().toISOString()}] [Scheduler] Agendador configurado para rodar a cada hora.`);
// checkWeatherAndGenerateAlerts(); 

app.listen(port, () => {
    console.log(`Servidor backend a correr em http://localhost:${port}`);
});
