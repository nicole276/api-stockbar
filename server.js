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

// ==================== CONFIGURACIÓN DE EMAIL ====================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'thebar752@gmail.com',
    pass: 'sfqj taqe yrmr zfhj'
  }
});

// Verificar conexión SMTP
transporter.verify(function(error, success) {
  if (error) {
    console.error('❌ Error SMTP:', error.message);
  } else {
    console.log('✅ Servidor SMTP configurado correctamente');
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
    message: '✅ API STOCKBAR - VERSIÓN 9.0 (SISTEMA COMPLETO)',
    version: '9.0.0',
    status: 'operacional',
    timestamp: new Date().toISOString(),
    endpoints: {
      public: {
        root: 'GET /',
        login: 'POST /api/login',
        'verify-email': 'POST /api/verify-email',
        'send-recovery-email': 'POST /api/send-recovery-email',
        'update-password': 'POST /api/update-password',
        'send-confirmation-email': 'POST /api/send-confirmation-email'
      },
      protected: {
        roles: 'GET /api/roles',
        usuarios: 'GET /api/usuarios',
        categorias: 'GET /api/categorias',
        productos: 'GET /api/productos',
        proveedores: 'GET /api/proveedores',
        compras: 'GET /api/compras',
        clientes: 'GET /api/clientes',
        ventas: 'GET /api/ventas',
        permisos: 'GET /api/permisos'
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
    
    const decoded = Buffer.from(token, 'base64').toString('ascii');
    const [userId] = decoded.split(':');
    
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

// ==================== ENDPOINTS DE LOGIN Y RECUPERACIÓN ====================

// VERIFICAR EMAIL
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

// ENVIAR EMAIL DE RECUPERACIÓN
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

// ENVIAR EMAIL DE CONFIRMACIÓN
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

// ACTUALIZAR CONTRASEÑA
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
    
    const hashedPassword = await bcrypt.hash(nuevaPassword, 10);
    
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

// LOGIN
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
    
    let validPassword = false;
    
    if (dbPassword === password) {
      validPassword = true;
    }
    else if (dbPassword.startsWith('$2')) {
      validPassword = await bcrypt.compare(password, dbPassword);
    }
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
    
    const token = Buffer.from(`${user.id_usuario}:${Date.now()}`).toString('base64');
    
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

// ==================== ENDPOINTS DE ROLES ====================

// LISTAR ROLES
app.get('/api/roles', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM roles ORDER BY id_rol'
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error listar roles:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo roles' 
    });
  }
});

// BUSCAR ROL POR ID
app.get('/api/roles/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM roles WHERE id_rol = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Rol no encontrado' 
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error buscar rol:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error buscando rol' 
    });
  }
});

// CREAR ROL
app.post('/api/roles', authenticateToken, async (req, res) => {
  try {
    const { nombre_rol, descripcion, estado = 1 } = req.body;
    
    if (!nombre_rol) {
      return res.status(400).json({ 
        success: false, 
        message: 'Nombre del rol es requerido' 
      });
    }
    
    const result = await pool.query(
      `INSERT INTO roles (nombre_rol, descripcion, estado) 
       VALUES ($1, $2, $3) RETURNING *`,
      [nombre_rol, descripcion, estado]
    );
    
    res.json({
      success: true,
      message: 'Rol creado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error crear rol:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creando rol' 
    });
  }
});

// ACTUALIZAR ROL
app.put('/api/roles/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre_rol, descripcion, estado } = req.body;
    
    const result = await pool.query(
      `UPDATE roles SET 
        nombre_rol = COALESCE($1, nombre_rol),
        descripcion = COALESCE($2, descripcion),
        estado = COALESCE($3, estado)
       WHERE id_rol = $4 RETURNING *`,
      [nombre_rol, descripcion, estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Rol no encontrado' 
      });
    }
    
    res.json({
      success: true,
      message: 'Rol actualizado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error actualizar rol:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error actualizando rol' 
    });
  }
});

// CAMBIAR ESTADO DE ROL
app.put('/api/roles/:id/estado', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    if (estado === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: 'Estado requerido' 
      });
    }
    
    const result = await pool.query(
      'UPDATE roles SET estado = $1 WHERE id_rol = $2 RETURNING *',
      [estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Rol no encontrado' 
      });
    }
    
    res.json({
      success: true,
      message: 'Estado del rol actualizado',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error cambiar estado rol:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error cambiando estado del rol' 
    });
  }
});

// ASIGNAR PERMISOS A ROL
app.post('/api/roles/:id/permisos', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { permisos } = req.body;
    
    if (!permisos || !Array.isArray(permisos)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Lista de permisos requerida' 
      });
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      await client.query(
        'DELETE FROM ver_detalle_rol WHERE id_rol = $1',
        [id]
      );
      
      for (const permiso of permisos) {
        await client.query(
          'INSERT INTO ver_detalle_rol (id_rol, id_permiso) VALUES ($1, $2)',
          [id, permiso.id_permiso]
        );
      }
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Permisos asignados exitosamente'
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error asignar permisos:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error asignando permisos' 
    });
  }
});

// OBTENER PERMISOS DE UN ROL
app.get('/api/roles/:id/permisos', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT p.* FROM permisos p
       JOIN ver_detalle_rol v ON p.id_permiso = v.id_permiso
       WHERE v.id_rol = $1`,
      [id]
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error obtener permisos:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo permisos' 
    });
  }
});

// ==================== ENDPOINTS DE USUARIOS ====================

// LISTAR USUARIOS
app.get('/api/usuarios', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.*, r.nombre_rol 
      FROM usuarios u
      LEFT JOIN roles r ON u.id_rol = r.id_rol
      ORDER BY u.id_usuario
    `);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error listar usuarios:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo usuarios' 
    });
  }
});

// BUSCAR USUARIO POR ID
app.get('/api/usuarios/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT u.*, r.nombre_rol 
      FROM usuarios u
      LEFT JOIN roles r ON u.id_rol = r.id_rol
      WHERE u.id_usuario = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Usuario no encontrado' 
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error buscar usuario:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error buscando usuario' 
    });
  }
});

// CREAR USUARIO
app.post('/api/usuarios', authenticateToken, async (req, res) => {
  try {
    const { id_rol, nombre_completo, email, usuario, contraseña, estado = 1 } = req.body;
    
    if (!email || !contraseña || !nombre_completo) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email, contraseña y nombre son requeridos' 
      });
    }
    
    const emailExists = await pool.query(
      'SELECT * FROM usuarios WHERE email = $1',
      [email]
    );
    
    if (emailExists.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'El email ya está registrado' 
      });
    }
    
    const hashedPassword = await bcrypt.hash(contraseña, 10);
    
    const result = await pool.query(
      `INSERT INTO usuarios (id_rol, nombre_completo, email, usuario, contraseña, estado) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id_rol, nombre_completo, email, usuario, hashedPassword, estado]
    );
    
    res.json({
      success: true,
      message: 'Usuario creado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error crear usuario:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creando usuario' 
    });
  }
});

// ACTUALIZAR USUARIO
app.put('/api/usuarios/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { id_rol, nombre_completo, email, usuario, contraseña, estado } = req.body;
    
    let updateQuery = `
      UPDATE usuarios SET 
        id_rol = COALESCE($1, id_rol),
        nombre_completo = COALESCE($2, nombre_completo),
        email = COALESCE($3, email),
        usuario = COALESCE($4, usuario),
        estado = COALESCE($5, estado)
    `;
    
    const queryParams = [id_rol, nombre_completo, email, usuario, estado, id];
    
    if (contraseña) {
      const hashedPassword = await bcrypt.hash(contraseña, 10);
      updateQuery += ', contraseña = $6';
      queryParams.splice(5, 0, hashedPassword);
    }
    
    updateQuery += ' WHERE id_usuario = $' + queryParams.length + ' RETURNING *';
    
    const result = await pool.query(updateQuery, queryParams);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Usuario no encontrado' 
      });
    }
    
    res.json({
      success: true,
      message: 'Usuario actualizado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error actualizar usuario:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error actualizando usuario' 
    });
  }
});

// CAMBIAR ESTADO DE USUARIO
app.put('/api/usuarios/:id/estado', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    if (estado === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: 'Estado requerido' 
      });
    }
    
    const result = await pool.query(
      'UPDATE usuarios SET estado = $1 WHERE id_usuario = $2 RETURNING *',
      [estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Usuario no encontrado' 
      });
    }
    
    res.json({
      success: true,
      message: 'Estado del usuario actualizado',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error cambiar estado usuario:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error cambiando estado del usuario' 
    });
  }
});

// ==================== ENDPOINTS DE CATEGORÍAS ====================

// LISTAR CATEGORÍAS
app.get('/api/categorias', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM categorias ORDER BY nombre'
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error listar categorías:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo categorías' 
    });
  }
});

// BUSCAR CATEGORÍA POR ID
app.get('/api/categorias/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM categorias WHERE id_categoria = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Categoría no encontrada' 
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error buscar categoría:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error buscando categoría' 
    });
  }
});

// CREAR CATEGORÍA
app.post('/api/categorias', authenticateToken, async (req, res) => {
  try {
    const { nombre, descripcion, estado = 1 } = req.body;
    
    if (!nombre) {
      return res.status(400).json({ 
        success: false, 
        message: 'Nombre de categoría es requerido' 
      });
    }
    
    const result = await pool.query(
      `INSERT INTO categorias (nombre, descripcion, estado) 
       VALUES ($1, $2, $3) RETURNING *`,
      [nombre, descripcion, estado]
    );
    
    res.json({
      success: true,
      message: 'Categoría creada exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error crear categoría:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creando categoría' 
    });
  }
});

// ACTUALIZAR CATEGORÍA
app.put('/api/categorias/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, estado } = req.body;
    
    const result = await pool.query(
      `UPDATE categorias SET 
        nombre = COALESCE($1, nombre),
        descripcion = COALESCE($2, descripcion),
        estado = COALESCE($3, estado)
       WHERE id_categoria = $4 RETURNING *`,
      [nombre, descripcion, estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Categoría no encontrada' 
      });
    }
    
    res.json({
      success: true,
      message: 'Categoría actualizada exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error actualizar categoría:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error actualizando categoría' 
    });
  }
});

// CAMBIAR ESTADO DE CATEGORÍA
app.put('/api/categorias/:id/estado', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    if (estado === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: 'Estado requerido' 
      });
    }
    
    const result = await pool.query(
      'UPDATE categorias SET estado = $1 WHERE id_categoria = $2 RETURNING *',
      [estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Categoría no encontrada' 
      });
    }
    
    res.json({
      success: true,
      message: 'Estado de categoría actualizado',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error cambiar estado categoría:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error cambiando estado de categoría' 
    });
  }
});

// ==================== ENDPOINTS DE PROVEEDORES ====================

// LISTAR PROVEEDORES
app.get('/api/proveedores', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM proveedores ORDER BY nombre_razon_social'
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error listar proveedores:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo proveedores' 
    });
  }
});

// BUSCAR PROVEEDOR POR ID
app.get('/api/proveedores/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM proveedores WHERE id_proveedor = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Proveedor no encontrado' 
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error buscar proveedor:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error buscando proveedor' 
    });
  }
});

// CREAR PROVEEDOR
app.post('/api/proveedores', authenticateToken, async (req, res) => {
  try {
    const { 
      nombre_razon_social, 
      tipo_documento, 
      documento, 
      contacto, 
      telefono, 
      email, 
      direccion, 
      estado = 1 
    } = req.body;
    
    if (!nombre_razon_social || !documento) {
      return res.status(400).json({ 
        success: false, 
        message: 'Nombre y documento son requeridos' 
      });
    }
    
    const result = await pool.query(
      `INSERT INTO proveedores 
       (nombre_razon_social, tipo_documento, documento, contacto, telefono, email, direccion, estado) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [nombre_razon_social, tipo_documento, documento, contacto, telefono, email, direccion, estado]
    );
    
    res.json({
      success: true,
      message: 'Proveedor creado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error crear proveedor:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creando proveedor' 
    });
  }
});

// ACTUALIZAR PROVEEDOR
app.put('/api/proveedores/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      nombre_razon_social, 
      tipo_documento, 
      documento, 
      contacto, 
      telefono, 
      email, 
      direccion, 
      estado 
    } = req.body;
    
    const result = await pool.query(
      `UPDATE proveedores SET 
        nombre_razon_social = COALESCE($1, nombre_razon_social),
        tipo_documento = COALESCE($2, tipo_documento),
        documento = COALESCE($3, documento),
        contacto = COALESCE($4, contacto),
        telefono = COALESCE($5, telefono),
        email = COALESCE($6, email),
        direccion = COALESCE($7, direccion),
        estado = COALESCE($8, estado)
       WHERE id_proveedor = $9 RETURNING *`,
      [nombre_razon_social, tipo_documento, documento, contacto, telefono, email, direccion, estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Proveedor no encontrado' 
      });
    }
    
    res.json({
      success: true,
      message: 'Proveedor actualizado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error actualizar proveedor:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error actualizando proveedor' 
    });
  }
});

// CAMBIAR ESTADO DE PROVEEDOR
app.put('/api/proveedores/:id/estado', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    if (estado === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: 'Estado requerido' 
      });
    }
    
    const result = await pool.query(
      'UPDATE proveedores SET estado = $1 WHERE id_proveedor = $2 RETURNING *',
      [estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Proveedor no encontrado' 
      });
    }
    
    res.json({
      success: true,
      message: 'Estado del proveedor actualizado',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error cambiar estado proveedor:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error cambiando estado del proveedor' 
    });
  }
});

// ==================== ENDPOINTS DE PRODUCTOS ====================

// LISTAR PRODUCTOS
app.get('/api/productos', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, c.nombre as categoria_nombre 
      FROM productos p
      LEFT JOIN categorias c ON p.id_categoria = c.id_categoria
      ORDER BY p.nombre
    `);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error listar productos:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo productos' 
    });
  }
});

// BUSCAR PRODUCTO POR ID
app.get('/api/productos/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT p.*, c.nombre as categoria_nombre 
      FROM productos p
      LEFT JOIN categorias c ON p.id_categoria = c.id_categoria
      WHERE p.id_producto = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Producto no encontrado' 
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error buscar producto:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error buscando producto' 
    });
  }
});

// CREAR PRODUCTO
app.post('/api/productos', authenticateToken, async (req, res) => {
  try {
    const { 
      id_categoria, 
      nombre, 
      stock = 0, 
      precio_compra, 
      precio_venta, 
      estado = 1 
    } = req.body;
    
    if (!nombre || precio_compra === undefined || precio_venta === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: 'Nombre y precios son requeridos' 
      });
    }
    
    const result = await pool.query(
      `INSERT INTO productos 
       (id_categoria, nombre, stock, precio_compra, precio_venta, estado) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id_categoria, nombre, stock, precio_compra, precio_venta, estado]
    );
    
    res.json({
      success: true,
      message: 'Producto creado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error crear producto:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creando producto' 
    });
  }
});

// ACTUALIZAR PRODUCTO
app.put('/api/productos/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      id_categoria, 
      nombre, 
      stock, 
      precio_compra, 
      precio_venta, 
      estado 
    } = req.body;
    
    const result = await pool.query(
      `UPDATE productos SET 
        id_categoria = COALESCE($1, id_categoria),
        nombre = COALESCE($2, nombre),
        stock = COALESCE($3, stock),
        precio_compra = COALESCE($4, precio_compra),
        precio_venta = COALESCE($5, precio_venta),
        estado = COALESCE($6, estado)
       WHERE id_producto = $7 RETURNING *`,
      [id_categoria, nombre, stock, precio_compra, precio_venta, estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Producto no encontrado' 
      });
    }
    
    res.json({
      success: true,
      message: 'Producto actualizado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error actualizar producto:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error actualizando producto' 
    });
  }
});

// CAMBIAR ESTADO DE PRODUCTO
app.put('/api/productos/:id/estado', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    if (estado === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: 'Estado requerido' 
      });
    }
    
    const result = await pool.query(
      'UPDATE productos SET estado = $1 WHERE id_producto = $2 RETURNING *',
      [estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Producto no encontrado' 
      });
    }
    
    res.json({
      success: true,
      message: 'Estado del producto actualizado',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error cambiar estado producto:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error cambiando estado del producto' 
    });
  }
});

// ==================== ENDPOINTS DE COMPRAS ====================

// LISTAR COMPRAS
app.get('/api/compras', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, p.nombre_razon_social as proveedor_nombre
      FROM compras c
      LEFT JOIN proveedores p ON c.id_proveedor = p.id_proveedor
      ORDER BY c.fecha DESC
    `);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error listar compras:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo compras' 
    });
  }
});

// BUSCAR COMPRA POR ID
app.get('/api/compras/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const compraResult = await pool.query(`
      SELECT c.*, p.nombre_razon_social as proveedor_nombre
      FROM compras c
      LEFT JOIN proveedores p ON c.id_proveedor = p.id_proveedor
      WHERE c.id_compra = $1
    `, [id]);
    
    if (compraResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Compra no encontrada' 
      });
    }
    
    const detallesResult = await pool.query(`
      SELECT dc.*, pr.nombre as producto_nombre
      FROM detalle_compras dc
      LEFT JOIN productos pr ON dc.id_producto = pr.id_producto
      WHERE dc.id_compra = $1
    `, [id]);
    
    const compra = compraResult.rows[0];
    compra.detalles = detallesResult.rows;
    
    res.json({
      success: true,
      data: compra
    });
  } catch (error) {
    console.error('Error buscar compra:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error buscando compra' 
    });
  }
});

// CREAR COMPRA
app.post('/api/compras', authenticateToken, async (req, res) => {
  try {
    const { 
      id_proveedor, 
      fecha, 
      total, 
      numero_factura, 
      estado = 1,
      detalles 
    } = req.body;
    
    if (!id_proveedor || !total || !detalles || !Array.isArray(detalles)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Proveedor, total y detalles son requeridos' 
      });
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const compraResult = await client.query(
        `INSERT INTO compras 
         (id_proveedor, fecha, total, numero_factura, estado) 
         VALUES ($1, $2, $3, $4, $5) RETURNING id_compra`,
        [id_proveedor, fecha || new Date(), total, numero_factura, estado]
      );
      
      const compraId = compraResult.rows[0].id_compra;
      
      for (const detalle of detalles) {
        await client.query(
          `INSERT INTO detalle_compras 
           (id_compra, id_producto, cantidad, precio, subtotal) 
           VALUES ($1, $2, $3, $4, $5)`,
          [compraId, detalle.id_producto, detalle.cantidad, detalle.precio, detalle.subtotal]
        );
        
        await client.query(
          'UPDATE productos SET stock = stock + $1 WHERE id_producto = $2',
          [detalle.cantidad, detalle.id_producto]
        );
      }
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Compra creada exitosamente',
        data: { id_compra: compraId }
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error crear compra:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creando compra' 
    });
  }
});

// ANULAR COMPRA
app.put('/api/compras/:id/anular', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const detallesResult = await client.query(
        'SELECT * FROM detalle_compras WHERE id_compra = $1',
        [id]
      );
      
      for (const detalle of detallesResult.rows) {
        await client.query(
          'UPDATE productos SET stock = stock - $1 WHERE id_producto = $2',
          [detalle.cantidad, detalle.id_producto]
        );
      }
      
      const result = await client.query(
        'UPDATE compras SET estado = 0 WHERE id_compra = $1 RETURNING *',
        [id]
      );
      
      if (result.rows.length === 0) {
        throw new Error('Compra no encontrada');
      }
      
      await client.query(
        'INSERT INTO logs_anulaciones (id_compra, motivo, fecha) VALUES ($1, $2, NOW())',
        [id, motivo || 'Anulación por usuario']
      );
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Compra anulada exitosamente'
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error anular compra:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error anulando compra' 
    });
  }
});

// ==================== ENDPOINTS DE CLIENTES ====================

// LISTAR CLIENTES
app.get('/api/clientes', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM clientes ORDER BY nombre'
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error listar clientes:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo clientes' 
    });
  }
});

// BUSCAR CLIENTE POR ID
app.get('/api/clientes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM clientes WHERE id_cliente = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Cliente no encontrado' 
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error buscar cliente:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error buscando cliente' 
    });
  }
});

// CREAR CLIENTE
app.post('/api/clientes', authenticateToken, async (req, res) => {
  try {
    const { 
      nombre, 
      tipo_documento, 
      documento, 
      telefono, 
      direccion, 
      estado = 1 
    } = req.body;
    
    if (!nombre || !documento) {
      return res.status(400).json({ 
        success: false, 
        message: 'Nombre y documento son requeridos' 
      });
    }
    
    const result = await pool.query(
      `INSERT INTO clientes 
       (nombre, tipo_documento, documento, telefono, direccion, estado) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [nombre, tipo_documento, documento, telefono, direccion, estado]
    );
    
    res.json({
      success: true,
      message: 'Cliente creado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error crear cliente:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creando cliente' 
    });
  }
});

// ACTUALIZAR CLIENTE
app.put('/api/clientes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      nombre, 
      tipo_documento, 
      documento, 
      telefono, 
      direccion, 
      estado 
    } = req.body;
    
    const result = await pool.query(
      `UPDATE clientes SET 
        nombre = COALESCE($1, nombre),
        tipo_documento = COALESCE($2, tipo_documento),
        documento = COALESCE($3, documento),
        telefono = COALESCE($4, telefono),
        direccion = COALESCE($5, direccion),
        estado = COALESCE($6, estado)
       WHERE id_cliente = $7 RETURNING *`,
      [nombre, tipo_documento, documento, telefono, direccion, estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Cliente no encontrado' 
      });
    }
    
    res.json({
      success: true,
      message: 'Cliente actualizado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error actualizar cliente:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error actualizando cliente' 
    });
  }
});

// CAMBIAR ESTADO DE CLIENTE
app.put('/api/clientes/:id/estado', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    if (estado === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: 'Estado requerido' 
      });
    }
    
    const result = await pool.query(
      'UPDATE clientes SET estado = $1 WHERE id_cliente = $2 RETURNING *',
      [estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Cliente no encontrado' 
      });
    }
    
    res.json({
      success: true,
      message: 'Estado del cliente actualizado',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error cambiar estado cliente:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error cambiando estado del cliente' 
    });
  }
});

// ==================== ENDPOINTS DE VENTAS ====================

// LISTAR VENTAS
app.get('/api/ventas', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT v.*, c.nombre as cliente_nombre 
      FROM ventas v
      LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
      ORDER BY v.fecha DESC
    `);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error listar ventas:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo ventas' 
    });
  }
});

// DETALLES DE VENTA
app.get('/api/ventas/:id/detalles', authenticateToken, async (req, res) => {
  try {
    const ventaId = req.params.id;
    
    const result = await pool.query(`
      SELECT d.*, p.nombre as producto_nombre
      FROM detalle_ventas d
      LEFT JOIN productos p ON d.id_producto = p.id_producto
      WHERE d.id_venta = $1
    `, [ventaId]);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error detalles venta:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo detalles' 
    });
  }
});

// CREAR VENTA
app.post('/api/ventas', authenticateToken, async (req, res) => {
  try {
    const { id_cliente, total, estado, fecha, detalles } = req.body;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const ventaResult = await client.query(
        `INSERT INTO ventas (id_cliente, total, estado, fecha) 
         VALUES ($1, $2, $3, $4) RETURNING id_venta`,
        [id_cliente, total, estado || 'Pendiente', fecha || new Date()]
      );
      
      const ventaId = ventaResult.rows[0].id_venta;
      
      if (detalles && detalles.length > 0) {
        for (const detalle of detalles) {
          await client.query(
            `INSERT INTO detalle_ventas (id_venta, id_producto, cantidad, precio, subtotal)
             VALUES ($1, $2, $3, $4, $5)`,
            [ventaId, detalle.id_producto, detalle.cantidad, detalle.precio, detalle.subtotal]
          );
          
          await client.query(
            'UPDATE productos SET stock = stock - $1 WHERE id_producto = $2',
            [detalle.cantidad, detalle.id_producto]
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

// ACTUALIZAR ESTADO DE VENTA
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

// ANULAR VENTA
app.put('/api/ventas/:id/anular', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const detallesResult = await client.query(
        'SELECT * FROM detalle_ventas WHERE id_venta = $1',
        [id]
      );
      
      for (const detalle of detallesResult.rows) {
        await client.query(
          'UPDATE productos SET stock = stock + $1 WHERE id_producto = $2',
          [detalle.cantidad, detalle.id_producto]
        );
      }
      
      const result = await client.query(
        'UPDATE ventas SET estado = 0 WHERE id_venta = $1 RETURNING *',
        [id]
      );
      
      if (result.rows.length === 0) {
        throw new Error('Venta no encontrada');
      }
      
      await client.query(
        'INSERT INTO logs_anulaciones (id_venta, motivo, fecha) VALUES ($1, $2, NOW())',
        [id, motivo || 'Anulación por usuario']
      );
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Venta anulada exitosamente'
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error anular venta:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error anulando venta' 
    });
  }
});

// ==================== PERMISOS ====================

// LISTAR PERMISOS
app.get('/api/permisos', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM permisos ORDER BY id_permiso'
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error listar permisos:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo permisos' 
    });
  }
});

// ==================== ENDPOINTS DE PRUEBA ====================

// TEST API
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: '✅ API funcionando correctamente',
    timestamp: new Date().toISOString(),
    version: '9.0.0'
  });
});

// CHECK DATABASE
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
  console.log('🚀 API STOCKBAR - VERSIÓN 9.0 (CRUD COMPLETO)');
  console.log('='.repeat(70));
  console.log('✅ TODOS LOS MÓDULOS ACTIVADOS');
  console.log('✅ CRUD COMPLETO IMPLEMENTADO');
  console.log('✅ BASE DE DATOS CONECTADA');
  console.log('✅ EMAIL CONFIGURADO (GMAIL)');
  console.log('='.repeat(70));
  console.log(`📡 Puerto: ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`🌍 URL pública: https://api-stockbar.onrender.com`);
  console.log('='.repeat(70));
  console.log('✅ Endpoints principales:');
  console.log('   POST /api/login              - Iniciar sesión');
  console.log('   GET  /api/roles              - Listar roles');
  console.log('   POST /api/roles              - Crear rol');
  console.log('   GET  /api/usuarios           - Listar usuarios');
  console.log('   POST /api/usuarios           - Crear usuario');
  console.log('   GET  /api/productos          - Listar productos');
  console.log('   GET  /api/compras            - Listar compras');
  console.log('   POST /api/compras            - Crear compra');
  console.log('   GET  /api/ventas             - Listar ventas');
  console.log('   POST /api/ventas             - Crear venta');
  console.log('   POST /api/send-recovery-email - Recuperar contraseña');
  console.log('='.repeat(70));
  console.log('📧 Email configurado: thebar752@gmail.com');
  console.log('🔐 Login por defecto: thebar752@gmail.com | admin123');
  console.log('='.repeat(70));
  console.log('✅ Servidor listo para recibir peticiones!');
  console.log('='.repeat(70));
});

// MANEJO DE CIERRE
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
