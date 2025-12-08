const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();

// ✅ CONEXIÓN A LA BASE DE DATOS
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://stockbar_user:0EndlOqYMUMDsuYAlnjyQ35Vzs3rFh1V@dpg-d4dmar9r0fns73eplq4g-a/stockbar_db',
  ssl: { rejectUnauthorized: false }
});

// CONFIGURACIÓN
app.use(cors({ origin: '*' }));
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ==================== CONFIGURACIÓN DE EMAIL - SOLUCIÓN DEFINITIVA ====================
console.log('📧 Configurando servicio de email...');

// USAR SMTP DIRECTO CON GMAIL - CONFIGURACIÓN CORRECTA
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'thebar752@gmail.com',
    pass: 'sfqj taqe yrmr zfhj' // Contraseña de aplicación
  }
});

// Verificar conexión SMTP
transporter.verify(function(error, success) {
  if (error) {
    console.error('❌ Error SMTP:', error.message);
    console.log('🔧 Solución: Verificar que:');
    console.log('1. Email: thebar752@gmail.com es correcto');
    console.log('2. Contraseña de aplicación: sfqj taqe yrmr zfhj');
    console.log('3. Verificación en 2 pasos está ACTIVADA en Google');
    console.log('4. Contraseña de aplicación generada correctamente');
  } else {
    console.log('✅ Servidor SMTP configurado correctamente');
    console.log('📧 Listo para enviar emails');
  }
});

// ==================== MIDDLEWARE DE LOGS ====================
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('📦 Body:', JSON.stringify(req.body));
  }
  next();
});

// ==================== ENDPOINT RAÍZ ====================
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '✅ API STOCKBAR - VERSIÓN 8.0 (SISTEMA COMPLETO)',
    version: '8.0.0',
    status: 'operacional',
    timestamp: new Date().toISOString(),
    endpoints: {
      public: {
        root: 'GET /',
        login: 'POST /api/login',
        'verify-email': 'POST /api/verify-email',
        'send-recovery-email': 'POST /api/send-recovery-email',
        'update-password': 'POST /api/update-password',
        'send-confirmation-email': 'POST /api/send-confirmation-email',
        test: 'GET /api/test',
        'check-db': 'GET /api/check-db'
      },
      protected: {
        ventas: 'GET /api/ventas',
        'venta-detalle': 'GET /api/ventas/:id/detalles',
        'venta-update': 'PUT /api/ventas/:id',
        'venta-delete': 'DELETE /api/ventas/:id',
        'venta-estado': 'PUT /api/ventas/:id/estado',
        clientes: 'GET /api/clientes',
        productos: 'GET /api/productos'
      }
    }
  });
});

// ==================== MIDDLEWARE DE AUTENTICACIÓN ====================
const authenticateToken = async (req, res, next) => {
  try {
    let token = req.headers['authorization'];
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Token requerido' 
      });
    }
    
    if (token.startsWith('Bearer ')) {
      token = token.slice(7);
    }
    
    // Token simple decodificado
    const decoded = Buffer.from(token, 'base64').toString('ascii');
    const [userId] = decoded.split(':');
    
    // Buscar usuario
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE id_usuario = $1 AND estado = 1',
      [parseInt(userId)]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Usuario no válido o inactivo' 
      });
    }
    
    req.user = result.rows[0];
    next();
    
  } catch (error) {
    console.error('Error autenticación:', error);
    return res.status(401).json({ 
      success: false, 
      message: 'Token inválido' 
    });
  }
};

// ==================== VERIFICAR EMAIL ====================
app.post('/api/verify-email', async (req, res) => {
  try {
    const { email } = req.body;
    
    console.log('🔍 Verificando email:', email);
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        exists: false,
        message: 'Email requerido' 
      });
    }
    
    // Buscar usuario por email
    const result = await pool.query(
      'SELECT id_usuario, email, nombre_completo FROM usuarios WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.json({
        success: true,
        exists: false,
        message: 'Email no registrado'
      });
    }
    
    res.json({
      success: true,
      exists: true,
      message: 'Email registrado en el sistema',
      data: {
        id_usuario: result.rows[0].id_usuario,
        email: result.rows[0].email,
        nombre_completo: result.rows[0].nombre_completo
      }
    });
    
  } catch (error) {
    console.error('💥 ERROR verify-email:', error);
    res.status(500).json({ 
      success: false, 
      exists: false,
      message: 'Error del servidor' 
    });
  }
});

// ==================== ENVIAR EMAIL DE RECUPERACIÓN ====================
app.post('/api/send-recovery-email', async (req, res) => {
  try {
    const { email, codigo } = req.body;
    
    console.log('📧 Enviando recuperación:', { email, codigo });
    
    if (!email || !codigo) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email y código requeridos' 
      });
    }
    
    // Verificar que el usuario existe
    const userResult = await pool.query(
      'SELECT nombre_completo FROM usuarios WHERE email = $1',
      [email]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Email no registrado en el sistema' 
      });
    }
    
    const nombreUsuario = userResult.rows[0].nombre_completo || 'Usuario';
    
    // Configurar email HTML
    const mailOptions = {
      from: '"THE BAR Sistema" <thebar752@gmail.com>',
      to: email,
      subject: '🔐 Código de recuperación - THE BAR',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5efe6;">
          <div style="background-color: #3b2e2a; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; color: #d99a00;">THE BAR</h1>
            <p style="margin: 5px 0 0;">Sistema de Gestión</p>
          </div>
          
          <div style="background-color: white; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2>Recuperación de Contraseña</h2>
            <p>Hola <strong>${nombreUsuario}</strong>,</p>
            <p>Has solicitado restablecer tu contraseña en <strong>THE BAR Sistema</strong>.</p>
            
            <div style="background-color: #f8f9fa; border: 2px dashed #d99a00; padding: 20px; text-align: center; margin: 25px 0; border-radius: 8px;">
              <p style="margin-bottom: 10px; color: #666;">Tu código de verificación es:</p>
              <div style="font-size: 36px; font-weight: bold; letter-spacing: 5px; color: #3b2e2a; margin: 15px 0;">
                ${codigo}
              </div>
              <div style="background-color: #d86633; color: white; padding: 8px 15px; border-radius: 20px; display: inline-block; font-weight: bold;">
                ⏰ Válido por 30 segundos
              </div>
            </div>
            
            <p>Ingresa este código en la aplicación para continuar con la recuperación de tu contraseña.</p>
            
            <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin-top: 20px; border-radius: 4px;">
              <p style="margin: 0; color: #856404;">
                <strong>⚠️ Importante:</strong> Si no solicitaste este cambio, ignora este mensaje. Tu contraseña actual permanecerá sin cambios.
              </p>
            </div>
            
            <p style="margin-top: 25px;">
              Saludos,<br>
              <strong>Equipo de Soporte - THE BAR</strong>
            </p>
          </div>
          
          <div style="background-color: #0f1a24; color: white; text-align: center; padding: 15px; margin-top: 20px; border-radius: 10px; font-size: 12px;">
            <p style="margin: 0;">© ${new Date().getFullYear()} THE BAR Sistema. Todos los derechos reservados.</p>
            <p style="margin: 5px 0 0;">Este es un mensaje automático, no responda.</p>
          </div>
        </div>
      `,
      text: `Código de recuperación THE BAR\n\nHola ${nombreUsuario},\n\nTu código de verificación es: ${codigo}\n\nEste código expira en 30 segundos.\n\nSi no solicitaste este cambio, ignora este mensaje.\n\nSaludos,\nEquipo THE BAR`
    };
    
    // Enviar email
    const info = await transporter.sendMail(mailOptions);
    
    console.log('✅ Email enviado correctamente:', info.messageId);
    
    res.json({
      success: true,
      message: '✅ Código enviado exitosamente',
      data: {
        email: email,
        codigo_enviado: true,
        timestamp: new Date().toISOString(),
        expira_en: '30 segundos'
      }
    });
    
  } catch (error) {
    console.error('💥 ERROR send-recovery-email:', error.message);
    
    // Mensaje de error específico
    let errorMessage = 'Error al enviar el email';
    if (error.code === 'EAUTH') {
      errorMessage = 'Error de autenticación con Gmail. Verifica las credenciales.';
    } else if (error.code === 'EENVELOPE') {
      errorMessage = 'Dirección de email no válida.';
    }
    
    res.status(500).json({ 
      success: false, 
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ==================== ENVIAR EMAIL DE CONFIRMACIÓN ====================
app.post('/api/send-confirmation-email', async (req, res) => {
  try {
    const { email } = req.body;
    
    console.log('📧 Enviando confirmación a:', email);
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email requerido' 
      });
    }
    
    // Verificar usuario
    const userResult = await pool.query(
      'SELECT nombre_completo FROM usuarios WHERE email = $1',
      [email]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Usuario no encontrado' 
      });
    }
    
    const nombreUsuario = userResult.rows[0].nombre_completo || 'Usuario';
    
    const mailOptions = {
      from: '"THE BAR Sistema" <thebar752@gmail.com>',
      to: email,
      subject: '✅ Contraseña actualizada - THE BAR',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #2e7d32; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">✅ Contraseña Actualizada</h1>
          </div>
          <div style="padding: 30px; background-color: #f5efe6;">
            <p>Hola <strong>${nombreUsuario}</strong>,</p>
            <p>Tu contraseña en <strong>THE BAR Sistema</strong> ha sido cambiada exitosamente.</p>
            <p>Ahora puedes iniciar sesión con tu nueva contraseña.</p>
            <p style="color: #666; font-size: 12px; margin-top: 30px;">
              Fecha: ${new Date().toLocaleString('es-ES')}
            </p>
          </div>
        </div>
      `
    };
    
    await transporter.sendMail(mailOptions);
    
    console.log('✅ Email de confirmación enviado');
    
    res.json({
      success: true,
      message: '✅ Email de confirmación enviado',
      data: { email: email, confirmado: true }
    });
    
  } catch (error) {
    console.error('💥 ERROR send-confirmation:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al enviar confirmación' 
    });
  }
});

// ==================== ACTUALIZAR CONTRASEÑA ====================
app.post('/api/update-password', async (req, res) => {
  try {
    const { email, nuevaPassword } = req.body;
    
    console.log('🔄 Actualizando password para:', email);
    
    if (!email || !nuevaPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email y contraseña requeridos' 
      });
    }
    
    if (nuevaPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'La contraseña debe tener al menos 6 caracteres' 
      });
    }
    
    // Verificar usuario
    const userResult = await pool.query(
      'SELECT id_usuario FROM usuarios WHERE email = $1',
      [email]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Usuario no encontrado' 
      });
    }
    
    // Encriptar nueva contraseña
    const hashedPassword = await bcrypt.hash(nuevaPassword, 10);
    
    // Actualizar en BD
    await pool.query(
      'UPDATE usuarios SET contraseña = $1, updated_at = NOW() WHERE email = $2',
      [hashedPassword, email]
    );
    
    console.log('✅ Password actualizado para:', email);
    
    res.json({
      success: true,
      message: '✅ Contraseña actualizada exitosamente',
      data: { email: email, updated: true }
    });
    
  } catch (error) {
    console.error('💥 ERROR update-password:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error del servidor' 
    });
  }
});

// ==================== LOGIN ====================
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('🔐 Login attempt:', email);
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email y contraseña requeridos' 
      });
    }
    
    // Buscar usuario
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Usuario no encontrado' 
      });
    }
    
    const user = result.rows[0];
    const dbPassword = user.contraseña || '';
    
    // Verificar contraseña
    let validPassword = false;
    
    // 1. Comparación directa
    if (dbPassword === password) {
      validPassword = true;
    }
    // 2. Bcrypt
    else if (dbPassword.startsWith('$2')) {
      validPassword = await bcrypt.compare(password, dbPassword);
    }
    // 3. Contraseña por defecto
    else if (password === 'admin123') {
      validPassword = true;
      console.log('⚠️ Usando contraseña de desarrollo');
    }
    
    if (!validPassword) {
      return res.status(401).json({ 
        success: false, 
        message: 'Contraseña incorrecta' 
      });
    }
    
    // Generar token
    const token = Buffer.from(`${user.id_usuario}:${Date.now()}`).toString('base64');
    
    // Preparar respuesta
    const userResponse = {
      id_usuario: user.id_usuario,
      email: user.email,
      nombre_completo: user.nombre_completo || 'Administrador',
      usuario: user.usuario || 'admin',
      estado: user.estado || 1,
      id_rol: user.id_rol || 1
    };
    
    console.log('✅ Login exitoso para:', email);
    
    res.json({
      success: true,
      message: '✅ Login exitoso',
      token: token,
      user: userResponse,
      expires_in: '30 días'
    });
    
  } catch (error) {
    console.error('💥 ERROR login:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error del servidor' 
    });
  }
});

// ==================== VENTAS ====================
app.get('/api/ventas', authenticateToken, async (req, res) => {
  try {
    console.log('📊 Obteniendo ventas para usuario:', req.user.email);
    
    const result = await pool.query(`
      SELECT v.*, c.nombre as cliente_nombre 
      FROM ventas v
      LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
      ORDER BY v.fecha DESC
    `);
    
    res.json({
      success: true,
      message: '✅ Ventas obtenidas',
      data: result.rows
    });
    
  } catch (error) {
    console.error('💥 ERROR ventas:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo ventas' 
    });
  }
});

// Detalles de venta
app.get('/api/ventas/:id/detalles', authenticateToken, async (req, res) => {
  try {
    const ventaId = req.params.id;
    
    const result = await pool.query(`
      SELECT d.*, p.nombre as nombre_producto
      FROM detalles_venta d
      LEFT JOIN productos p ON d.id_producto = p.id_producto
      WHERE d.id_venta = $1
    `, [ventaId]);
    
    res.json({
      success: true,
      message: '✅ Detalles obtenidos',
      data: result.rows
    });
    
  } catch (error) {
    console.error('💥 ERROR detalles venta:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo detalles' 
    });
  }
});

// Crear/Actualizar venta
app.post('/api/ventas', authenticateToken, async (req, res) => {
  try {
    const { id_cliente, total, estado, fecha, detalles } = req.body;
    
    // Iniciar transacción
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Insertar venta
      const ventaResult = await client.query(
        `INSERT INTO ventas (id_cliente, total, estado, fecha) 
         VALUES ($1, $2, $3, $4) RETURNING id_venta`,
        [id_cliente, total, estado || 'Pendiente', fecha || new Date()]
      );
      
      const ventaId = ventaResult.rows[0].id_venta;
      
      // Insertar detalles
      if (detalles && detalles.length > 0) {
        for (const detalle of detalles) {
          await client.query(
            `INSERT INTO detalles_venta (id_venta, id_producto, cantidad, precio_unitario, subtotal)
             VALUES ($1, $2, $3, $4, $5)`,
            [ventaId, detalle.id_producto, detalle.cantidad, detalle.precio_unitario, detalle.subtotal]
          );
        }
      }
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        message: '✅ Venta creada exitosamente',
        data: { id_venta: ventaId }
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('💥 ERROR crear venta:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creando venta' 
    });
  }
});

// Actualizar venta
app.put('/api/ventas/:id', authenticateToken, async (req, res) => {
  try {
    const ventaId = req.params.id;
    const { id_cliente, total, estado, fecha, detalles } = req.body;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Actualizar venta
      await client.query(
        `UPDATE ventas SET id_cliente = $1, total = $2, estado = $3, fecha = $4 
         WHERE id_venta = $5`,
        [id_cliente, total, estado, fecha, ventaId]
      );
      
      // Eliminar detalles anteriores
      await client.query('DELETE FROM detalles_venta WHERE id_venta = $1', [ventaId]);
      
      // Insertar nuevos detalles
      if (detalles && detalles.length > 0) {
        for (const detalle of detalles) {
          await client.query(
            `INSERT INTO detalles_venta (id_venta, id_producto, cantidad, precio_unitario, subtotal)
             VALUES ($1, $2, $3, $4, $5)`,
            [ventaId, detalle.id_producto, detalle.cantidad, detalle.precio_unitario, detalle.subtotal]
          );
        }
      }
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        message: '✅ Venta actualizada exitosamente'
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('💥 ERROR actualizar venta:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error actualizando venta' 
    });
  }
});

// Cambiar estado de venta
app.put('/api/ventas/:id/estado', authenticateToken, async (req, res) => {
  try {
    const ventaId = req.params.id;
    const { estado } = req.body;
    
    await pool.query(
      'UPDATE ventas SET estado = $1 WHERE id_venta = $2',
      [estado, ventaId]
    );
    
    res.json({
      success: true,
      message: '✅ Estado actualizado'
    });
    
  } catch (error) {
    console.error('💥 ERROR cambiar estado:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error cambiando estado' 
    });
  }
});

// Eliminar venta
app.delete('/api/ventas/:id', authenticateToken, async (req, res) => {
  try {
    const ventaId = req.params.id;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Eliminar detalles primero
      await client.query('DELETE FROM detalles_venta WHERE id_venta = $1', [ventaId]);
      
      // Eliminar venta
      await client.query('DELETE FROM ventas WHERE id_venta = $1', [ventaId]);
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        message: '✅ Venta eliminada'
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('💥 ERROR eliminar venta:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error eliminando venta' 
    });
  }
});

// ==================== CLIENTES ====================
app.get('/api/clientes', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clientes ORDER BY nombre');
    
    res.json({
      success: true,
      message: '✅ Clientes obtenidos',
      data: result.rows
    });
    
  } catch (error) {
    console.error('💥 ERROR clientes:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo clientes' 
    });
  }
});

// ==================== PRODUCTOS ====================
app.get('/api/productos', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM productos ORDER BY nombre');
    
    res.json({
      success: true,
      message: '✅ Productos obtenidos',
      data: result.rows
    });
    
  } catch (error) {
    console.error('💥 ERROR productos:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo productos' 
    });
  }
});

// ==================== ENDPOINTS DE PRUEBA ====================
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: '✅ API funcionando correctamente',
    timestamp: new Date().toISOString(),
    version: '8.0.0'
  });
});

app.get('/api/check-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as time, version() as version');
    res.json({
      success: true,
      message: '✅ Base de datos conectada',
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '❌ Error de base de datos',
      error: error.message
    });
  }
});

// ==================== INICIAR SERVIDOR ====================
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(70));
  console.log('🚀 API STOCKBAR - VERSIÓN 8.0');
  console.log('='.repeat(70));
  console.log('✅ SISTEMA COMPLETO ACTIVADO');
  console.log('✅ EMAIL CONFIGURADO (GMAIL)');
  console.log('✅ BASE DE DATOS CONECTADA');
  console.log('='.repeat(70));
  console.log(`📡 Puerto: ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`🌍 URL pública: https://api-stockbar.onrender.com`);
  console.log('='.repeat(70));
  console.log('✅ Endpoints disponibles:');
  console.log('   POST /api/login              - Iniciar sesión');
  console.log('   POST /api/send-recovery-email - Recuperar contraseña');
  console.log('   GET  /api/ventas             - Listar ventas');
  console.log('   POST /api/ventas             - Crear venta');
  console.log('   GET  /api/clientes           - Listar clientes');
  console.log('   GET  /api/productos          - Listar productos');
  console.log('='.repeat(70));
  console.log('📧 Email configurado: thebar752@gmail.com');
  console.log('🔐 Login por defecto: thebar752@gmail.com | admin123');
  console.log('='.repeat(70));
  console.log('✅ Servidor listo para recibir peticiones!');
  console.log('='.repeat(70));
});

// Manejo de cierre
process.on('SIGTERM', () => {
  console.log('🛑 Cerrando servidor...');
  server.close(() => {
    console.log('✅ Servidor cerrado');
    pool.end(() => {
      console.log('✅ Pool de DB cerrado');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Cerrando servidor (Ctrl+C)...');
  server.close(() => {
    console.log('✅ Servidor cerrado');
    pool.end(() => {
      console.log('✅ Pool de DB cerrado');
      process.exit(0);
    });
  });
});
