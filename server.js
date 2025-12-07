const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const app = express();

// ✅ CONEXIÓN A TU BASE DE DATOS
const pool = new Pool({
  connectionString: 'postgresql://stockbar_user:0EndlOqYMUMDsuYAlnjyQ35Vzs3rFh1V@dpg-d4dmar9r0fns73eplq4g-a/stockbar_db',
  ssl: {
    rejectUnauthorized: false
  }
});

// ==================== CONFIGURACIÓN UNIVERSAL ====================
const corsOptions = {
  origin: '*', // Permitir todos los orígenes
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ADMIN_EMAIL = 'thebar752@gmail.com';

// ==================== MIDDLEWARE DE AUTENTICACIÓN ====================
const authenticateToken = async (req, res, next) => {
  try {
    let token = req.headers['authorization'];
    
    if (token && token.startsWith('Bearer ')) {
      token = token.slice(7);
    } else if (req.query.token) {
      token = req.query.token;
    }
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Token requerido. Envía: Authorization: Bearer TU_TOKEN' 
      });
    }
    
    try {
      const decoded = Buffer.from(token, 'base64').toString('ascii');
      const [userId] = decoded.split(':');
      
      if (!userId || isNaN(userId)) {
        return res.status(401).json({ 
          success: false, 
          message: 'Token inválido' 
        });
      }
      
      const result = await pool.query(
        `SELECT u.*, r.nombre_rol 
         FROM usuarios u 
         LEFT JOIN roles r ON u.id_rol = r.id_rol 
         WHERE u.id_usuario = $1 AND u.estado = 1`,
        [parseInt(userId)]
      );
      
      if (result.rows.length === 0) {
        return res.status(401).json({ 
          success: false, 
          message: 'Usuario no encontrado o inactivo' 
        });
      }
      
      req.user = result.rows[0];
      next();
      
    } catch (decodeError) {
      return res.status(401).json({ 
        success: false, 
        message: 'Token inválido o expirado' 
      });
    }
    
  } catch (error) {
    console.error('❌ Error en autenticación:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor' 
    });
  }
};

// ==================== ENDPOINTS PÚBLICOS (SIN TOKEN) ====================

// Endpoint raíz
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🚀 API StockBar - Universal (Móvil + Web)',
    version: '7.0.0',
    admin_email: ADMIN_EMAIL,
    endpoints: {
      public: {
        status: 'GET /api/status',
        test: 'GET /api/test-frontend',
        login: 'POST /api/login',
        clientes: 'GET /api/public/clientes',
        productos: 'GET /api/public/productos',
        ventas: 'GET /api/public/ventas'
      },
      private: {
        note: 'Requieren token obtenido en /api/login',
        clientes: 'GET /api/clientes',
        productos: 'GET /api/productos',
        ventas: 'GET /api/ventas'
      }
    }
  });
});

// Status del sistema
app.get('/api/status', async (req, res) => {
  try {
    const dbCheck = await pool.query('SELECT NOW() as time, version() as version');
    
    res.json({
      success: true,
      message: '✅ API funcionando correctamente',
      server_time: new Date().toISOString(),
      database: {
        connected: true,
        time: dbCheck.rows[0].time,
        version: dbCheck.rows[0].version.split(' ')[1]
      },
      system: {
        platform: 'Universal API (Móvil + Web)',
        cors: 'Configurado para todos los orígenes',
        authentication: 'Token Bearer requerido para endpoints privados'
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email y contraseña son requeridos' 
      });
    }
    
    const result = await pool.query(
      `SELECT u.*, r.nombre_rol 
       FROM usuarios u 
       LEFT JOIN roles r ON u.id_rol = r.id_rol 
       WHERE u.email = $1 AND u.estado = 1`,
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Usuario no encontrado' 
      });
    }
    
    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.contraseña);
    
    if (!validPassword) {
      return res.status(401).json({ 
        success: false, 
        message: 'Contraseña incorrecta' 
      });
    }
    
    const token = Buffer.from(`${user.id_usuario}:${Date.now()}`).toString('base64');
    delete user.contraseña;
    
    res.json({
      success: true,
      message: '✅ Login exitoso',
      token: token,
      user: user,
      expires_in: '30 días'
    });
    
  } catch (error) {
    console.error('❌ Error en login:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor' 
    });
  }
});

// Endpoint para probar conexión desde el frontend
app.get('/api/test-frontend', async (req, res) => {
  try {
    const dbTest = await pool.query('SELECT COUNT(*) as total FROM productos');
    
    res.json({
      success: true,
      message: '🎉 ¡Backend funcionando correctamente!',
      frontend_compatible: true,
      mobile_compatible: true,
      web_compatible: true,
      database: {
        productos: parseInt(dbTest.rows[0].total),
        status: 'Conectada'
      },
      instructions: {
        step1: 'Hacer POST a /api/login con {email, password}',
        step2: 'Guardar el token recibido',
        step3: 'Usar token en header: Authorization: Bearer TOKEN',
        step4: 'Acceder a endpoints CRUD'
      }
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error en prueba: ' + error.message 
    });
  }
});

// ==================== ENDPOINTS PÚBLICOS DE DATOS (SIN TOKEN) ====================

// 1. CLIENTES PÚBLICOS
app.get('/api/public/clientes', async (req, res) => {
  try {
    console.log('📡 Obteniendo clientes (público)');
    
    const result = await pool.query(`
      SELECT id_cliente, nombre, tipo_documento, documento, 
             telefono, direccion, email, estado,
             CASE WHEN estado = 1 THEN 'Activo' ELSE 'Inactivo' END as estado_texto
      FROM clientes
      ORDER BY nombre
      LIMIT 100
    `);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} clientes encontrados`,
      note: 'Endpoint público - No requiere autenticación',
      data: result.rows,
      total: result.rows.length
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo clientes públicos:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo clientes' 
    });
  }
});

// 2. PRODUCTOS PÚBLICOS
app.get('/api/public/productos', async (req, res) => {
  try {
    console.log('📡 Obteniendo productos (público)');
    
    const result = await pool.query(`
      SELECT p.id_producto, p.nombre, p.stock, p.precio_compra, p.precio_venta,
             c.nombre as categoria, p.estado,
             CASE WHEN p.estado = 1 THEN 'Activo' ELSE 'Inactivo' END as estado_texto
      FROM productos p
      LEFT JOIN categorias c ON p.id_categoria = c.id_categoria
      ORDER BY p.nombre
      LIMIT 100
    `);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} productos encontrados`,
      note: 'Endpoint público - No requiere autenticación',
      data: result.rows,
      total: result.rows.length
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo productos públicos:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo productos' 
    });
  }
});

// 3. VENTAS PÚBLICAS
app.get('/api/public/ventas', async (req, res) => {
  try {
    console.log('📡 Obteniendo ventas (público)');
    
    const result = await pool.query(`
      SELECT v.id_venta, v.fecha, v.total, v.estado,
             c.nombre as cliente_nombre, c.documento as cliente_documento,
             CASE WHEN v.estado = 1 THEN 'Completada' 
                  WHEN v.estado = 0 THEN 'Pendiente'
                  WHEN v.estado = 2 THEN 'Anulada'
                  ELSE 'Desconocido' END as estado_texto
      FROM ventas v
      LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
      ORDER BY v.fecha DESC
      LIMIT 50
    `);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} ventas encontradas`,
      note: 'Endpoint público - No requiere autenticación',
      data: result.rows,
      total: result.rows.length
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo ventas públicas:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo ventas' 
    });
  }
});

// ==================== ENDPOINTS PRIVADOS (CON AUTENTICACIÓN) ====================

// 1. CLIENTES PRIVADOS
app.get('/api/clientes', authenticateToken, async (req, res) => {
  try {
    console.log(`👥 Obteniendo clientes para usuario: ${req.user.email}`);
    
    const result = await pool.query(`
      SELECT id_cliente, nombre, tipo_documento, documento, 
             telefono, direccion, email, estado,
             CASE WHEN estado = 1 THEN 'Activo' ELSE 'Inactivo' END as estado_texto
      FROM clientes
      ORDER BY nombre
    `);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} clientes encontrados`,
      note: 'Endpoint privado - Requiere autenticación',
      data: result.rows,
      total: result.rows.length
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo clientes:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo clientes' 
    });
  }
});

// 2. PRODUCTOS PRIVADOS
app.get('/api/productos', authenticateToken, async (req, res) => {
  try {
    console.log(`📦 Obteniendo productos para usuario: ${req.user.email}`);
    
    const result = await pool.query(`
      SELECT p.id_producto, p.nombre, p.stock, p.precio_compra, p.precio_venta,
             c.nombre as categoria, p.estado,
             CASE WHEN p.estado = 1 THEN 'Activo' ELSE 'Inactivo' END as estado_texto
      FROM productos p
      LEFT JOIN categorias c ON p.id_categoria = c.id_categoria
      ORDER BY p.nombre
    `);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} productos encontrados`,
      note: 'Endpoint privado - Requiere autenticación',
      data: result.rows,
      total: result.rows.length
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo productos:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo productos' 
    });
  }
});

// 3. VENTAS PRIVADAS
app.get('/api/ventas', authenticateToken, async (req, res) => {
  try {
    console.log(`💰 Obteniendo ventas para usuario: ${req.user.email}`);
    
    const result = await pool.query(`
      SELECT v.id_venta, v.fecha, v.total, v.estado,
             c.nombre as cliente_nombre, c.documento as cliente_documento,
             CASE WHEN v.estado = 1 THEN 'Completada' 
                  WHEN v.estado = 0 THEN 'Pendiente'
                  WHEN v.estado = 2 THEN 'Anulada'
                  ELSE 'Desconocido' END as estado_texto
      FROM ventas v
      LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
      ORDER BY v.fecha DESC
    `);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} ventas encontradas`,
      note: 'Endpoint privado - Requiere autenticación',
      data: result.rows,
      total: result.rows.length
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo ventas:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo ventas' 
    });
  }
});

// 4. ROLES PRIVADOS
app.get('/api/roles', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id_rol, nombre_rol, descripcion, estado,
             CASE WHEN estado = 1 THEN 'Activo' ELSE 'Inactivo' END as estado_texto
      FROM roles
      ORDER BY nombre_rol
    `);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} roles encontrados`,
      data: result.rows
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo roles:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo roles' 
    });
  }
});

// 5. USUARIOS PRIVADOS
app.get('/api/usuarios', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id_usuario, u.nombre_completo, u.email, u.usuario, u.estado,
             r.nombre_rol,
             CASE WHEN u.estado = 1 THEN 'Activo' ELSE 'Inactivo' END as estado_texto
      FROM usuarios u
      LEFT JOIN roles r ON u.id_rol = r.id_rol
      ORDER BY u.nombre_completo
    `);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} usuarios encontrados`,
      data: result.rows
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo usuarios:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo usuarios' 
    });
  }
});

// 6. CATEGORÍAS PRIVADAS
app.get('/api/categorias', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id_categoria, nombre, descripcion, estado,
             CASE WHEN estado = 1 THEN 'Activo' ELSE 'Inactivo' END as estado_texto
      FROM categorias
      ORDER BY nombre
    `);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} categorías encontradas`,
      data: result.rows
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo categorías:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo categorías' 
    });
  }
});

// 7. PROVEEDORES PRIVADOS
app.get('/api/proveedores', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id_proveedor, nombre_razon_social, documento, 
             contacto, direccion, email, estado,
             CASE WHEN estado = 1 THEN 'Activo' ELSE 'Inactivo' END as estado_texto
      FROM proveedores
      ORDER BY nombre_razon_social
    `);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} proveedores encontrados`,
      data: result.rows
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo proveedores:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo proveedores' 
    });
  }
});

// 8. COMPRAS PRIVADAS
app.get('/api/compras', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.id_compra, c.fecha, c.total, c.numero_factura, c.estado,
             p.nombre_razon_social as proveedor_nombre,
             CASE WHEN c.estado = 1 THEN 'Activa' 
                  WHEN c.estado = 0 THEN 'Anulada'
                  ELSE 'Desconocida' END as estado_texto
      FROM compras c
      LEFT JOIN proveedores p ON c.id_proveedor = p.id_proveedor
      ORDER BY c.fecha DESC
    `);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} compras encontradas`,
      data: result.rows
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo compras:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo compras' 
    });
  }
});

// ==================== FUNCIÓN PARA CREAR ADMIN SI NO EXISTE ====================
async function ensureAdminExists() {
  try {
    console.log('🔍 Verificando admin por defecto...');
    
    const adminCheck = await pool.query(
      'SELECT id_usuario, email FROM usuarios WHERE email = $1',
      [ADMIN_EMAIL]
    );
    
    if (adminCheck.rows.length === 0) {
      console.log('⚠️ Admin no encontrado. Creando...');
      
      let rolResult = await pool.query(
        'SELECT id_rol FROM roles WHERE nombre_rol = $1',
        ['Administrador']
      );
      
      let idRol;
      if (rolResult.rows.length > 0) {
        idRol = rolResult.rows[0].id_rol;
      } else {
        const newRol = await pool.query(
          'INSERT INTO roles (nombre_rol, descripcion, estado) VALUES ($1, $2, $3) RETURNING id_rol',
          ['Administrador', 'Rol con todos los permisos', 1]
        );
        idRol = newRol.rows[0].id_rol;
      }
      
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await pool.query(
        `INSERT INTO usuarios (id_rol, nombre_completo, email, usuario, contraseña, estado)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [idRol, 'Administrador', ADMIN_EMAIL, 'admin', hashedPassword, 1]
      );
      
      console.log('✅ Admin creado: email=' + ADMIN_EMAIL + ', password=admin123');
    } else {
      console.log('✅ Admin ya existe');
    }
    
  } catch (error) {
    console.error('❌ Error verificando admin:', error);
  }
}

// ==================== INICIAR SERVIDOR ====================
app.listen(PORT, '0.0.0.0', async () => {
  console.log('='.repeat(60));
  console.log('🚀 API STOCKBAR - VERSIÓN 7.0 (CON ENDPOINTS PÚBLICOS)');
  console.log('='.repeat(60));
  console.log(`📡 Puerto: ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`🔗 URL Render: https://api-stockbar.onrender.com`);
  console.log(`🔐 Admin: ${ADMIN_EMAIL} (password: admin123)`);
  console.log('='.repeat(60));
  console.log('🔓 ENDPOINTS PÚBLICOS (SIN TOKEN):');
  console.log('   GET  /api/public/clientes  - Clientes (público)');
  console.log('   GET  /api/public/productos - Productos (público)');
  console.log('   GET  /api/public/ventas    - Ventas (público)');
  console.log('   GET  /api/status           - Estado sistema');
  console.log('   POST /api/login            - Login (obtener token)');
  console.log('='.repeat(60));
  console.log('🔐 ENDPOINTS PRIVADOS (CON TOKEN):');
  console.log('   GET  /api/clientes         - Clientes (completo)');
  console.log('   GET  /api/productos        - Productos (completo)');
  console.log('   GET  /api/ventas           - Ventas (completo)');
  console.log('='.repeat(60));
  
  await ensureAdminExists();
  
  console.log('✅ Servidor listo. Esperando peticiones...');
  console.log('='.repeat(60));
});
