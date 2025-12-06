const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const app = express();

// ✅ USAR TU CONEXIÓN EXISTENTE
const pool = new Pool({
  connectionString: 'postgresql://stockbar_user:0EndlOqYMUMDsuYAlnjyQ35Vzs3rFh1V@dpg-d4dmar9r0fns73eplq4g-a/stockbar_db',
  ssl: {
    rejectUnauthorized: false
  }
});

// Middlewares
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Almacenamiento temporal de códigos de verificación
const verificationCodes = new Map();

// Email del admin por defecto (NO SE PUEDE ELIMINAR)
const ADMIN_EMAIL = 'thebar752@gmail.com';

// ==================== MIDDLEWARE DE AUTENTICACIÓN ====================
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ success: false, message: 'Token requerido' });
    }

    // Decodificar token simple
    const decoded = Buffer.from(token, 'base64').toString('ascii');
    const [userId] = decoded.split(':');

    // Verificar usuario en base de datos
    const result = await pool.query(
      `SELECT u.*, r.nombre_rol, r.descripcion 
       FROM usuarios u 
       LEFT JOIN roles r ON u.id_rol = r.id_rol 
       WHERE u.id_usuario = $1 AND u.estado = 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Usuario no autorizado' });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    console.error('❌ Error en autenticación:', error);
    return res.status(401).json({ success: false, message: 'Token inválido' });
  }
};

// ==================== ENDPOINTS DE AUTENTICACIÓN ====================

// 1. Endpoint para verificar email (SOLO POST)
app.post('/api/verificar-email', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email es requerido' 
      });
    }
    
    // Verificar si el email existe en la base de datos
    const result = await pool.query(
      'SELECT id_usuario, email, usuario, id_rol FROM usuarios WHERE email = $1 AND estado = 1',
      [email]
    );
    
    const exists = result.rows.length > 0;
    
    if (exists) {
      const user = result.rows[0];
      // Generar código de verificación (6 dígitos)
      const codigo = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Guardar código con timestamp (expira en 10 minutos)
      verificationCodes.set(email, {
        codigo,
        timestamp: Date.now(),
        expira: Date.now() + (10 * 60 * 1000) // 10 minutos
      });
      
      console.log(`📧 Código de verificación para ${email}: ${codigo}`);
      
      return res.json({ 
        success: true, 
        exists: true,
        message: 'Email encontrado. Código de verificación generado.',
        codigo: codigo, // Solo para desarrollo
        usuario: user.usuario
      });
    } else {
      return res.json({ 
        success: true, 
        exists: false,
        message: 'Email no encontrado en el sistema' 
      });
    }
    
  } catch (error) {
    console.error('❌ Error al verificar email:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 2. Endpoint para actualizar contraseña
app.post('/api/actualizar-password', async (req, res) => {
  try {
    const { email, newPassword, codigo } = req.body;
    
    if (!email || !newPassword || !codigo) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email, nueva contraseña y código son requeridos' 
      });
    }
    
    // Verificar si hay un código para este email
    const storedCode = verificationCodes.get(email);
    
    if (!storedCode) {
      return res.status(400).json({ 
        success: false, 
        message: 'No hay código de verificación para este email' 
      });
    }
    
    // Verificar si el código ha expirado
    if (Date.now() > storedCode.expira) {
      verificationCodes.delete(email);
      return res.status(400).json({ 
        success: false, 
        message: 'El código ha expirado. Por favor solicite uno nuevo.' 
      });
    }
    
    // Verificar que el código coincida
    if (storedCode.codigo !== codigo) {
      return res.status(400).json({ 
        success: false, 
        message: 'Código de verificación incorrecto' 
      });
    }
    
    // Hashear la nueva contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Actualizar la contraseña en la base de datos
    const result = await pool.query(
      'UPDATE usuarios SET contraseña = $1 WHERE email = $2 AND estado = 1 RETURNING id_usuario, email, usuario',
      [hashedPassword, email]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Usuario no encontrado o inactivo' 
      });
    }
    
    // Eliminar el código usado
    verificationCodes.delete(email);
    
    console.log(`✅ Contraseña actualizada para: ${email}`);
    
    res.json({ 
      success: true, 
      message: 'Contraseña actualizada exitosamente',
      user: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Error al actualizar contraseña:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 3. Endpoint para login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email y contraseña son requeridos' 
      });
    }
    
    // Buscar usuario por email
    const result = await pool.query(
      `SELECT u.*, r.nombre_rol, r.descripcion 
       FROM usuarios u 
       LEFT JOIN roles r ON u.id_rol = r.id_rol 
       WHERE u.email = $1 AND u.estado = 1`,
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Credenciales incorrectas o usuario inactivo' 
      });
    }
    
    const user = result.rows[0];
    
    // Verificar contraseña (comparar hash)
    const passwordMatch = await bcrypt.compare(password, user.contraseña);
    
    if (!passwordMatch) {
      return res.status(401).json({ 
        success: false, 
        message: 'Credenciales incorrectas' 
      });
    }
    
    // Generar token simple
    const tokenData = `${user.id_usuario}:${Date.now()}`;
    const token = Buffer.from(tokenData).toString('base64');
    
    // Remover contraseña del objeto de respuesta
    const { contraseña, ...userWithoutPassword } = user;
    
    // Obtener módulos permitidos según el rol
    const permisosResult = await pool.query(
      `SELECT DISTINCT p.modulo
       FROM ver_detalle_rol vdr
       JOIN permisos p ON vdr.id_permiso = p.id_permiso
       WHERE vdr.id_rol = $1 AND p.estado = 1
       ORDER BY p.modulo`,
      [user.id_rol]
    );
    
    const modulosPermitidos = permisosResult.rows.map(p => p.modulo);
    
    res.json({ 
      success: true, 
      token: token,
      user: userWithoutPassword,
      modulos: modulosPermitidos,
      message: 'Login exitoso'
    });
    
  } catch (error) {
    console.error('❌ Error en login:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ==================== ENDPOINTS CRUD - ROLES ====================

// Obtener todos los roles
app.get('/api/roles', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id_rol, nombre_rol, descripcion, 
             CASE WHEN estado = 1 THEN 'Activo' ELSE 'Inactivo' END as estado,
             estado as estado_num
      FROM roles 
      ORDER BY id_rol
    `);
    
    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener un rol específico con permisos
app.get('/api/roles/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT r.*, 
             CASE WHEN r.estado = 1 THEN 'Activo' ELSE 'Inactivo' END as estado_texto
      FROM roles r 
      WHERE r.id_rol = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Rol no encontrado' });
    }
    
    const rol = result.rows[0];
    
    // Obtener permisos asignados
    const permisosResult = await pool.query(`
      SELECT p.* 
      FROM ver_detalle_rol vdr
      JOIN permisos p ON vdr.id_permiso = p.id_permiso
      WHERE vdr.id_rol = $1
      ORDER BY p.modulo, p.nombre_permiso
    `, [id]);
    
    rol.permisos = permisosResult.rows;
    
    res.json({
      success: true,
      data: rol
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Crear nuevo rol
app.post('/api/roles', authenticateToken, async (req, res) => {
  try {
    const { nombre_rol, descripcion, estado, permisos } = req.body;
    
    if (!nombre_rol) {
      return res.status(400).json({ 
        success: false, 
        error: 'Nombre del rol es requerido' 
      });
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Crear el rol
      const rolResult = await client.query(
        `INSERT INTO roles (nombre_rol, descripcion, estado) 
         VALUES ($1, $2, $3) RETURNING *`,
        [nombre_rol, descripcion, estado || 1]
      );
      
      const rolId = rolResult.rows[0].id_rol;
      
      // Asignar permisos si se proporcionan
      if (permisos && Array.isArray(permisos)) {
        for (const permisoId of permisos) {
          await client.query(
            'INSERT INTO ver_detalle_rol (id_rol, id_permiso) VALUES ($1, $2)',
            [rolId, permisoId]
          );
        }
      }
      
      await client.query('COMMIT');
      
      res.status(201).json({ 
        success: true, 
        message: 'Rol creado exitosamente',
        data: rolResult.rows[0] 
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Actualizar rol
app.put('/api/roles/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre_rol, descripcion, estado, permisos } = req.body;
    
    if (!nombre_rol) {
      return res.status(400).json({ 
        success: false, 
        error: 'Nombre del rol es requerido' 
      });
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Verificar si el rol existe
      const rolExistente = await client.query(
        'SELECT * FROM roles WHERE id_rol = $1',
        [id]
      );
      
      if (rolExistente.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Rol no encontrado' });
      }
      
      // Actualizar el rol
      const rolResult = await client.query(
        `UPDATE roles SET nombre_rol=$1, descripcion=$2, estado=$3 
         WHERE id_rol=$4 RETURNING *`,
        [nombre_rol, descripcion, estado, id]
      );
      
      // Actualizar permisos si se proporcionan
      if (permisos && Array.isArray(permisos)) {
        // Eliminar permisos actuales
        await client.query(
          'DELETE FROM ver_detalle_rol WHERE id_rol = $1',
          [id]
        );
        
        // Insertar nuevos permisos
        for (const permisoId of permisos) {
          await client.query(
            'INSERT INTO ver_detalle_rol (id_rol, id_permiso) VALUES ($1, $2)',
            [id, permisoId]
          );
        }
      }
      
      await client.query('COMMIT');
      
      res.json({ 
        success: true, 
        message: 'Rol actualizado exitosamente',
        data: rolResult.rows[0] 
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cambiar estado del rol (Activar/Desactivar)
app.patch('/api/roles/:id/estado', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    if (estado === undefined || estado === null) {
      return res.status(400).json({ 
        success: false, 
        error: 'Estado es requerido (1 para activar, 0 para desactivar)' 
      });
    }
    
    // Verificar si el rol existe
    const rolExistente = await pool.query(
      'SELECT * FROM roles WHERE id_rol = $1',
      [id]
    );
    
    if (rolExistente.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Rol no encontrado' });
    }
    
    // Verificar si tiene usuarios asignados al desactivar
    if (estado === 0) {
      const usuariosResult = await pool.query(
        'SELECT COUNT(*) FROM usuarios WHERE id_rol = $1 AND estado = 1',
        [id]
      );
      
      if (parseInt(usuariosResult.rows[0].count) > 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'No se puede desactivar el rol porque tiene usuarios activos asignados' 
        });
      }
    }
    
    const result = await pool.query(
      'UPDATE roles SET estado = $1 WHERE id_rol = $2 RETURNING *',
      [estado, id]
    );
    
    const estadoTexto = estado === 1 ? 'activado' : 'desactivado';
    
    res.json({ 
      success: true, 
      message: `Rol ${estadoTexto} exitosamente`,
      data: result.rows[0] 
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Eliminar rol
app.delete('/api/roles/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar si el rol tiene usuarios asignados
    const usuariosResult = await pool.query(
      'SELECT COUNT(*) FROM usuarios WHERE id_rol = $1',
      [id]
    );
    
    if (parseInt(usuariosResult.rows[0].count) > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No se puede eliminar el rol porque tiene usuarios asignados' 
      });
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Eliminar permisos asignados primero
      await client.query(
        'DELETE FROM ver_detalle_rol WHERE id_rol = $1',
        [id]
      );
      
      // Eliminar el rol
      const result = await client.query(
        'DELETE FROM roles WHERE id_rol = $1 RETURNING *',
        [id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Rol no encontrado' });
      }
      
      await client.query('COMMIT');
      
      res.json({ 
        success: true, 
        message: 'Rol eliminado exitosamente',
        data: result.rows[0] 
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ENDPOINTS CRUD - USUARIOS ====================

// Obtener todos los usuarios
app.get('/api/usuarios', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id_usuario, u.nombre_completo, u.email, u.usuario, 
             u.estado, r.nombre_rol,
             CASE WHEN u.estado = 1 THEN 'Activo' ELSE 'Inactivo' END as estado_texto
      FROM usuarios u 
      LEFT JOIN roles r ON u.id_rol = r.id_rol 
      ORDER BY u.id_usuario
    `);
    
    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener usuario específico
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
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }
    
    // Remover contraseña de la respuesta
    const { contraseña, ...usuarioSinPassword } = result.rows[0];
    
    res.json({
      success: true,
      data: usuarioSinPassword
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Crear nuevo usuario
app.post('/api/usuarios', authenticateToken, async (req, res) => {
  try {
    const { id_rol, nombre_completo, email, usuario, password, estado } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email y contraseña son requeridos' 
      });
    }
    
    // Verificar si el email ya existe
    const emailExists = await pool.query(
      'SELECT id_usuario FROM usuarios WHERE email = $1',
      [email]
    );
    
    if (emailExists.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'El email ya está registrado' 
      });
    }
    
    // Hashear la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const result = await pool.query(
      `INSERT INTO usuarios (id_rol, nombre_completo, email, usuario, contraseña, estado) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id_usuario, nombre_completo, email, usuario, estado, id_rol`,
      [id_rol, nombre_completo, email, usuario, hashedPassword, estado || 1]
    );
    
    res.status(201).json({ 
      success: true, 
      message: 'Usuario creado exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Actualizar usuario
app.put('/api/usuarios/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { id_rol, nombre_completo, email, usuario, estado, password } = req.body;
    
    // Verificar si es el admin por defecto (NO SE PUEDE MODIFICAR EL ROL)
    const usuarioActual = await pool.query(
      'SELECT email, id_rol FROM usuarios WHERE id_usuario = $1',
      [id]
    );
    
    if (usuarioActual.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }
    
    const esAdmin = usuarioActual.rows[0].email === ADMIN_EMAIL;
    
    let query;
    let values;
    
    if (password && password.trim() !== '') {
      // Si se proporciona nueva contraseña, actualizarla también
      const hashedPassword = await bcrypt.hash(password, 10);
      query = `UPDATE usuarios SET id_rol=$1, nombre_completo=$2, email=$3, usuario=$4, 
               estado=$5, contraseña=$6 WHERE id_usuario=$7 
               RETURNING id_usuario, nombre_completo, email, usuario, estado, id_rol`;
      values = [id_rol, nombre_completo, email, usuario, estado, hashedPassword, id];
    } else {
      query = `UPDATE usuarios SET id_rol=$1, nombre_completo=$2, email=$3, usuario=$4, estado=$5 
               WHERE id_usuario=$6 RETURNING id_usuario, nombre_completo, email, usuario, estado, id_rol`;
      values = [id_rol, nombre_completo, email, usuario, estado, id];
    }
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }
    
    let mensaje = 'Usuario actualizado exitosamente';
    if (esAdmin) {
      mensaje += ' (Admin por defecto - protegido)';
    }
    
    res.json({ 
      success: true, 
      message: mensaje,
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cambiar estado de usuario (Activar/Desactivar)
app.patch('/api/usuarios/:id/estado', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    if (estado === undefined || estado === null) {
      return res.status(400).json({ 
        success: false, 
        error: 'Estado es requerido (1 para activar, 0 para desactivar)' 
      });
    }
    
    // Verificar si el usuario existe
    const usuarioResult = await pool.query(
      'SELECT email FROM usuarios WHERE id_usuario = $1',
      [id]
    );
    
    if (usuarioResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }
    
    const email = usuarioResult.rows[0].email;
    
    // Verificar si es el admin por defecto (NO SE PUEDE DESACTIVAR)
    if (email === ADMIN_EMAIL && estado === 0) {
      return res.status(403).json({ 
        success: false, 
        error: 'No se puede desactivar el administrador por defecto' 
      });
    }
    
    const result = await pool.query(
      'UPDATE usuarios SET estado = $1 WHERE id_usuario = $2 RETURNING id_usuario, email, usuario, estado',
      [estado, id]
    );
    
    const estadoTexto = estado === 1 ? 'activado' : 'desactivado';
    
    res.json({ 
      success: true, 
      message: `Usuario ${estadoTexto} exitosamente`,
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Eliminar usuario
app.delete('/api/usuarios/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar si es el admin por defecto (NO SE PUEDE ELIMINAR)
    const usuarioResult = await pool.query(
      'SELECT email FROM usuarios WHERE id_usuario = $1',
      [id]
    );
    
    if (usuarioResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }
    
    const email = usuarioResult.rows[0].email;
    
    if (email === ADMIN_EMAIL) {
      return res.status(403).json({ 
        success: false, 
        error: 'No se puede eliminar el administrador por defecto' 
      });
    }
    
    const result = await pool.query(
      'DELETE FROM usuarios WHERE id_usuario = $1 RETURNING id_usuario, email, usuario',
      [id]
    );
    
    res.json({ 
      success: true, 
      message: 'Usuario eliminado exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ENDPOINTS CRUD - CATEGORIAS ====================

// Obtener todas las categorías
app.get('/api/categorias', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id_categoria, nombre, descripcion, 
             CASE WHEN estado = 1 THEN 'Activo' ELSE 'Inactivo' END as estado,
             estado as estado_num
      FROM categorias 
      ORDER BY id_categoria
    `);
    
    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener categoría específica
app.get('/api/categorias/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT * FROM categorias WHERE id_categoria = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Categoría no encontrada' });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Crear nueva categoría
app.post('/api/categorias', authenticateToken, async (req, res) => {
  try {
    const { nombre, descripcion, estado } = req.body;
    
    if (!nombre) {
      return res.status(400).json({ 
        success: false, 
        error: 'Nombre de categoría es requerido' 
      });
    }
    
    // Verificar si ya existe una categoría con el mismo nombre
    const existeCategoria = await pool.query(
      'SELECT id_categoria FROM categorias WHERE nombre = $1',
      [nombre]
    );
    
    if (existeCategoria.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Ya existe una categoría con ese nombre' 
      });
    }
    
    const result = await pool.query(
      `INSERT INTO categorias (nombre, descripcion, estado) 
       VALUES ($1, $2, $3) RETURNING *`,
      [nombre, descripcion, estado || 1]
    );
    
    res.status(201).json({ 
      success: true, 
      message: 'Categoría creada exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Actualizar categoría
app.put('/api/categorias/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, estado } = req.body;
    
    if (!nombre) {
      return res.status(400).json({ 
        success: false, 
        error: 'Nombre de categoría es requerido' 
      });
    }
    
    // Verificar si la categoría existe
    const categoriaExistente = await pool.query(
      'SELECT * FROM categorias WHERE id_categoria = $1',
      [id]
    );
    
    if (categoriaExistente.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Categoría no encontrada' });
    }
    
    // Verificar si ya existe otra categoría con el mismo nombre
    const existeNombre = await pool.query(
      'SELECT id_categoria FROM categorias WHERE nombre = $1 AND id_categoria != $2',
      [nombre, id]
    );
    
    if (existeNombre.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Ya existe otra categoría con ese nombre' 
      });
    }
    
    const result = await pool.query(
      `UPDATE categorias SET nombre=$1, descripcion=$2, estado=$3 
       WHERE id_categoria=$4 RETURNING *`,
      [nombre, descripcion, estado, id]
    );
    
    res.json({ 
      success: true, 
      message: 'Categoría actualizada exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cambiar estado de categoría
app.patch('/api/categorias/:id/estado', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    if (estado === undefined || estado === null) {
      return res.status(400).json({ 
        success: false, 
        error: 'Estado es requerido (1 para activar, 0 para desactivar)' 
      });
    }
    
    // Verificar si la categoría existe
    const categoriaExistente = await pool.query(
      'SELECT * FROM categorias WHERE id_categoria = $1',
      [id]
    );
    
    if (categoriaExistente.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Categoría no encontrada' });
    }
    
    // Verificar si hay productos asociados al desactivar
    if (estado === 0) {
      const productosResult = await pool.query(
        'SELECT COUNT(*) FROM productos WHERE id_categoria = $1 AND estado = 1',
        [id]
      );
      
      if (parseInt(productosResult.rows[0].count) > 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'No se puede desactivar la categoría porque tiene productos activos' 
        });
      }
    }
    
    const result = await pool.query(
      'UPDATE categorias SET estado = $1 WHERE id_categoria = $2 RETURNING *',
      [estado, id]
    );
    
    const estadoTexto = estado === 1 ? 'activada' : 'desactivada';
    
    res.json({ 
      success: true, 
      message: `Categoría ${estadoTexto} exitosamente`,
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Eliminar categoría
app.delete('/api/categorias/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar si la categoría existe
    const categoriaExistente = await pool.query(
      'SELECT * FROM categorias WHERE id_categoria = $1',
      [id]
    );
    
    if (categoriaExistente.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Categoría no encontrada' });
    }
    
    // Verificar si hay productos asociados
    const productosResult = await pool.query(
      'SELECT COUNT(*) FROM productos WHERE id_categoria = $1',
      [id]
    );
    
    if (parseInt(productosResult.rows[0].count) > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No se puede eliminar la categoría porque tiene productos asociados' 
      });
    }
    
    const result = await pool.query(
      'DELETE FROM categorias WHERE id_categoria = $1 RETURNING *',
      [id]
    );
    
    res.json({ 
      success: true, 
      message: 'Categoría eliminada exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ENDPOINTS CRUD - PRODUCTOS ====================

// Obtener todos los productos
app.get('/api/productos', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.id_producto, p.nombre, p.id_categoria, c.nombre as categoria_nombre,
             p.stock, p.precio_compra, p.precio_venta, 
             CASE WHEN p.estado = 1 THEN 'Activo' ELSE 'Inactivo' END as estado,
             p.estado as estado_num
      FROM productos p 
      LEFT JOIN categorias c ON p.id_categoria = c.id_categoria 
      ORDER BY p.nombre
    `);
    
    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener producto específico
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
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Crear nuevo producto
app.post('/api/productos', authenticateToken, async (req, res) => {
  try {
    const { id_categoria, nombre, stock, precio_compra, precio_venta, estado } = req.body;
    
    if (!nombre || !id_categoria) {
      return res.status(400).json({ 
        success: false, 
        error: 'Nombre y categoría son requeridos' 
      });
    }
    
    if (precio_compra <= 0 || precio_venta <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Los precios deben ser mayores a 0' 
      });
    }
    
    if (stock < 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'El stock no puede ser negativo' 
      });
    }
    
    const result = await pool.query(
      `INSERT INTO productos (id_categoria, nombre, stock, precio_compra, precio_venta, estado) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id_categoria, nombre, stock || 0, precio_compra, precio_venta, estado || 1]
    );
    
    res.status(201).json({ 
      success: true, 
      message: 'Producto creado exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Actualizar producto
app.put('/api/productos/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { id_categoria, nombre, stock, precio_compra, precio_venta, estado } = req.body;
    
    if (!nombre || !id_categoria) {
      return res.status(400).json({ 
        success: false, 
        error: 'Nombre y categoría son requeridos' 
      });
    }
    
    // Verificar si el producto existe
    const productoExistente = await pool.query(
      'SELECT * FROM productos WHERE id_producto = $1',
      [id]
    );
    
    if (productoExistente.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }
    
    const result = await pool.query(
      `UPDATE productos SET id_categoria=$1, nombre=$2, stock=$3, 
       precio_compra=$4, precio_venta=$5, estado=$6 
       WHERE id_producto=$7 RETURNING *`,
      [id_categoria, nombre, stock, precio_compra, precio_venta, estado, id]
    );
    
    res.json({ 
      success: true, 
      message: 'Producto actualizado exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cambiar estado de producto
app.patch('/api/productos/:id/estado', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    if (estado === undefined || estado === null) {
      return res.status(400).json({ 
        success: false, 
        error: 'Estado es requerido (1 para activar, 0 para desactivar)' 
      });
    }
    
    // Verificar si el producto existe
    const productoExistente = await pool.query(
      'SELECT * FROM productos WHERE id_producto = $1',
      [id]
    );
    
    if (productoExistente.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }
    
    const result = await pool.query(
      'UPDATE productos SET estado = $1 WHERE id_producto = $2 RETURNING *',
      [estado, id]
    );
    
    const estadoTexto = estado === 1 ? 'activado' : 'desactivado';
    
    res.json({ 
      success: true, 
      message: `Producto ${estadoTexto} exitosamente`,
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Eliminar producto
app.delete('/api/productos/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar si el producto existe
    const productoExistente = await pool.query(
      'SELECT * FROM productos WHERE id_producto = $1',
      [id]
    );
    
    if (productoExistente.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }
    
    // Verificar si el producto tiene stock
    if (productoExistente.rows[0].stock > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No se puede eliminar el producto porque tiene stock disponible' 
      });
    }
    
    // Verificar si el producto está en ventas o compras
    const enVentas = await pool.query(
      'SELECT COUNT(*) FROM detalle_ventas WHERE id_producto = $1',
      [id]
    );
    
    const enCompras = await pool.query(
      'SELECT COUNT(*) FROM detalle_compras WHERE id_producto = $1',
      [id]
    );
    
    if (parseInt(enVentas.rows[0].count) > 0 || parseInt(enCompras.rows[0].count) > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No se puede eliminar el producto porque está registrado en ventas o compras' 
      });
    }
    
    const result = await pool.query(
      'DELETE FROM productos WHERE id_producto = $1 RETURNING *',
      [id]
    );
    
    res.json({ 
      success: true, 
      message: 'Producto eliminado exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ENDPOINTS CRUD - PROVEEDORES ====================

// Obtener todos los proveedores
app.get('/api/proveedores', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id_proveedor, nombre_razon_social, documento, 
             contacto, direccion, email,
             CASE WHEN estado = 1 THEN 'Activo' ELSE 'Inactivo' END as estado,
             estado as estado_num
      FROM proveedores 
      ORDER BY nombre_razon_social
    `);
    
    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener proveedor específico
app.get('/api/proveedores/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT * FROM proveedores WHERE id_proveedor = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Proveedor no encontrado' });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Crear nuevo proveedor
app.post('/api/proveedores', authenticateToken, async (req, res) => {
  try {
    const { nombre_razon_social, documento, contacto, direccion, email, estado } = req.body;
    
    if (!nombre_razon_social || !documento) {
      return res.status(400).json({ 
        success: false, 
        error: 'Nombre/Razón Social y Documento son requeridos' 
      });
    }
    
    // Verificar si ya existe un proveedor con el mismo documento
    const existeProveedor = await pool.query(
      'SELECT id_proveedor FROM proveedores WHERE documento = $1',
      [documento]
    );
    
    if (existeProveedor.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Ya existe un proveedor con ese documento' 
      });
    }
    
    const result = await pool.query(
      `INSERT INTO proveedores (nombre_razon_social, documento, contacto, direccion, email, estado) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [nombre_razon_social, documento, contacto, direccion, email, estado || 1]
    );
    
    res.status(201).json({ 
      success: true, 
      message: 'Proveedor creado exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Actualizar proveedor
app.put('/api/proveedores/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre_razon_social, documento, contacto, direccion, email, estado } = req.body;
    
    if (!nombre_razon_social || !documento) {
      return res.status(400).json({ 
        success: false, 
        error: 'Nombre/Razón Social y Documento son requeridos' 
      });
    }
    
    // Verificar si el proveedor existe
    const proveedorExistente = await pool.query(
      'SELECT * FROM proveedores WHERE id_proveedor = $1',
      [id]
    );
    
    if (proveedorExistente.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Proveedor no encontrado' });
    }
    
    // Verificar si ya existe otro proveedor con el mismo documento
    const existeDocumento = await pool.query(
      'SELECT id_proveedor FROM proveedores WHERE documento = $1 AND id_proveedor != $2',
      [documento, id]
    );
    
    if (existeDocumento.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Ya existe otro proveedor con ese documento' 
      });
    }
    
    const result = await pool.query(
      `UPDATE proveedores SET nombre_razon_social=$1, documento=$2, contacto=$3, 
       direccion=$4, email=$5, estado=$6 
       WHERE id_proveedor=$7 RETURNING *`,
      [nombre_razon_social, documento, contacto, direccion, email, estado, id]
    );
    
    res.json({ 
      success: true, 
      message: 'Proveedor actualizado exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cambiar estado de proveedor
app.patch('/api/proveedores/:id/estado', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    if (estado === undefined || estado === null) {
      return res.status(400).json({ 
        success: false, 
        error: 'Estado es requerido (1 para activar, 0 para desactivar)' 
      });
    }
    
    // Verificar si el proveedor existe
    const proveedorExistente = await pool.query(
      'SELECT * FROM proveedores WHERE id_proveedor = $1',
      [id]
    );
    
    if (proveedorExistente.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Proveedor no encontrado' });
    }
    
    // Verificar si tiene compras asociadas al desactivar
    if (estado === 0) {
      const comprasResult = await pool.query(
        'SELECT COUNT(*) FROM compras WHERE id_proveedor = $1 AND estado = 1',
        [id]
      );
      
      if (parseInt(comprasResult.rows[0].count) > 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'No se puede desactivar el proveedor porque tiene compras activas asociadas' 
        });
      }
    }
    
    const result = await pool.query(
      'UPDATE proveedores SET estado = $1 WHERE id_proveedor = $2 RETURNING *',
      [estado, id]
    );
    
    const estadoTexto = estado === 1 ? 'activado' : 'desactivado';
    
    res.json({ 
      success: true, 
      message: `Proveedor ${estadoTexto} exitosamente`,
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Eliminar proveedor
app.delete('/api/proveedores/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar si el proveedor existe
    const proveedorExistente = await pool.query(
      'SELECT * FROM proveedores WHERE id_proveedor = $1',
      [id]
    );
    
    if (proveedorExistente.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Proveedor no encontrado' });
    }
    
    // Verificar si tiene compras asociadas
    const comprasResult = await pool.query(
      'SELECT COUNT(*) FROM compras WHERE id_proveedor = $1',
      [id]
    );
    
    if (parseInt(comprasResult.rows[0].count) > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No se puede eliminar el proveedor porque tiene compras asociadas' 
      });
    }
    
    const result = await pool.query(
      'DELETE FROM proveedores WHERE id_proveedor = $1 RETURNING *',
      [id]
    );
    
    res.json({ 
      success: true, 
      message: 'Proveedor eliminado exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ENDPOINTS CRUD - COMPRAS ====================

// Obtener todas las compras
app.get('/api/compras', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, p.nombre_razon_social as proveedor_nombre,
             CASE WHEN c.estado = 1 THEN 'Activa' 
                  WHEN c.estado = 0 THEN 'Anulada' 
                  ELSE 'Desconocida' END as estado_texto,
             c.estado as estado_num
      FROM compras c 
      LEFT JOIN proveedores p ON c.id_proveedor = p.id_proveedor 
      ORDER BY c.fecha DESC
    `);
    
    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener compra específica con detalles
app.get('/api/compras/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT c.*, p.nombre_razon_social, p.documento, p.contacto
      FROM compras c 
      LEFT JOIN proveedores p ON c.id_proveedor = p.id_proveedor 
      WHERE c.id_compra = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Compra no encontrada' });
    }
    
    const compra = result.rows[0];
    
    // Obtener detalles de la compra
    const detallesResult = await pool.query(`
      SELECT dc.*, pr.nombre as producto_nombre, pr.precio_compra
      FROM detalle_compras dc 
      LEFT JOIN productos pr ON dc.id_producto = pr.id_producto 
      WHERE dc.id_compra = $1
    `, [id]);
    
    compra.detalles = detallesResult.rows;
    
    res.json({
      success: true,
      data: compra
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Crear nueva compra
app.post('/api/compras', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id_proveedor, total, numero_factura, estado, productos } = req.body;
    
    if (!id_proveedor || !total || !productos || !Array.isArray(productos)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Faltan parámetros: id_proveedor, total, productos (array)' 
      });
    }
    
    if (productos.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Debe incluir al menos un producto en la compra' 
      });
    }
    
    // 1. Crear la compra principal
    const compraResult = await client.query(
      `INSERT INTO compras (id_proveedor, fecha, total, numero_factura, estado) 
       VALUES ($1, NOW(), $2, $3, $4) RETURNING *`,
      [id_proveedor, total, numero_factura, estado || 1]
    );
    
    const compraId = compraResult.rows[0].id_compra;
    
    // 2. Crear los detalles de compra y actualizar stock
    for (const producto of productos) {
      const cantidad = producto.cantidad || 1;
      const precio = producto.precio || producto.precio_compra || 0;
      const subtotal = cantidad * precio;
      
      if (cantidad <= 0) {
        throw new Error(`La cantidad para el producto ${producto.id_producto} debe ser mayor a 0`);
      }
      
      if (precio <= 0) {
        throw new Error(`El precio para el producto ${producto.id_producto} debe ser mayor a 0`);
      }
      
      await client.query(
        `INSERT INTO detalle_compras (id_compra, id_producto, cantidad, precio, subtotal) 
         VALUES ($1, $2, $3, $4, $5)`,
        [compraId, producto.id_producto, cantidad, precio, subtotal]
      );
      
      // 3. Actualizar stock de productos (SUMAR stock) y precio de compra
      await client.query(
        'UPDATE productos SET stock = stock + $1, precio_compra = $2 WHERE id_producto = $3',
        [cantidad, precio, producto.id_producto]
      );
      
      console.log(`📦 Compra ${compraId}: Producto ${producto.id_producto} +${cantidad} unidades`);
    }
    
    await client.query('COMMIT');
    
    res.status(201).json({ 
      success: true, 
      message: '✅ Compra registrada exitosamente. Stock actualizado.',
      data: {
        compra: compraResult.rows[0],
        productos_comprados: productos.length
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error al registrar compra:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// Anular compra y restar stock
app.patch('/api/compras/:id/anular', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    
    // 1. Verificar si la compra existe
    const compraResult = await client.query(
      `SELECT c.*, p.nombre_razon_social 
       FROM compras c 
       LEFT JOIN proveedores p ON c.id_proveedor = p.id_proveedor 
       WHERE c.id_compra = $1`,
      [id]
    );
    
    if (compraResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Compra no encontrada' });
    }
    
    const compra = compraResult.rows[0];
    
    // Verificar que no esté ya anulada
    if (compra.estado === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'La compra ya está anulada' 
      });
    }
    
    // 2. Obtener los productos de la compra
    const detallesResult = await client.query(
      `SELECT dc.*, pr.nombre as producto_nombre 
       FROM detalle_compras dc 
       LEFT JOIN productos pr ON dc.id_producto = pr.id_producto 
       WHERE dc.id_compra = $1`,
      [id]
    );
    
    const productos = detallesResult.rows;
    
    if (productos.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'La compra no tiene productos' 
      });
    }
    
    // 3. Verificar stock antes de anular (no podemos restar más de lo que hay)
    for (const producto of productos) {
      const productoInfo = await client.query(
        'SELECT stock FROM productos WHERE id_producto = $1',
        [producto.id_producto]
      );
      
      if (productoInfo.rows.length === 0) {
        throw new Error(`Producto con ID ${producto.id_producto} no encontrado`);
      }
      
      const stockActual = productoInfo.rows[0].stock;
      
      if (stockActual < producto.cantidad) {
        throw new Error(`Stock insuficiente para anular compra. Producto: ${producto.producto_nombre}, Stock actual: ${stockActual}, Cantidad a restar: ${producto.cantidad}`);
      }
    }
    
    // 4. Restar cada producto del stock
    console.log(`📦 Anulando compra ${id}: Restando ${productos.length} productos del stock`);
    
    for (const producto of productos) {
      await client.query(
        'UPDATE productos SET stock = stock - $1 WHERE id_producto = $2',
        [producto.cantidad, producto.id_producto]
      );
      
      console.log(`   ✅ Producto ${producto.producto_nombre} (ID: ${producto.id_producto}): -${producto.cantidad} unidades`);
    }
    
    // 5. Actualizar estado de la compra a "Anulada" (estado 0)
    const updateResult = await client.query(
      'UPDATE compras SET estado = 0 WHERE id_compra = $1 RETURNING *',
      [id]
    );
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      message: '✅ Compra anulada exitosamente. Productos restados del stock.',
      data: {
        compra: updateResult.rows[0],
        productos_afectados: productos.length
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error al anular compra:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// Eliminar compra (solo si está anulada)
app.delete('/api/compras/:id', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    
    // 1. Verificar si la compra existe
    const compraResult = await client.query(
      'SELECT * FROM compras WHERE id_compra = $1',
      [id]
    );
    
    if (compraResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Compra no encontrada' });
    }
    
    const compra = compraResult.rows[0];
    
    // 2. Solo se puede eliminar si está anulada
    if (compra.estado === 1) {
      return res.status(400).json({ 
        success: false, 
        error: 'No se puede eliminar una compra activa. Debe anularla primero.' 
      });
    }
    
    // 3. Eliminar detalles de compra
    await client.query(
      'DELETE FROM detalle_compras WHERE id_compra = $1',
      [id]
    );
    
    // 4. Eliminar la compra
    const result = await client.query(
      'DELETE FROM compras WHERE id_compra = $1 RETURNING *',
      [id]
    );
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      message: 'Compra eliminada exitosamente',
      data: result.rows[0] 
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error al eliminar compra:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// ==================== ENDPOINTS CRUD - CLIENTES ====================

// Obtener todos los clientes
app.get('/api/clientes', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id_cliente, nombre, tipo_documento, documento, 
             telefono, direccion, email,
             CASE WHEN estado = 1 THEN 'Activo' ELSE 'Inactivo' END as estado,
             estado as estado_num
      FROM clientes 
      ORDER BY nombre
    `);
    
    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener cliente específico
app.get('/api/clientes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT * FROM clientes WHERE id_cliente = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Crear nuevo cliente
app.post('/api/clientes', authenticateToken, async (req, res) => {
  try {
    const { nombre, tipo_documento, documento, telefono, direccion, email, estado } = req.body;
    
    if (!nombre || !documento) {
      return res.status(400).json({ 
        success: false, 
        error: 'Nombre y documento son requeridos' 
      });
    }
    
    // Verificar si ya existe un cliente con el mismo documento
    const existeCliente = await pool.query(
      'SELECT id_cliente FROM clientes WHERE documento = $1',
      [documento]
    );
    
    if (existeCliente.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Ya existe un cliente con ese documento' 
      });
    }
    
    const result = await pool.query(
      `INSERT INTO clientes (nombre, tipo_documento, documento, telefono, direccion, email, estado) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [nombre, tipo_documento, documento, telefono, direccion, email, estado || 1]
    );
    
    res.status(201).json({ 
      success: true, 
      message: 'Cliente creado exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Actualizar cliente
app.put('/api/clientes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, tipo_documento, documento, telefono, direccion, email, estado } = req.body;
    
    if (!nombre || !documento) {
      return res.status(400).json({ 
        success: false, 
        error: 'Nombre y documento son requeridos' 
      });
    }
    
    // Verificar si el cliente existe
    const clienteExistente = await pool.query(
      'SELECT * FROM clientes WHERE id_cliente = $1',
      [id]
    );
    
    if (clienteExistente.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }
    
    // Verificar si ya existe otro cliente con el mismo documento
    const existeDocumento = await pool.query(
      'SELECT id_cliente FROM clientes WHERE documento = $1 AND id_cliente != $2',
      [documento, id]
    );
    
    if (existeDocumento.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Ya existe otro cliente con ese documento' 
      });
    }
    
    const result = await pool.query(
      `UPDATE clientes SET nombre=$1, tipo_documento=$2, documento=$3, 
       telefono=$4, direccion=$5, email=$6, estado=$7 
       WHERE id_cliente=$8 RETURNING *`,
      [nombre, tipo_documento, documento, telefono, direccion, email, estado, id]
    );
    
    res.json({ 
      success: true, 
      message: 'Cliente actualizado exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cambiar estado de cliente
app.patch('/api/clientes/:id/estado', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    if (estado === undefined || estado === null) {
      return res.status(400).json({ 
        success: false, 
        error: 'Estado es requerido (1 para activar, 0 para desactivar)' 
      });
    }
    
    // Verificar si el cliente existe
    const clienteExistente = await pool.query(
      'SELECT * FROM clientes WHERE id_cliente = $1',
      [id]
    );
    
    if (clienteExistente.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }
    
    // Verificar si tiene ventas asociadas al desactivar
    if (estado === 0) {
      const ventasResult = await pool.query(
        'SELECT COUNT(*) FROM ventas WHERE id_cliente = $1 AND estado = 1',
        [id]
      );
      
      if (parseInt(ventasResult.rows[0].count) > 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'No se puede desactivar el cliente porque tiene ventas activas asociadas' 
        });
      }
    }
    
    const result = await pool.query(
      'UPDATE clientes SET estado = $1 WHERE id_cliente = $2 RETURNING *',
      [estado, id]
    );
    
    const estadoTexto = estado === 1 ? 'activado' : 'desactivado';
    
    res.json({ 
      success: true, 
      message: `Cliente ${estadoTexto} exitosamente`,
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Eliminar cliente
app.delete('/api/clientes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar si el cliente existe
    const clienteExistente = await pool.query(
      'SELECT * FROM clientes WHERE id_cliente = $1',
      [id]
    );
    
    if (clienteExistente.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }
    
    // Verificar si tiene ventas asociadas
    const ventasResult = await pool.query(
      'SELECT COUNT(*) FROM ventas WHERE id_cliente = $1',
      [id]
    );
    
    if (parseInt(ventasResult.rows[0].count) > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No se puede eliminar el cliente porque tiene ventas asociadas' 
      });
    }
    
    const result = await pool.query(
      'DELETE FROM clientes WHERE id_cliente = $1 RETURNING *',
      [id]
    );
    
    res.json({ 
      success: true, 
      message: 'Cliente eliminado exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ENDPOINTS CRUD - VENTAS ====================

// Obtener todas las ventas
app.get('/api/ventas', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT v.*, c.nombre as cliente_nombre,
             CASE WHEN v.estado = 0 THEN 'Pendiente' 
                  WHEN v.estado = 1 THEN 'Completada' 
                  WHEN v.estado = 2 THEN 'Anulada' 
                  ELSE 'Desconocido' END as estado_texto,
             v.estado as estado_num
      FROM ventas v 
      LEFT JOIN clientes c ON v.id_cliente = c.id_cliente 
      ORDER BY v.fecha DESC
    `);
    
    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener venta con detalles
app.get('/api/ventas/:id/completa', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Obtener venta principal
    const ventaResult = await pool.query(`
      SELECT v.*, c.nombre as cliente_nombre, c.documento, c.telefono, c.tipo_documento,
             CASE WHEN v.estado = 0 THEN 'Pendiente' 
                  WHEN v.estado = 1 THEN 'Completada' 
                  WHEN v.estado = 2 THEN 'Anulada' 
                  ELSE 'Desconocido' END as estado_texto
      FROM ventas v 
      LEFT JOIN clientes c ON v.id_cliente = c.id_cliente 
      WHERE v.id_venta = $1
    `, [id]);
    
    if (ventaResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Venta no encontrada' });
    }
    
    const venta = ventaResult.rows[0];
    
    // Obtener productos de la venta
    const detallesResult = await pool.query(`
      SELECT dv.*, p.nombre as producto_nombre, p.precio_venta
      FROM detalle_ventas dv 
      LEFT JOIN productos p ON dv.id_producto = p.id_producto 
      WHERE dv.id_venta = $1
    `, [id]);
    
    venta.productos = detallesResult.rows;
    
    res.json({
      success: true,
      data: venta
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Crear venta completa
app.post('/api/ventas-completas', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id_cliente, total, productos } = req.body;
    
    if (!id_cliente || !total || !productos || !Array.isArray(productos)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Faltan parámetros: id_cliente, total, productos (array)' 
      });
    }
    
    if (productos.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Debe incluir al menos un producto en la venta' 
      });
    }
    
    // 1. Verificar stock antes de proceder
    for (const producto of productos) {
      const productoInfo = await client.query(
        'SELECT stock, nombre, precio_venta FROM productos WHERE id_producto = $1',
        [producto.id_producto]
      );
      
      if (productoInfo.rows.length === 0) {
        throw new Error(`Producto con ID ${producto.id_producto} no encontrado`);
      }
      
      const stockDisponible = productoInfo.rows[0].stock;
      const cantidadSolicitada = producto.cantidad || 1;
      
      if (stockDisponible < cantidadSolicitada) {
        throw new Error(`Stock insuficiente para "${productoInfo.rows[0].nombre}". Disponible: ${stockDisponible}, Solicitado: ${cantidadSolicitada}`);
      }
      
      if (cantidadSolicitada <= 0) {
        throw new Error(`La cantidad para el producto "${productoInfo.rows[0].nombre}" debe ser mayor a 0`);
      }
    }
    
    // 2. Crear la venta principal
    const ventaResult = await client.query(
      `INSERT INTO ventas (id_cliente, fecha, total, estado) 
       VALUES ($1, NOW(), $2, $3) RETURNING *`,
      [id_cliente, total, 1] // Estado 1 = Completada por defecto
    );
    
    const ventaId = ventaResult.rows[0].id_venta;
    
    // 3. Crear los detalles de venta (productos)
    for (const producto of productos) {
      const cantidad = producto.cantidad || 1;
      const precio = producto.precio_unitario || productoInfo?.rows[0]?.precio_venta || 0;
      const subtotal = cantidad * precio;
      
      if (precio <= 0) {
        throw new Error(`El precio para el producto ${producto.id_producto} debe ser mayor a 0`);
      }
      
      await client.query(
        `INSERT INTO detalle_ventas (id_venta, id_producto, cantidad, precio, subtotal) 
         VALUES ($1, $2, $3, $4, $5)`,
        [ventaId, producto.id_producto, cantidad, precio, subtotal]
      );
      
      // 4. Actualizar stock de productos (RESTAR stock)
      await client.query(
        'UPDATE productos SET stock = stock - $1 WHERE id_producto = $2',
        [cantidad, producto.id_producto]
      );
      
      console.log(`📦 Venta ${ventaId}: Producto ${producto.id_producto} -${cantidad} unidades`);
    }
    
    await client.query('COMMIT');
    
    res.status(201).json({ 
      success: true, 
      message: '✅ Venta registrada exitosamente. Stock actualizado.',
      data: {
        venta: ventaResult.rows[0],
        productos_vendidos: productos.length,
        total_productos: productos.reduce((sum, p) => sum + (p.cantidad || 1), 0)
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error al registrar venta completa:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// Anular venta y devolver stock
app.patch('/api/ventas/:id/anular', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    
    // 1. Verificar si la venta existe
    const ventaResult = await client.query(
      `SELECT v.*, c.nombre as cliente_nombre 
       FROM ventas v 
       LEFT JOIN clientes c ON v.id_cliente = c.id_cliente 
       WHERE v.id_venta = $1`,
      [id]
    );
    
    if (ventaResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Venta no encontrada' });
    }
    
    const venta = ventaResult.rows[0];
    
    // Verificar que no esté ya anulada
    if (venta.estado === 2) {
      return res.status(400).json({ 
        success: false, 
        error: 'La venta ya está anulada' 
      });
    }
    
    // 2. Obtener los productos de la venta
    const detallesResult = await client.query(
      `SELECT dv.*, p.nombre as producto_nombre 
       FROM detalle_ventas dv 
       LEFT JOIN productos p ON dv.id_producto = p.id_producto 
       WHERE dv.id_venta = $1`,
      [id]
    );
    
    const productos = detallesResult.rows;
    
    if (productos.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'La venta no tiene productos' 
      });
    }
    
    // 3. Devolver cada producto al stock
    console.log(`📦 Anulando venta ${id}: Devolviendo ${productos.length} productos al stock`);
    
    for (const producto of productos) {
      await client.query(
        'UPDATE productos SET stock = stock + $1 WHERE id_producto = $2',
        [producto.cantidad, producto.id_producto]
      );
      
      console.log(`   ✅ Producto ${producto.producto_nombre} (ID: ${producto.id_producto}): +${producto.cantidad} unidades`);
    }
    
    // 4. Actualizar estado de la venta a "Anulada" (estado 2)
    const updateResult = await client.query(
      'UPDATE ventas SET estado = 2 WHERE id_venta = $1 RETURNING *',
      [id]
    );
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      message: '✅ Venta anulada exitosamente. Productos devueltos al stock.',
      data: {
        venta: updateResult.rows[0],
        productos_devueltos: productos.length
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error al anular venta:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// Eliminar venta (solo si está anulada)
app.delete('/api/ventas/:id', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    
    // 1. Verificar si la venta existe
    const ventaResult = await client.query(
      'SELECT * FROM ventas WHERE id_venta = $1',
      [id]
    );
    
    if (ventaResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Venta no encontrada' });
    }
    
    const venta = ventaResult.rows[0];
    
    // 2. Solo se puede eliminar si está anulada
    if (venta.estado !== 2) {
      return res.status(400).json({ 
        success: false, 
        error: 'No se puede eliminar una venta no anulada. Debe anularla primero.' 
      });
    }
    
    // 3. Eliminar detalles de venta
    await client.query(
      'DELETE FROM detalle_ventas WHERE id_venta = $1',
      [id]
    );
    
    // 4. Eliminar la venta
    const result = await client.query(
      'DELETE FROM ventas WHERE id_venta = $1 RETURNING *',
      [id]
    );
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      message: 'Venta eliminada exitosamente',
      data: result.rows[0] 
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error al eliminar venta:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// ==================== ENDPOINTS PARA PERMISOS ====================
app.get('/api/permisos', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, 
             CASE WHEN p.estado = 1 THEN 'Activo' ELSE 'Inactivo' END as estado_texto
      FROM permisos p 
      ORDER BY p.modulo, p.nombre_permiso
    `);
    
    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ENDPOINT PARA OBTENER MISMO USUARIO ====================
app.get('/api/perfil', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id_usuario;
    
    const result = await pool.query(`
      SELECT u.id_usuario, u.nombre_completo, u.email, u.usuario, 
             u.estado, r.nombre_rol, r.descripcion as rol_descripcion
      FROM usuarios u 
      LEFT JOIN roles r ON u.id_rol = r.id_rol 
      WHERE u.id_usuario = $1
    `, [userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ENDPOINT DE ESTADO ====================
app.get('/api/status', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as server_time');
    
    // Obtener conteos
    const [
      productosCount,
      clientesCount,
      ventasCount,
      usuariosCount,
      rolesCount,
      categoriasCount,
      comprasCount,
      proveedoresCount
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM productos WHERE estado = 1'),
      pool.query('SELECT COUNT(*) FROM clientes WHERE estado = 1'),
      pool.query('SELECT COUNT(*) FROM ventas WHERE estado = 1'),
      pool.query('SELECT COUNT(*) FROM usuarios WHERE estado = 1'),
      pool.query('SELECT COUNT(*) FROM roles WHERE estado = 1'),
      pool.query('SELECT COUNT(*) FROM categorias WHERE estado = 1'),
      pool.query('SELECT COUNT(*) FROM compras WHERE estado = 1'),
      pool.query('SELECT COUNT(*) FROM proveedores WHERE estado = 1')
    ]);
    
    res.json({
      success: true,
      message: '🚀 API StockBar funcionando correctamente',
      server_time: result.rows[0].server_time,
      version: '5.0.0',
      admin_por_defecto: ADMIN_EMAIL,
      database: 'Conectada correctamente',
      estadisticas: {
        productos_activos: parseInt(productosCount.rows[0].count),
        clientes_activos: parseInt(clientesCount.rows[0].count),
        ventas_completadas: parseInt(ventasCount.rows[0].count),
        usuarios_activos: parseInt(usuariosCount.rows[0].count),
        roles_activos: parseInt(rolesCount.rows[0].count),
        categorias_activas: parseInt(categoriasCount.rows[0].count),
        compras_activas: parseInt(comprasCount.rows[0].count),
        proveedores_activos: parseInt(proveedoresCount.rows[0].count)
      },
      endpoints_autenticacion: {
        verificar_email: 'POST /api/verificar-email',
        actualizar_password: 'POST /api/actualizar-password',
        login: 'POST /api/login',
        perfil: 'GET /api/perfil (requiere token)'
      },
      endpoints_principales: {
        roles: 'GET /api/roles (CRUD completo)',
        usuarios: 'GET /api/usuarios (CRUD completo)',
        permisos: 'GET /api/permisos',
        categorias: 'GET /api/categorias (CRUD completo)',
        compras: 'GET /api/compras (CRUD completo)',
        productos: 'GET /api/productos (CRUD completo)',
        clientes: 'GET /api/clientes (CRUD completo)',
        proveedores: 'GET /api/proveedores (CRUD completo)',
        ventas: 'GET /api/ventas (CRUD completo)',
        ventas_completas: 'POST /api/ventas-completas',
        anular_venta: 'PATCH /api/ventas/:id/anular',
        anular_compra: 'PATCH /api/compras/:id/anular'
      },
      notas_importantes: [
        'Admin por defecto protegido (no se puede eliminar o desactivar)',
        'Todos los CRUD incluyen: listar, obtener por ID, crear, actualizar, cambiar estado y eliminar',
        'Las ventas y compras controlan automáticamente el stock',
        'No se puede eliminar registros que tienen relaciones activas'
      ]
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      database_status: 'Error de conexión'
    });
  }
});

// ==================== ENDPOINT PARA VERIFICAR DATOS EXISTENTES ====================
app.get('/api/check-data', async (req, res) => {
  try {
    // Verificar si el admin existe
    const adminResult = await pool.query(
      'SELECT * FROM usuarios WHERE email = $1',
      [ADMIN_EMAIL]
    );
    
    // Obtener todos los conteos
    const [
      rolesCount,
      usuariosCount,
      categoriasCount,
      productosCount,
      permisosCount,
      clientesCount,
      proveedoresCount,
      comprasCount,
      ventasCount
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM roles'),
      pool.query('SELECT COUNT(*) FROM usuarios'),
      pool.query('SELECT COUNT(*) FROM categorias'),
      pool.query('SELECT COUNT(*) FROM productos'),
      pool.query('SELECT COUNT(*) FROM permisos'),
      pool.query('SELECT COUNT(*) FROM clientes'),
      pool.query('SELECT COUNT(*) FROM proveedores'),
      pool.query('SELECT COUNT(*) FROM compras'),
      pool.query('SELECT COUNT(*) FROM ventas')
    ]);
    
    res.json({
      success: true,
      admin_exists: adminResult.rows.length > 0,
      admin_data: adminResult.rows[0] || null,
      conteos: {
        roles: parseInt(rolesCount.rows[0].count),
        usuarios: parseInt(usuariosCount.rows[0].count),
        categorias: parseInt(categoriasCount.rows[0].count),
        productos: parseInt(productosCount.rows[0].count),
        permisos: parseInt(permisosCount.rows[0].count),
        clientes: parseInt(clientesCount.rows[0].count),
        proveedores: parseInt(proveedoresCount.rows[0].count),
        compras: parseInt(comprasCount.rows[0].count),
        ventas: parseInt(ventasCount.rows[0].count)
      },
      nota: 'Si el admin no existe, se creará automáticamente al iniciar el servidor'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Ruta principal
app.get('/', (req, res) => {
  res.json({
    message: '🚀 API StockBar - Sistema de Gestión para Licorería',
    version: '5.0.0',
    admin_por_defecto: ADMIN_EMAIL,
    database: 'Conectada a PostgreSQL',
    features: [
      '✅ Sistema de autenticación completo',
      '✅ Admin por defecto protegido',
      '✅ Gestión de roles y permisos',
      '✅ CRUD completo para todas las entidades',
      '✅ Control automático de stock en ventas/compras',
      '✅ Cambio de estado (activar/desactivar)',
      '✅ Validaciones de integridad referencial'
    ],
    login_admin: {
      email: ADMIN_EMAIL,
      password: 'admin123 (se crea automáticamente)'
    },
    endpoints_disponibles: 'Visita /api/status para ver todos los endpoints',
    documentacion: {
      autenticacion: 'Todos los endpoints excepto /, /api/status y /api/check-data requieren token',
      obtener_token: 'Hacer POST a /api/login con email y password',
      incluir_token: 'En header: Authorization: Bearer {token}'
    }
  });
});

// ==================== FUNCIÓN PARA CREAR ADMIN SI NO EXISTE ====================
async function ensureAdminExists() {
  try {
    console.log('🔍 Verificando si el admin existe...');
    
    const adminResult = await pool.query(
      'SELECT * FROM usuarios WHERE email = $1',
      [ADMIN_EMAIL]
    );
    
    if (adminResult.rows.length === 0) {
      console.log('⚠️ Admin no encontrado, creando administrador por defecto...');
      
      // Verificar si existe el rol Administrador
      const rolResult = await pool.query(
        'SELECT id_rol FROM roles WHERE nombre_rol = $1',
        ['Administrador']
      );
      
      let idRol;
      if (rolResult.rows.length > 0) {
        idRol = rolResult.rows[0].id_rol;
      } else {
        // Crear rol Administrador si no existe
        const nuevoRol = await pool.query(
          'INSERT INTO roles (nombre_rol, descripcion, estado) VALUES ($1, $2, $3) RETURNING id_rol',
          ['Administrador', 'Acceso total al sistema', 1]
        );
        idRol = nuevoRol.rows[0].id_rol;
        
        // Asignar todos los permisos al rol Administrador
        const todosPermisos = await pool.query('SELECT id_permiso FROM permisos');
        for (const permiso of todosPermisos.rows) {
          await pool.query(
            'INSERT INTO ver_detalle_rol (id_rol, id_permiso) VALUES ($1, $2)',
            [idRol, permiso.id_permiso]
          );
        }
      }
      
      // Hashear contraseña por defecto
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      // Crear usuario admin
      await pool.query(
        `INSERT INTO usuarios (id_rol, nombre_completo, email, usuario, contraseña, estado) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [idRol, 'Administrador Principal', ADMIN_EMAIL, 'admin', hashedPassword, 1]
      );
      
      console.log('✅ Admin creado exitosamente con acceso total');
    } else {
      console.log('✅ Admin ya existe en la base de datos');
    }
  } catch (error) {
    console.error('❌ Error al verificar/crear admin:', error);
  }
}

// ==================== MANEJO DE ERRORES 404 ====================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint no encontrado',
    metodo: req.method,
    url: req.originalUrl,
    sugerencia: 'Visite /api/status para ver los endpoints disponibles'
  });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', async () => {
  console.log('🚀 Servidor API StockBar - VERSION 5.0');
  console.log('📡 Puerto: ' + PORT);
  console.log('🌐 URL: http://localhost:' + PORT);
  console.log('🗄️  Base de datos: PostgreSQL conectada');
  console.log('🔐 Admin por defecto: ' + ADMIN_EMAIL);
  console.log('🛡️  Admin protegido contra eliminación/desactivación');
  
  // Verificar y crear admin si no existe
  await ensureAdminExists();
  
  console.log('\n📚 Endpoints principales:');
  console.log('   GET  /api/status                 - Estado del sistema');
  console.log('   POST /api/login                  - Iniciar sesión');
  console.log('   POST /api/verificar-email        - Recuperar contraseña (¡SOLO POST!)');
  console.log('   GET  /api/check-data             - Verificar datos');
  console.log('\n📋 CRUD completos disponibles para:');
  console.log('   • Roles        (/api/roles)');
  console.log('   • Usuarios     (/api/usuarios)');
  console.log('   • Categorías   (/api/categorias)');
  console.log('   • Productos    (/api/productos)');
  console.log('   • Proveedores  (/api/proveedores)');
  console.log('   • Clientes     (/api/clientes)');
  console.log('   • Compras      (/api/compras)');
  console.log('   • Ventas       (/api/ventas)');
  console.log('\n💡 Para login usar:');
  console.log('   Email: ' + ADMIN_EMAIL);
  console.log('   Password: admin123 (creado automáticamente)');
  console.log('\n⚠️  IMPORTANTE: /api/verificar-email es POST, no GET');
});
