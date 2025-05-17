// backend/config/db.js
const { Pool } = require('pg');
require('dotenv').config(); // Para carregar variáveis de ambiente do ficheiro .env

// Configuração da conexão com o PostgreSQL
// Recomenda-se usar variáveis de ambiente para dados sensíveis
const pool = new Pool({
    user: process.env.DB_USER || 'seu_usuario_aqui', // Substitua ou defina em .env
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'monitoramento_climatico_db',
    password: process.env.DB_PASSWORD || 'sua_senha_aqui', // Substitua ou defina em .env
    port: parseInt(process.env.DB_PORT) || 5432,
});

pool.on('connect', () => {
    console.log('Conectado ao banco de dados PostgreSQL!');
});

pool.on('error', (err) => {
    console.error('Erro inesperado no cliente do banco de dados ocioso', err);
    process.exit(-1);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool, // Exporta o pool se precisar de acesso direto em outros lugares
};