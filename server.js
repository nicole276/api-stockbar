const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de PostgreSQL para desarrollo y producción
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'stockbar_db',
  password: process.env.DB_PASSWORD || '1234',
  port: process.env.DB_PORT || 5432,
});

// Middlewares
app.use(cors());
app.use(express.json());

// Ruta de prueba de conexión
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as current_time');
    res.json({
      success: true,
      message: '✅ Conectado a PostgreSQL',
      environment: process.env.NODE_ENV || 'development',
      time: result.rows[0].current_time
    });
  } catch (error) {
    res.json({
      success: false,
      message: '❌ Error: ' + error.message
    });
  }
});

// Obtener productos
app.get('/api/productos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM productos ORDER BY id_gendents');
    res.json({
      success: true,
      data: result.rows,
      total: result.rowCount
    });
  } catch (error) {
    res.json({
      success: false,
      message: 'Error: ' + error.message,
      data: []
    });
  }
});

// Obtener clientes
app.get('/api/clientes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clientes ORDER BY id_clients');
    res.json({
      success: true,
      data: result.rows,
      total: result.rowCount
    });
  } catch (error) {
    res.json({
      success: false,
      message: 'Error: ' + error.message,
      data: []
    });
  }
});

// Ruta principal
app.get('/', (req, res) => {
  res.json({ 
    mensaje: '¡API de StockBar funcionando! 🚀',
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      test_db: '/api/test-db',
      productos: '/api/productos',
      clientes: '/api/clientes'
    },
    github: 'https://github.com/TU_USUARIO/api-stockbar'
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log('🚀 Servidor API StockBar iniciado');
  console.log('📡 Puerto:', PORT);
  console.log('🌐 Ambiente:', process.env.NODE_ENV || 'development');
  console.log('🔗 URL: http://localhost:' + PORT);
});