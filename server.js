const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const app = express();

// ✅ CONEXIÓN A LA BASE DE DATOS
const pool = new Pool({
  connectionString: 'postgresql://stockbar_user:0EndlOqYMUMDsuYAlnjyQ35Vzs3rFh1V@dpg-d4dmar9r0fns73eplq4g-a/stockbar_db',
  ssl: { rejectUnauthorized: false }
});

// CONFIGURACIÓN
app.use(cors({ origin: '*' }));
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ==================== MIDDLEWARE DE AUTENTICACIÓN ====================
const authenticateToken = async (req, res, next) => {
  try {
    let token = req.headers['authorization'];
    
    if (token && token.startsWith('Bearer ')) {
      token = token.slice(7);
    }
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Token requerido' 
      });
    }
    
    // Decodificar token
    const decoded = Buffer.from(token, 'base64').toString('ascii');
    const [userId] = decoded.split(':');
    
    // Buscar usuario con información de rol
    const result = await pool.query(`
      SELECT u.*, r.nombre_rol
      FROM "Usuarios" u
      LEFT JOIN "Roles" r ON u.id_rol = r.id_rol
      WHERE u.id_usuario = $1 AND u.estado = 1
    `, [parseInt(userId)]);
    
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

// Middleware para verificar roles (1 = Admin)
const checkRole = (rolesPermitidos) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Usuario no autenticado' 
      });
    }
    
    // Si el usuario es admin (id_rol: 1), permitir todo
    if (req.user.id_rol === 1) {
      return next();
    }
    
    // Verificar si el rol del usuario está en los permitidos
    if (!rolesPermitidos.includes(req.user.id_rol)) {
      return res.status(403).json({ 
        success: false, 
        message: 'No tiene permisos para esta acción' 
      });
    }
    
    next();
  };
};

// ==================== ENDPOINTS DE ROLES ====================

// 1. LISTAR ROLES
app.get('/api/roles', authenticateToken, checkRole([1, 2]), async (req, res) => {
  try {
    console.log(`📡 ${req.user.email} solicitando roles`);
    
    const result = await pool.query(`
      SELECT * FROM "Roles" 
      ORDER BY id_rol
    `);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} roles encontrados`,
      data: result.rows || []
    });
    
  } catch (error) {
    console.error('Error listar roles:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 2. VER DETALLE DE ROL
app.get('/api/roles/:id', authenticateToken, checkRole([1, 2]), async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM "Roles" WHERE id_rol = $1',
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
    console.error('Error ver detalle rol:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 3. CREAR ROL
app.post('/api/roles', authenticateToken, checkRole([1]), async (req, res) => {
  try {
    const { nombre_rol, descripcion } = req.body;
    
    if (!nombre_rol) {
      return res.status(400).json({
        success: false,
        message: 'El nombre del rol es requerido'
      });
    }
    
    // Verificar si el rol ya existe
    const existeRol = await pool.query(
      'SELECT id_rol FROM "Roles" WHERE LOWER(nombre_rol) = LOWER($1)',
      [nombre_rol]
    );
    
    if (existeRol.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un rol con ese nombre'
      });
    }
    
    const result = await pool.query(
      `INSERT INTO "Roles" (nombre_rol, descripcion, estado) 
       VALUES ($1, $2, 1) 
       RETURNING *`,
      [nombre_rol, descripcion]
    );
    
    console.log(`✅ Rol "${nombre_rol}" creado por ${req.user.email}`);
    
    res.status(201).json({
      success: true,
      message: '✅ Rol creado exitosamente',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error crear rol:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 4. ACTUALIZAR ROL
app.put('/api/roles/:id', authenticateToken, checkRole([1]), async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre_rol, descripcion } = req.body;
    
    // No permitir editar el rol de administrador (id: 1)
    if (id === '1') {
      return res.status(400).json({
        success: false,
        message: 'No se puede editar el rol de administrador'
      });
    }
    
    // Verificar que el rol existe
    const rolExiste = await pool.query(
      'SELECT id_rol FROM "Roles" WHERE id_rol = $1',
      [id]
    );
    
    if (rolExiste.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Rol no encontrado'
      });
    }
    
    // Verificar nombre único (si se está actualizando)
    if (nombre_rol) {
      const nombreExiste = await pool.query(
        'SELECT id_rol FROM "Roles" WHERE LOWER(nombre_rol) = LOWER($1) AND id_rol != $2',
        [nombre_rol, id]
      );
      
      if (nombreExiste.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe otro rol con ese nombre'
        });
      }
    }
    
    const result = await pool.query(
      `UPDATE "Roles" 
       SET nombre_rol = COALESCE($1, nombre_rol),
           descripcion = COALESCE($2, descripcion)
       WHERE id_rol = $3
       RETURNING *`,
      [nombre_rol, descripcion, id]
    );
    
    console.log(`✅ Rol ID ${id} actualizado por ${req.user.email}`);
    
    res.json({
      success: true,
      message: '✅ Rol actualizado exitosamente',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error actualizar rol:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 5. CAMBIAR ESTADO DE ROL
app.put('/api/roles/:id/estado', authenticateToken, checkRole([1]), async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    if (estado === undefined) {
      return res.status(400).json({
        success: false,
        message: 'El estado es requerido'
      });
    }
    
    // No permitir desactivar el rol de administrador (id: 1)
    if (id === '1' && estado === 0) {
      return res.status(400).json({
        success: false,
        message: 'No se puede desactivar el rol de administrador'
      });
    }
    
    // Verificar que el rol existe
    const rolExiste = await pool.query(
      'SELECT id_rol FROM "Roles" WHERE id_rol = $1',
      [id]
    );
    
    if (rolExiste.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Rol no encontrado'
      });
    }
    
    // Verificar si hay usuarios usando este rol
    if (estado === 0) {
      const usuariosConRol = await pool.query(
        'SELECT COUNT(*) FROM "Usuarios" WHERE id_rol = $1 AND estado = 1',
        [id]
      );
      
      if (parseInt(usuariosConRol.rows[0].count) > 0) {
        return res.status(400).json({
          success: false,
          message: 'No se puede desactivar el rol porque hay usuarios activos asignados'
        });
      }
    }
    
    await pool.query(
      'UPDATE "Roles" SET estado = $1 WHERE id_rol = $2',
      [estado, id]
    );
    
    const estadoTexto = estado === 1 ? 'activado' : 'desactivado';
    console.log(`✅ Rol ID ${id} ${estadoTexto} por ${req.user.email}`);
    
    res.json({
      success: true,
      message: `✅ Rol ${estadoTexto} exitosamente`
    });
    
  } catch (error) {
    console.error('Error cambiar estado rol:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 6. ELIMINAR ROL
app.delete('/api/roles/:id', authenticateToken, checkRole([1]), async (req, res) => {
  try {
    const { id } = req.params;
    
    // No permitir eliminar el rol de administrador (id: 1)
    if (id === '1') {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar el rol de administrador'
      });
    }
    
    // Verificar que el rol existe
    const rolExiste = await pool.query(
      'SELECT id_rol FROM "Roles" WHERE id_rol = $1',
      [id]
    );
    
    if (rolExiste.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Rol no encontrado'
      });
    }
    
    // Verificar si hay usuarios usando este rol
    const usuariosConRol = await pool.query(
      'SELECT COUNT(*) FROM "Usuarios" WHERE id_rol = $1',
      [id]
    );
    
    if (parseInt(usuariosConRol.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar el rol porque hay usuarios asignados'
      });
    }
    
    await pool.query('DELETE FROM "Roles" WHERE id_rol = $1', [id]);
    
    console.log(`🗑️ Rol ID ${id} eliminado por ${req.user.email}`);
    
    res.json({
      success: true,
      message: '✅ Rol eliminado exitosamente'
    });
    
  } catch (error) {
    console.error('Error eliminar rol:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// ==================== ENDPOINTS DE USUARIOS ====================

// 1. LISTAR USUARIOS
app.get('/api/usuarios', authenticateToken, checkRole([1, 2]), async (req, res) => {
  try {
    console.log(`📡 ${req.user.email} solicitando usuarios`);
    
    const result = await pool.query(`
      SELECT u.*, r.nombre_rol 
      FROM "Usuarios" u
      LEFT JOIN "Roles" r ON u.id_rol = r.id_rol
      ORDER BY u.id_usuario DESC
    `);
    
    // Ocultar contraseñas
    const usuariosSinPassword = result.rows.map(user => {
      const { contraseña, ...userSinPassword } = user;
      return userSinPassword;
    });
    
    res.json({
      success: true,
      message: `✅ ${usuariosSinPassword.length} usuarios encontrados`,
      data: usuariosSinPassword
    });
    
  } catch (error) {
    console.error('Error listar usuarios:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 2. VER DETALLE DE USUARIO
app.get('/api/usuarios/:id', authenticateToken, checkRole([1, 2]), async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT u.*, r.nombre_rol 
      FROM "Usuarios" u
      LEFT JOIN "Roles" r ON u.id_rol = r.id_rol
      WHERE u.id_usuario = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    // Ocultar contraseña
    const { contraseña, ...usuario } = result.rows[0];
    
    res.json({
      success: true,
      data: usuario
    });
    
  } catch (error) {
    console.error('Error ver detalle usuario:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 3. REGISTRAR NUEVO USUARIO
app.post('/api/usuarios', authenticateToken, checkRole([1]), async (req, res) => {
  try {
    const { 
      email, 
      password, 
      confirm_password, 
      nombre_completo, 
      usuario, 
      id_rol = 2 
    } = req.body;
    
    // Validaciones
    if (!email || !password || !confirm_password || !nombre_completo) {
      return res.status(400).json({
        success: false,
        message: 'Email, contraseña, confirmación y nombre son requeridos'
      });
    }
    
    if (password !== confirm_password) {
      return res.status(400).json({
        success: false,
        message: 'Las contraseñas no coinciden'
      });
    }
    
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 6 caracteres'
      });
    }
    
    // Verificar si el email ya existe
    const emailExiste = await pool.query(
      'SELECT id_usuario FROM "Usuarios" WHERE email = $1',
      [email]
    );
    
    if (emailExiste.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un usuario con ese email'
      });
    }
    
    // Verificar si el nombre de usuario ya existe (si se proporciona)
    if (usuario) {
      const usuarioExiste = await pool.query(
        'SELECT id_usuario FROM "Usuarios" WHERE usuario = $1',
        [usuario]
      );
      
      if (usuarioExiste.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe un usuario con ese nombre de usuario'
        });
      }
    }
    
    // Hash de la contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    const result = await pool.query(
      `INSERT INTO "Usuarios" (
        email, contraseña, nombre_completo, usuario, id_rol, estado
      ) VALUES ($1, $2, $3, $4, $5, 1) 
      RETURNING id_usuario, email, nombre_completo, usuario, id_rol, estado`,
      [email, hashedPassword, nombre_completo, usuario, id_rol]
    );
    
    console.log(`✅ Usuario "${email}" creado por ${req.user.email}`);
    
    res.status(201).json({
      success: true,
      message: '✅ Usuario registrado exitosamente',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error registrar usuario:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 4. ACTUALIZAR USUARIO
app.put('/api/usuarios/:id', authenticateToken, checkRole([1]), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      email, 
      nombre_completo, 
      usuario, 
      id_rol 
    } = req.body;
    
    // Verificar que el usuario existe
    const usuarioExiste = await pool.query(
      'SELECT id_usuario FROM "Usuarios" WHERE id_usuario = $1',
      [id]
    );
    
    if (usuarioExiste.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    // Verificar email único (si se está actualizando)
    if (email) {
      const emailExiste = await pool.query(
        'SELECT id_usuario FROM "Usuarios" WHERE email = $1 AND id_usuario != $2',
        [email, id]
      );
      
      if (emailExiste.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe otro usuario con ese email'
        });
      }
    }
    
    // Verificar nombre de usuario único (si se está actualizando)
    if (usuario) {
      const usuarioExiste = await pool.query(
        'SELECT id_usuario FROM "Usuarios" WHERE usuario = $1 AND id_usuario != $2',
        [usuario, id]
      );
      
      if (usuarioExiste.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe otro usuario con ese nombre de usuario'
        });
      }
    }
    
    const result = await pool.query(
      `UPDATE "Usuarios" 
       SET email = COALESCE($1, email),
           nombre_completo = COALESCE($2, nombre_completo),
           usuario = COALESCE($3, usuario),
           id_rol = COALESCE($4, id_rol)
       WHERE id_usuario = $5
       RETURNING id_usuario, email, nombre_completo, usuario, id_rol, estado`,
      [email, nombre_completo, usuario, id_rol, id]
    );
    
    console.log(`✅ Usuario ID ${id} actualizado por ${req.user.email}`);
    
    res.json({
      success: true,
      message: '✅ Usuario actualizado exitosamente',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error actualizar usuario:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 5. CAMBIAR CONTRASEÑA
app.put('/api/usuarios/:id/password', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      current_password, 
      new_password, 
      confirm_password 
    } = req.body;
    
    // Solo el propio usuario o admin puede cambiar la contraseña
    if (req.user.id_usuario != id && req.user.id_rol !== 1) {
      return res.status(403).json({
        success: false,
        message: 'No tiene permisos para cambiar esta contraseña'
      });
    }
    
    if (!current_password || !new_password || !confirm_password) {
      return res.status(400).json({
        success: false,
        message: 'Todos los campos de contraseña son requeridos'
      });
    }
    
    if (new_password !== confirm_password) {
      return res.status(400).json({
        success: false,
        message: 'Las nuevas contraseñas no coinciden'
      });
    }
    
    if (new_password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'La nueva contraseña debe tener al menos 6 caracteres'
      });
    }
    
    // Obtener usuario actual
    const result = await pool.query(
      'SELECT contraseña FROM "Usuarios" WHERE id_usuario = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    const dbPassword = result.rows[0].contraseña;
    
    // Verificar contraseña actual
    let validPassword = false;
    
    if (dbPassword === current_password) {
      validPassword = true;
    } else if (dbPassword.startsWith('$2')) {
      validPassword = await bcrypt.compare(current_password, dbPassword);
    }
    
    if (!validPassword) {
      return res.status(400).json({
        success: false,
        message: 'Contraseña actual incorrecta'
      });
    }
    
    // Hash de la nueva contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(new_password, salt);
    
    await pool.query(
      'UPDATE "Usuarios" SET contraseña = $1 WHERE id_usuario = $2',
      [hashedPassword, id]
    );
    
    console.log(`🔑 Contraseña del usuario ID ${id} cambiada por ${req.user.email}`);
    
    res.json({
      success: true,
      message: '✅ Contraseña cambiada exitosamente'
    });
    
  } catch (error) {
    console.error('Error cambiar contraseña:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 6. CAMBIAR ESTADO DE USUARIO
app.put('/api/usuarios/:id/estado', authenticateToken, checkRole([1]), async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    if (estado === undefined) {
      return res.status(400).json({
        success: false,
        message: 'El estado es requerido'
      });
    }
    
    // Verificar que el usuario existe
    const usuarioExiste = await pool.query(
      'SELECT id_usuario FROM "Usuarios" WHERE id_usuario = $1',
      [id]
    );
    
    if (usuarioExiste.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    // No permitir desactivarse a sí mismo
    if (req.user.id_usuario == id) {
      return res.status(400).json({
        success: false,
        message: 'No puede cambiar su propio estado'
      });
    }
    
    await pool.query(
      'UPDATE "Usuarios" SET estado = $1 WHERE id_usuario = $2',
      [estado, id]
    );
    
    const estadoTexto = estado === 1 ? 'activado' : 'desactivado';
    console.log(`✅ Usuario ID ${id} ${estadoTexto} por ${req.user.email}`);
    
    res.json({
      success: true,
      message: `✅ Usuario ${estadoTexto} exitosamente`
    });
    
  } catch (error) {
    console.error('Error cambiar estado usuario:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 7. ELIMINAR USUARIO
app.delete('/api/usuarios/:id', authenticateToken, checkRole([1]), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar que el usuario existe
    const usuarioExiste = await pool.query(
      'SELECT id_usuario FROM "Usuarios" WHERE id_usuario = $1',
      [id]
    );
    
    if (usuarioExiste.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    // No permitir eliminarse a sí mismo
    if (req.user.id_usuario == id) {
      return res.status(400).json({
        success: false,
        message: 'No puede eliminar su propia cuenta'
      });
    }
    
    // Eliminación física
    await pool.query('DELETE FROM "Usuarios" WHERE id_usuario = $1', [id]);
    
    console.log(`🗑️ Usuario ID ${id} eliminado por ${req.user.email}`);
    
    res.json({
      success: true,
      message: '✅ Usuario eliminado exitosamente'
    });
    
  } catch (error) {
    console.error('Error eliminar usuario:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// ==================== ENDPOINTS DE CATEGORÍAS ====================

// 1. LISTAR CATEGORÍAS
app.get('/api/categorias', authenticateToken, async (req, res) => {
  try {
    console.log(`📡 ${req.user.email} solicitando categorías`);
    
    const result = await pool.query(`
      SELECT * FROM "Categorias" 
      WHERE estado = 1 
      ORDER BY nombre
    `);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} categorías encontradas`,
      data: result.rows || []
    });
    
  } catch (error) {
    console.error('Error listar categorías:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 2. VER DETALLE DE CATEGORÍA
app.get('/api/categorias/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM "Categorias" WHERE id_categoria = $1',
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
    console.error('Error ver detalle categoría:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 3. CREAR CATEGORÍA
app.post('/api/categorias', authenticateToken, checkRole([1, 2]), async (req, res) => {
  try {
    const { nombre, descripcion } = req.body;
    
    if (!nombre) {
      return res.status(400).json({
        success: false,
        message: 'El nombre de la categoría es requerido'
      });
    }
    
    // Verificar si la categoría ya existe
    const existeCategoria = await pool.query(
      'SELECT id_categoria FROM "Categorias" WHERE LOWER(nombre) = LOWER($1)',
      [nombre]
    );
    
    if (existeCategoria.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe una categoría con ese nombre'
      });
    }
    
    const result = await pool.query(
      `INSERT INTO "Categorias" (nombre, descripcion, estado) 
       VALUES ($1, $2, 1) 
       RETURNING *`,
      [nombre, descripcion]
    );
    
    console.log(`✅ Categoría "${nombre}" creada por ${req.user.email}`);
    
    res.status(201).json({
      success: true,
      message: '✅ Categoría creada exitosamente',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error crear categoría:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 4. ACTUALIZAR CATEGORÍA
app.put('/api/categorias/:id', authenticateToken, checkRole([1, 2]), async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion } = req.body;
    
    // Verificar que la categoría existe
    const categoriaExiste = await pool.query(
      'SELECT id_categoria FROM "Categorias" WHERE id_categoria = $1',
      [id]
    );
    
    if (categoriaExiste.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Categoría no encontrada'
      });
    }
    
    // Verificar nombre único (si se está actualizando)
    if (nombre) {
      const nombreExiste = await pool.query(
        'SELECT id_categoria FROM "Categorias" WHERE LOWER(nombre) = LOWER($1) AND id_categoria != $2',
        [nombre, id]
      );
      
      if (nombreExiste.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe otra categoría con ese nombre'
        });
      }
    }
    
    const result = await pool.query(
      `UPDATE "Categorias" 
       SET nombre = COALESCE($1, nombre),
           descripcion = COALESCE($2, descripcion)
       WHERE id_categoria = $3
       RETURNING *`,
      [nombre, descripcion, id]
    );
    
    console.log(`✅ Categoría ID ${id} actualizada por ${req.user.email}`);
    
    res.json({
      success: true,
      message: '✅ Categoría actualizada exitosamente',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error actualizar categoría:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 5. CAMBIAR ESTADO DE CATEGORÍA
app.put('/api/categorias/:id/estado', authenticateToken, checkRole([1, 2]), async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    if (estado === undefined) {
      return res.status(400).json({
        success: false,
        message: 'El estado es requerido'
      });
    }
    
    // Verificar que la categoría existe
    const categoriaExiste = await pool.query(
      'SELECT id_categoria FROM "Categorias" WHERE id_categoria = $1',
      [id]
    );
    
    if (categoriaExiste.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Categoría no encontrada'
      });
    }
    
    // Verificar si hay productos usando esta categoría
    if (estado === 0) {
      const productosConCategoria = await pool.query(
        'SELECT COUNT(*) FROM "Productos" WHERE id_categoria = $1 AND estado = 1',
        [id]
      );
      
      if (parseInt(productosConCategoria.rows[0].count) > 0) {
        return res.status(400).json({
          success: false,
          message: 'No se puede desactivar la categoría porque hay productos activos asignados'
        });
      }
    }
    
    await pool.query(
      'UPDATE "Categorias" SET estado = $1 WHERE id_categoria = $2',
      [estado, id]
    );
    
    const estadoTexto = estado === 1 ? 'activada' : 'desactivada';
    console.log(`✅ Categoría ID ${id} ${estadoTexto} por ${req.user.email}`);
    
    res.json({
      success: true,
      message: `✅ Categoría ${estadoTexto} exitosamente`
    });
    
  } catch (error) {
    console.error('Error cambiar estado categoría:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 6. ELIMINAR CATEGORÍA
app.delete('/api/categorias/:id', authenticateToken, checkRole([1]), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar que la categoría existe
    const categoriaExiste = await pool.query(
      'SELECT id_categoria FROM "Categorias" WHERE id_categoria = $1',
      [id]
    );
    
    if (categoriaExiste.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Categoría no encontrada'
      });
    }
    
    // Verificar si hay productos usando esta categoría
    const productosConCategoria = await pool.query(
      'SELECT COUNT(*) FROM "Productos" WHERE id_categoria = $1',
      [id]
    );
    
    if (parseInt(productosConCategoria.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar la categoría porque hay productos asignados'
      });
    }
    
    await pool.query('DELETE FROM "Categorias" WHERE id_categoria = $1', [id]);
    
    console.log(`🗑️ Categoría ID ${id} eliminada por ${req.user.email}`);
    
    res.json({
      success: true,
      message: '✅ Categoría eliminada exitosamente'
    });
    
  } catch (error) {
    console.error('Error eliminar categoría:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// ==================== ENDPOINTS DE PRODUCTOS ====================

// 1. LISTAR PRODUCTOS
app.get('/api/productos', authenticateToken, async (req, res) => {
  try {
    console.log(`📡 ${req.user.email} solicitando productos`);
    
    const result = await pool.query(`
      SELECT p.*, c.nombre as categoria_nombre 
      FROM "Productos" p
      LEFT JOIN "Categorias" c ON p.id_categoria = c.id_categoria
      WHERE p.estado = 1 
      ORDER BY p.nombre
    `);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} productos encontrados`,
      data: result.rows || []
    });
    
  } catch (error) {
    console.error('Error listar productos:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 2. VER DETALLE DE PRODUCTO
app.get('/api/productos/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT p.*, c.nombre as categoria_nombre 
      FROM "Productos" p
      LEFT JOIN "Categorias" c ON p.id_categoria = c.id_categoria
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
    console.error('Error ver detalle producto:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 3. BUSCAR PRODUCTOS POR NOMBRE
app.get('/api/productos/buscar/:termino', authenticateToken, async (req, res) => {
  try {
    const { termino } = req.params;
    
    const result = await pool.query(`
      SELECT p.*, c.nombre as categoria_nombre 
      FROM "Productos" p
      LEFT JOIN "Categorias" c ON p.id_categoria = c.id_categoria
      WHERE (p.nombre ILIKE $1) AND p.estado = 1
      ORDER BY p.nombre
      LIMIT 20
    `, [`%${termino}%`]);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} productos encontrados`,
      data: result.rows || []
    });
    
  } catch (error) {
    console.error('Error buscar productos:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 4. CREAR PRODUCTO
app.post('/api/productos', authenticateToken, checkRole([1, 2]), async (req, res) => {
  try {
    const { 
      nombre, 
      id_categoria, 
      stock = 0, 
      precio_compra, 
      precio_venta 
    } = req.body;
    
    // Validaciones
    if (!nombre || !precio_venta) {
      return res.status(400).json({
        success: false,
        message: 'Nombre y precio de venta son requeridos'
      });
    }
    
    if (precio_venta <= 0) {
      return res.status(400).json({
        success: false,
        message: 'El precio de venta debe ser mayor a 0'
      });
    }
    
    if (stock < 0) {
      return res.status(400).json({
        success: false,
        message: 'El stock no puede ser negativo'
      });
    }
    
    const result = await pool.query(
      `INSERT INTO "Productos" (
        nombre, id_categoria, stock, precio_compra, precio_venta, estado
      ) VALUES ($1, $2, $3, $4, $5, 1) 
      RETURNING *`,
      [nombre, id_categoria, stock, precio_compra || 0, precio_venta]
    );
    
    console.log(`✅ Producto "${nombre}" creado por ${req.user.email}`);
    
    res.status(201).json({
      success: true,
      message: '✅ Producto creado exitosamente',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error crear producto:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 5. ACTUALIZAR PRODUCTO
app.put('/api/productos/:id', authenticateToken, checkRole([1, 2]), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      nombre, 
      id_categoria, 
      stock, 
      precio_compra, 
      precio_venta 
    } = req.body;
    
    // Verificar que el producto existe
    const productoExiste = await pool.query(
      'SELECT id_producto FROM "Productos" WHERE id_producto = $1',
      [id]
    );
    
    if (productoExiste.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Producto no encontrado'
      });
    }
    
    // Validaciones
    if (precio_venta !== undefined && precio_venta <= 0) {
      return res.status(400).json({
        success: false,
        message: 'El precio de venta debe ser mayor a 0'
      });
    }
    
    if (stock !== undefined && stock < 0) {
      return res.status(400).json({
        success: false,
        message: 'El stock no puede ser negativo'
      });
    }
    
    const result = await pool.query(
      `UPDATE "Productos" 
       SET nombre = COALESCE($1, nombre),
           id_categoria = COALESCE($2, id_categoria),
           stock = COALESCE($3, stock),
           precio_compra = COALESCE($4, precio_compra),
           precio_venta = COALESCE($5, precio_venta)
       WHERE id_producto = $6
       RETURNING *`,
      [nombre, id_categoria, stock, precio_compra, precio_venta, id]
    );
    
    console.log(`✅ Producto ID ${id} actualizado por ${req.user.email}`);
    
    res.json({
      success: true,
      message: '✅ Producto actualizado exitosamente',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error actualizar producto:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 6. ACTUALIZAR STOCK DE PRODUCTO
app.put('/api/productos/:id/stock', authenticateToken, checkRole([1, 2]), async (req, res) => {
  try {
    const { id } = req.params;
    const { cantidad, tipo } = req.body;
    
    if (!cantidad || cantidad <= 0) {
      return res.status(400).json({
        success: false,
        message: 'La cantidad debe ser mayor a 0'
      });
    }
    
    if (!tipo || !['entrada', 'salida'].includes(tipo)) {
      return res.status(400).json({
        success: false,
        message: 'Tipo inválido. Use: "entrada" o "salida"'
      });
    }
    
    const productoExiste = await pool.query(
      'SELECT stock FROM "Productos" WHERE id_producto = $1',
      [id]
    );
    
    if (productoExiste.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Producto no encontrado'
      });
    }
    
    const stockActual = productoExiste.rows[0].stock;
    
    if (tipo === 'salida' && stockActual < cantidad) {
      return res.status(400).json({
        success: false,
        message: `Stock insuficiente. Actual: ${stockActual}, Requerido: ${cantidad}`
      });
    }
    
    const nuevoStock = tipo === 'entrada' 
      ? stockActual + cantidad 
      : stockActual - cantidad;
    
    await pool.query(
      'UPDATE "Productos" SET stock = $1 WHERE id_producto = $2',
      [nuevoStock, id]
    );
    
    const operacion = tipo === 'entrada' ? 'incrementado' : 'disminuido';
    console.log(`📦 Stock del producto ID ${id} ${operacion} por ${req.user.email}`);
    
    res.json({
      success: true,
      message: `✅ Stock ${operacion} exitosamente`,
      data: {
        stock_anterior: stockActual,
        stock_nuevo: nuevoStock,
        diferencia: tipo === 'entrada' ? cantidad : -cantidad
      }
    });
    
  } catch (error) {
    console.error('Error actualizar stock:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 7. CAMBIAR ESTADO DE PRODUCTO
app.put('/api/productos/:id/estado', authenticateToken, checkRole([1, 2]), async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    if (estado === undefined) {
      return res.status(400).json({
        success: false,
        message: 'El estado es requerido'
      });
    }
    
    const productoExiste = await pool.query(
      'SELECT id_producto FROM "Productos" WHERE id_producto = $1',
      [id]
    );
    
    if (productoExiste.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Producto no encontrado'
      });
    }
    
    await pool.query(
      'UPDATE "Productos" SET estado = $1 WHERE id_producto = $2',
      [estado, id]
    );
    
    const estadoTexto = estado === 1 ? 'activado' : 'desactivado';
    console.log(`✅ Producto ID ${id} ${estadoTexto} por ${req.user.email}`);
    
    res.json({
      success: true,
      message: `✅ Producto ${estadoTexto} exitosamente`
    });
    
  } catch (error) {
    console.error('Error cambiar estado producto:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 8. ELIMINAR PRODUCTO
app.delete('/api/productos/:id', authenticateToken, checkRole([1]), async (req, res) => {
  try {
    const { id } = req.params;
    
    const productoExiste = await pool.query(
      'SELECT id_producto FROM "Productos" WHERE id_producto = $1',
      [id]
    );
    
    if (productoExiste.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Producto no encontrado'
      });
    }
    
    // Verificar si hay ventas o compras asociadas
    const ventasConProducto = await pool.query(
      'SELECT COUNT(*) FROM "Detalle_ventas" WHERE id_producto = $1',
      [id]
    );
    
    const comprasConProducto = await pool.query(
      'SELECT COUNT(*) FROM "Detalle_compras" WHERE id_producto = $1',
      [id]
    );
    
    if (parseInt(ventasConProducto.rows[0].count) > 0 || parseInt(comprasConProducto.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar el producto porque tiene ventas o compras asociadas'
      });
    }
    
    await pool.query('DELETE FROM "Productos" WHERE id_producto = $1', [id]);
    
    console.log(`🗑️ Producto ID ${id} eliminado por ${req.user.email}`);
    
    res.json({
      success: true,
      message: '✅ Producto eliminado exitosamente'
    });
    
  } catch (error) {
    console.error('Error eliminar producto:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// ==================== ENDPOINTS DE PROVEEDORES ====================

// 1. LISTAR PROVEEDORES
app.get('/api/proveedores', authenticateToken, async (req, res) => {
  try {
    console.log(`📡 ${req.user.email} solicitando proveedores`);
    
    const result = await pool.query(`
      SELECT * FROM "Proveedores" 
      WHERE estado = 1 
      ORDER BY nombre_razon_social
    `);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} proveedores encontrados`,
      data: result.rows || []
    });
    
  } catch (error) {
    console.error('Error listar proveedores:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 2. VER DETALLE DE PROVEEDOR
app.get('/api/proveedores/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM "Proveedores" WHERE id_proveedor = $1',
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
    console.error('Error ver detalle proveedor:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 3. CREAR PROVEEDOR
app.post('/api/proveedores', authenticateToken, checkRole([1, 2]), async (req, res) => {
  try {
    const { 
      nombre_razon_social, 
      tipo_documento, 
      documento, 
      contacto, 
      telefono, 
      email, 
      direccion 
    } = req.body;
    
    if (!nombre_razon_social) {
      return res.status(400).json({
        success: false,
        message: 'El nombre/razón social es requerido'
      });
    }
    
    // Verificar si el documento ya existe (si se proporciona)
    if (documento) {
      const docExiste = await pool.query(
        'SELECT id_proveedor FROM "Proveedores" WHERE documento = $1',
        [documento]
      );
      
      if (docExiste.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe un proveedor con ese documento'
        });
      }
    }
    
    const result = await pool.query(
      `INSERT INTO "Proveedores" (
        nombre_razon_social, tipo_documento, documento, contacto, 
        telefono, email, direccion, estado
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1) 
      RETURNING *`,
      [nombre_razon_social, tipo_documento, documento, contacto, 
       telefono, email, direccion]
    );
    
    console.log(`✅ Proveedor "${nombre_razon_social}" creado por ${req.user.email}`);
    
    res.status(201).json({
      success: true,
      message: '✅ Proveedor creado exitosamente',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error crear proveedor:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 4. ACTUALIZAR PROVEEDOR
app.put('/api/proveedores/:id', authenticateToken, checkRole([1, 2]), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      nombre_razon_social, 
      tipo_documento, 
      documento, 
      contacto, 
      telefono, 
      email, 
      direccion 
    } = req.body;
    
    const proveedorExiste = await pool.query(
      'SELECT id_proveedor FROM "Proveedores" WHERE id_proveedor = $1',
      [id]
    );
    
    if (proveedorExiste.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Proveedor no encontrado'
      });
    }
    
    // Verificar documento único (si se está actualizando)
    if (documento) {
      const docExiste = await pool.query(
        'SELECT id_proveedor FROM "Proveedores" WHERE documento = $1 AND id_proveedor != $2',
        [documento, id]
      );
      
      if (docExiste.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe otro proveedor con ese documento'
        });
      }
    }
    
    const result = await pool.query(
      `UPDATE "Proveedores" 
       SET nombre_razon_social = COALESCE($1, nombre_razon_social),
           tipo_documento = COALESCE($2, tipo_documento),
           documento = COALESCE($3, documento),
           contacto = COALESCE($4, contacto),
           telefono = COALESCE($5, telefono),
           email = COALESCE($6, email),
           direccion = COALESCE($7, direccion)
       WHERE id_proveedor = $8
       RETURNING *`,
      [nombre_razon_social, tipo_documento, documento, contacto, 
       telefono, email, direccion, id]
    );
    
    console.log(`✅ Proveedor ID ${id} actualizado por ${req.user.email}`);
    
    res.json({
      success: true,
      message: '✅ Proveedor actualizado exitosamente',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error actualizar proveedor:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 5. CAMBIAR ESTADO DE PROVEEDOR
app.put('/api/proveedores/:id/estado', authenticateToken, checkRole([1, 2]), async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    if (estado === undefined) {
      return res.status(400).json({
        success: false,
        message: 'El estado es requerido'
      });
    }
    
    const proveedorExiste = await pool.query(
      'SELECT id_proveedor FROM "Proveedores" WHERE id_proveedor = $1',
      [id]
    );
    
    if (proveedorExiste.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Proveedor no encontrado'
      });
    }
    
    // Verificar si hay compras asociadas
    if (estado === 0) {
      const comprasConProveedor = await pool.query(
        'SELECT COUNT(*) FROM "Compras" WHERE id_proveedor = $1',
        [id]
      );
      
      if (parseInt(comprasConProveedor.rows[0].count) > 0) {
        return res.status(400).json({
          success: false,
          message: 'No se puede desactivar el proveedor porque hay compras asociadas'
        });
      }
    }
    
    await pool.query(
      'UPDATE "Proveedores" SET estado = $1 WHERE id_proveedor = $2',
      [estado, id]
    );
    
    const estadoTexto = estado === 1 ? 'activado' : 'desactivado';
    console.log(`✅ Proveedor ID ${id} ${estadoTexto} por ${req.user.email}`);
    
    res.json({
      success: true,
      message: `✅ Proveedor ${estadoTexto} exitosamente`
    });
    
  } catch (error) {
    console.error('Error cambiar estado proveedor:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 6. ELIMINAR PROVEEDOR
app.delete('/api/proveedores/:id', authenticateToken, checkRole([1]), async (req, res) => {
  try {
    const { id } = req.params;
    
    const proveedorExiste = await pool.query(
      'SELECT id_proveedor FROM "Proveedores" WHERE id_proveedor = $1',
      [id]
    );
    
    if (proveedorExiste.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Proveedor no encontrado'
      });
    }
    
    // Verificar si hay compras asociadas
    const comprasConProveedor = await pool.query(
      'SELECT COUNT(*) FROM "Compras" WHERE id_proveedor = $1',
      [id]
    );
    
    if (parseInt(comprasConProveedor.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar el proveedor porque tiene compras asociadas'
      });
    }
    
    await pool.query('DELETE FROM "Proveedores" WHERE id_proveedor = $1', [id]);
    
    console.log(`🗑️ Proveedor ID ${id} eliminado por ${req.user.email}`);
    
    res.json({
      success: true,
      message: '✅ Proveedor eliminado exitosamente'
    });
    
  } catch (error) {
    console.error('Error eliminar proveedor:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// ==================== ENDPOINTS DE COMPRAS ====================

// 1. LISTAR COMPRAS
app.get('/api/compras', authenticateToken, checkRole([1, 2]), async (req, res) => {
  try {
    console.log(`📡 ${req.user.email} solicitando compras`);
    
    const result = await pool.query(`
      SELECT c.*, 
             p.nombre_razon_social as proveedor_nombre
      FROM "Compras" c
      LEFT JOIN "Proveedores" p ON c.id_proveedor = p.id_proveedor
      ORDER BY c.fecha DESC
    `);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} compras encontradas`,
      data: result.rows || []
    });
    
  } catch (error) {
    console.error('Error listar compras:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 2. VER DETALLE DE COMPRA
app.get('/api/compras/:id', authenticateToken, checkRole([1, 2]), async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM "Compras" WHERE id_compra = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Compra no encontrada'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error ver detalle compra:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 3. DETALLES DE COMPRA
app.get('/api/compras/:id/detalles', authenticateToken, checkRole([1, 2]), async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT dc.*, 
             p.nombre as nombre_producto
      FROM "Detalle_compras" dc
      LEFT JOIN "Productos" p ON dc.id_producto = p.id_producto
      WHERE dc.id_compra = $1
      ORDER BY dc.id_det_compra
    `, [id]);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} detalles encontrados`,
      data: result.rows || []
    });
    
  } catch (error) {
    console.error('Error detalles compra:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 4. CREAR COMPRA
app.post('/api/compras', authenticateToken, checkRole([1, 2]), async (req, res) => {
  try {
    const { 
      id_proveedor, 
      total, 
      fecha, 
      numero_factura, 
      detalles 
    } = req.body;
    
    if (!id_proveedor || !total || !detalles || !Array.isArray(detalles) || detalles.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Datos incompletos: Se requiere proveedor, total y al menos un producto'
      });
    }
    
    await pool.query('BEGIN');
    
    try {
      // Insertar compra
      const compraResult = await pool.query(
        `INSERT INTO "Compras" (
          id_proveedor, total, fecha, numero_factura, estado
        ) VALUES ($1, $2, $3, $4, 1) 
        RETURNING id_compra`,
        [id_proveedor, total, fecha || new Date(), numero_factura]
      );
      
      const idCompra = compraResult.rows[0].id_compra;
      
      // Insertar detalles
      for (const detalle of detalles) {
        await pool.query(
          `INSERT INTO "Detalle_compras" (
            id_compra, id_producto, cantidad, precio, subtotal
          ) VALUES ($1, $2, $3, $4, $5)`,
          [idCompra, detalle.id_producto, detalle.cantidad, detalle.precio, detalle.subtotal]
        );
        
        // Actualizar stock del producto
        await pool.query(
          `UPDATE "Productos" 
           SET stock = stock + $1,
               precio_compra = $2
           WHERE id_producto = $3`,
          [detalle.cantidad, detalle.precio, detalle.id_producto]
        );
      }
      
      await pool.query('COMMIT');
      
      console.log(`✅ Compra ${idCompra} creada exitosamente por ${req.user.email}`);
      
      res.status(201).json({
        success: true,
        message: '✅ Compra creada exitosamente',
        data: { id_compra: idCompra }
      });
      
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    console.error('Error crear compra:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error al crear compra: ' + error.message 
    });
  }
});

// 5. ANULAR COMPRA
app.put('/api/compras/:id/anular', authenticateToken, checkRole([1]), async (req, res) => {
  try {
    const { id } = req.params;
    
    const compraCheck = await pool.query(
      `SELECT estado FROM "Compras" WHERE id_compra = $1`,
      [id]
    );
    
    if (compraCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Compra no encontrada'
      });
    }
    
    if (compraCheck.rows[0].estado !== 1) {
      return res.status(400).json({
        success: false,
        message: 'La compra ya está anulada'
      });
    }
    
    await pool.query('BEGIN');
    
    try {
      // Obtener detalles
      const detalles = await pool.query(
        `SELECT id_producto, cantidad FROM "Detalle_compras" WHERE id_compra = $1`,
        [id]
      );
      
      // Restaurar stock
      for (const detalle of detalles.rows) {
        await pool.query(
          `UPDATE "Productos" 
           SET stock = GREATEST(stock - $1, 0)
           WHERE id_producto = $2`,
          [detalle.cantidad, detalle.id_producto]
        );
      }
      
      // Anular compra
      await pool.query(
        `UPDATE "Compras" SET estado = 0 WHERE id_compra = $1`,
        [id]
      );
      
      await pool.query('COMMIT');
      
      console.log(`✅ Compra ${id} anulada por ${req.user.email}`);
      
      res.json({
        success: true,
        message: '✅ Compra anulada exitosamente'
      });
      
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    console.error('Error anular compra:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error al anular compra: ' + error.message 
    });
  }
});

// ==================== ENDPOINTS DE CLIENTES ====================

// 1. LISTAR CLIENTES
app.get('/api/clientes', authenticateToken, async (req, res) => {
  try {
    console.log(`📡 ${req.user.email} solicitando clientes`);
    
    const result = await pool.query(`
      SELECT * FROM "Clientes" 
      WHERE estado = 1 
      ORDER BY nombre
    `);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} clientes encontrados`,
      data: result.rows || []
    });
    
  } catch (error) {
    console.error('Error listar clientes:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 2. VER DETALLE DE CLIENTE
app.get('/api/clientes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM "Clientes" WHERE id_cliente = $1',
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
    console.error('Error ver detalle cliente:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 3. BUSCAR CLIENTES POR NOMBRE O DOCUMENTO
app.get('/api/clientes/buscar/:termino', authenticateToken, async (req, res) => {
  try {
    const { termino } = req.params;
    
    const result = await pool.query(`
      SELECT * FROM "Clientes" 
      WHERE (nombre ILIKE $1 OR documento ILIKE $1 OR telefono ILIKE $1) 
        AND estado = 1
      ORDER BY nombre
      LIMIT 20
    `, [`%${termino}%`]);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} clientes encontrados`,
      data: result.rows || []
    });
    
  } catch (error) {
    console.error('Error buscar clientes:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 4. CREAR CLIENTE
app.post('/api/clientes', authenticateToken, checkRole([1, 2]), async (req, res) => {
  try {
    const { 
      nombre, 
      tipo_documento, 
      documento, 
      telefono, 
      direccion 
    } = req.body;
    
    if (!nombre) {
      return res.status(400).json({
        success: false,
        message: 'El nombre del cliente es requerido'
      });
    }
    
    // Verificar si el documento ya existe (si se proporciona)
    if (documento) {
      const docExiste = await pool.query(
        'SELECT id_cliente FROM "Clientes" WHERE documento = $1',
        [documento]
      );
      
      if (docExiste.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe un cliente con ese documento'
        });
      }
    }
    
    const result = await pool.query(
      `INSERT INTO "Clientes" (nombre, tipo_documento, documento, telefono, direccion, estado) 
       VALUES ($1, $2, $3, $4, $5, 1) 
       RETURNING *`,
      [nombre, tipo_documento, documento, telefono, direccion]
    );
    
    console.log(`✅ Cliente "${nombre}" creado por ${req.user.email}`);
    
    res.status(201).json({
      success: true,
      message: '✅ Cliente creado exitosamente',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error crear cliente:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 5. ACTUALIZAR CLIENTE
app.put('/api/clientes/:id', authenticateToken, checkRole([1, 2]), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      nombre, 
      tipo_documento, 
      documento, 
      telefono, 
      direccion 
    } = req.body;
    
    const clienteExiste = await pool.query(
      'SELECT id_cliente FROM "Clientes" WHERE id_cliente = $1',
      [id]
    );
    
    if (clienteExiste.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cliente no encontrado'
      });
    }
    
    // Verificar documento único
    if (documento) {
      const docExiste = await pool.query(
        'SELECT id_cliente FROM "Clientes" WHERE documento = $1 AND id_cliente != $2',
        [documento, id]
      );
      
      if (docExiste.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe otro cliente con ese documento'
        });
      }
    }
    
    const result = await pool.query(
      `UPDATE "Clientes" 
       SET nombre = COALESCE($1, nombre),
           tipo_documento = COALESCE($2, tipo_documento),
           documento = COALESCE($3, documento),
           telefono = COALESCE($4, telefono),
           direccion = COALESCE($5, direccion)
       WHERE id_cliente = $6
       RETURNING *`,
      [nombre, tipo_documento, documento, telefono, direccion, id]
    );
    
    console.log(`✅ Cliente ID ${id} actualizado por ${req.user.email}`);
    
    res.json({
      success: true,
      message: '✅ Cliente actualizado exitosamente',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error actualizar cliente:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 6. CAMBIAR ESTADO DE CLIENTE
app.put('/api/clientes/:id/estado', authenticateToken, checkRole([1, 2]), async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    if (estado === undefined) {
      return res.status(400).json({
        success: false,
        message: 'El estado es requerido'
      });
    }
    
    const clienteExiste = await pool.query(
      'SELECT id_cliente FROM "Clientes" WHERE id_cliente = $1',
      [id]
    );
    
    if (clienteExiste.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cliente no encontrado'
      });
    }
    
    // Verificar si hay ventas asociadas
    if (estado === 0) {
      const ventasConCliente = await pool.query(
        'SELECT COUNT(*) FROM "Ventas" WHERE id_cliente = $1',
        [id]
      );
      
      if (parseInt(ventasConCliente.rows[0].count) > 0) {
        return res.status(400).json({
          success: false,
          message: 'No se puede desactivar el cliente porque hay ventas asociadas'
        });
      }
    }
    
    await pool.query(
      'UPDATE "Clientes" SET estado = $1 WHERE id_cliente = $2',
      [estado, id]
    );
    
    const estadoTexto = estado === 1 ? 'activado' : 'desactivado';
    console.log(`✅ Cliente ID ${id} ${estadoTexto} por ${req.user.email}`);
    
    res.json({
      success: true,
      message: `✅ Cliente ${estadoTexto} exitosamente`
    });
    
  } catch (error) {
    console.error('Error cambiar estado cliente:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 7. ELIMINAR CLIENTE
app.delete('/api/clientes/:id', authenticateToken, checkRole([1]), async (req, res) => {
  try {
    const { id } = req.params;
    
    const clienteExiste = await pool.query(
      'SELECT id_cliente FROM "Clientes" WHERE id_cliente = $1',
      [id]
    );
    
    if (clienteExiste.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cliente no encontrado'
      });
    }
    
    // Verificar si hay ventas asociadas
    const ventasConCliente = await pool.query(
      'SELECT COUNT(*) FROM "Ventas" WHERE id_cliente = $1',
      [id]
    );
    
    if (parseInt(ventasConCliente.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar el cliente porque tiene ventas asociadas'
      });
    }
    
    await pool.query('DELETE FROM "Clientes" WHERE id_cliente = $1', [id]);
    
    console.log(`🗑️ Cliente ID ${id} eliminado por ${req.user.email}`);
    
    res.json({
      success: true,
      message: '✅ Cliente eliminado exitosamente'
    });
    
  } catch (error) {
    console.error('Error eliminar cliente:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// ==================== ENDPOINTS DE VENTAS ====================

// 1. LISTAR VENTAS
app.get('/api/ventas', authenticateToken, async (req, res) => {
  try {
    console.log(`📡 ${req.user.email} solicitando ventas`);
    
    const result = await pool.query(`
      SELECT v.*, 
             c.nombre as cliente_nombre
      FROM "Ventas" v
      LEFT JOIN "Clientes" c ON v.id_cliente = c.id_cliente
      ORDER BY v.fecha DESC
    `);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} ventas encontradas`,
      data: result.rows || []
    });
    
  } catch (error) {
    console.error('Error ventas:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 2. VER DETALLE DE VENTA
app.get('/api/ventas/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM "Ventas" WHERE id_venta = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Venta no encontrada'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error ver detalle venta:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 3. DETALLES DE VENTA
app.get('/api/ventas/:id/detalles', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT dv.*, 
             p.nombre as nombre_producto
      FROM "Detalle_ventas" dv
      LEFT JOIN "Productos" p ON dv.id_producto = p.id_producto
      WHERE dv.id_venta = $1
      ORDER BY dv.id_det_venta
    `, [id]);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} detalles encontrados`,
      data: result.rows || []
    });
    
  } catch (error) {
    console.error('Error detalles venta:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// 4. CREAR VENTA (mantener tu código existente pero adaptado)
app.post('/api/ventas', authenticateToken, async (req, res) => {
  try {
    console.log(`📡 ${req.user.email} creando nueva venta`);
    
    const { id_cliente, total, fecha, estado = 2, detalles } = req.body;
    
    if (!id_cliente || !total || !detalles || !Array.isArray(detalles) || detalles.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Datos incompletos: Se requiere cliente, total y al menos un producto'
      });
    }
    
    await pool.query('BEGIN');
    
    try {
      // Insertar venta
      const ventaResult = await pool.query(
        `INSERT INTO "Ventas" (id_cliente, total, fecha, estado) 
         VALUES ($1, $2, $3, $4) 
         RETURNING id_venta`,
        [id_cliente, total, fecha || new Date(), estado]
      );
      
      const idVenta = ventaResult.rows[0].id_venta;
      
      // Insertar detalles
      for (const detalle of detalles) {
        await pool.query(
          `INSERT INTO "Detalle_ventas" (id_venta, id_producto, cantidad, precio, subtotal) 
           VALUES ($1, $2, $3, $4, $5)`,
          [idVenta, detalle.id_producto, detalle.cantidad, detalle.precio, detalle.subtotal]
        );
        
        // Actualizar stock (solo si no está anulada)
        if (estado !== 3) {
          await pool.query(
            `UPDATE "Productos" 
             SET stock = GREATEST(stock - $1, 0)
             WHERE id_producto = $2 AND stock >= $1`,
            [detalle.cantidad, detalle.id_producto]
          );
        }
      }
      
      await pool.query('COMMIT');
      
      console.log(`✅ Venta ${idVenta} creada exitosamente`);
      
      res.status(201).json({
        success: true,
        message: '✅ Venta creada exitosamente',
        data: { id_venta: idVenta }
      });
      
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    console.error('Error crear venta:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al crear venta: ' + error.message
    });
  }
});

// 5. ACTUALIZAR VENTA
app.put('/api/ventas/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { id_cliente, total, fecha, detalles } = req.body;
    
    if (!id_cliente || !total || !detalles || !Array.isArray(detalles) || detalles.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Datos incompletos'
      });
    }
    
    const ventaCheck = await pool.query(
      `SELECT estado FROM "Ventas" WHERE id_venta = $1`,
      [id]
    );
    
    if (ventaCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Venta no encontrada'
      });
    }
    
    const estadoActual = ventaCheck.rows[0].estado;
    
    if (estadoActual !== 2) {
      return res.status(400).json({
        success: false,
        message: `No se puede editar una venta ${estadoActual === 1 ? 'completada' : 'anulada'}`
      });
    }
    
    await pool.query('BEGIN');
    
    try {
      // Obtener y restaurar stock
      const detallesActuales = await pool.query(
        `SELECT id_producto, cantidad FROM "Detalle_ventas" WHERE id_venta = $1`,
        [id]
      );
      
      for (const detalle of detallesActuales.rows) {
        await pool.query(
          `UPDATE "Productos" 
           SET stock = stock + $1 
           WHERE id_producto = $2`,
          [detalle.cantidad, detalle.id_producto]
        );
      }
      
      // Eliminar detalles antiguos
      await pool.query(
        `DELETE FROM "Detalle_ventas" WHERE id_venta = $1`,
        [id]
      );
      
      // Actualizar venta
      await pool.query(
        `UPDATE "Ventas" 
         SET id_cliente = $1, total = $2, fecha = $3 
         WHERE id_venta = $4`,
        [id_cliente, total, fecha || new Date(), id]
      );
      
      // Insertar nuevos detalles
      for (const detalle of detalles) {
        await pool.query(
          `INSERT INTO "Detalle_ventas" (id_venta, id_producto, cantidad, precio, subtotal) 
           VALUES ($1, $2, $3, $4, $5)`,
          [id, detalle.id_producto, detalle.cantidad, detalle.precio, detalle.subtotal]
        );
        
        // Actualizar stock
        await pool.query(
          `UPDATE "Productos" 
           SET stock = GREATEST(stock - $1, 0)
           WHERE id_producto = $2`,
          [detalle.cantidad, detalle.id_producto]
        );
      }
      
      await pool.query('COMMIT');
      
      console.log(`✅ Venta ${id} actualizada exitosamente`);
      
      res.json({
        success: true,
        message: '✅ Venta actualizada exitosamente'
      });
      
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    console.error('Error actualizar venta:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar venta: ' + error.message
    });
  }
});

// 6. CAMBIAR ESTADO DE VENTA (incluye anular)
app.put('/api/ventas/:id/estado', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    if (!estado || ![1, 2, 3].includes(parseInt(estado))) {
      return res.status(400).json({
        success: false,
        message: 'Estado inválido. Use: 1=Completado, 2=Pendiente, 3=Anulado'
      });
    }
    
    const ventaCheck = await pool.query(
      `SELECT estado FROM "Ventas" WHERE id_venta = $1`,
      [id]
    );
    
    if (ventaCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Venta no encontrada'
      });
    }
    
    const estadoActual = ventaCheck.rows[0].estado;
    const nuevoEstado = parseInt(estado);
    
    if (estadoActual === 1 && nuevoEstado !== 1) {
      return res.status(400).json({
        success: false,
        message: 'No se puede cambiar el estado de una venta completada'
      });
    }
    
    await pool.query('BEGIN');
    
    try {
      // Anular venta (estado 3) - Restaurar stock
      if (nuevoEstado === 3 && estadoActual !== 3) {
        const detalles = await pool.query(
          `SELECT id_producto, cantidad FROM "Detalle_ventas" WHERE id_venta = $1`,
          [id]
        );
        
        for (const detalle of detalles.rows) {
          await pool.query(
            `UPDATE "Productos" 
             SET stock = stock + $1 
             WHERE id_producto = $2`,
            [detalle.cantidad, detalle.id_producto]
          );
        }
      }
      
      // Reactivar venta anulada
      if (estadoActual === 3 && nuevoEstado !== 3) {
        const detalles = await pool.query(
          `SELECT id_producto, cantidad FROM "Detalle_ventas" WHERE id_venta = $1`,
          [id]
        );
        
        for (const detalle of detalles.rows) {
          await pool.query(
            `UPDATE "Productos" 
             SET stock = GREATEST(stock - $1, 0)
             WHERE id_producto = $2`,
            [detalle.cantidad, detalle.id_producto]
          );
        }
      }
      
      // Actualizar estado
      await pool.query(
        `UPDATE "Ventas" SET estado = $1 WHERE id_venta = $2`,
        [nuevoEstado, id]
      );
      
      await pool.query('COMMIT');
      
      const estadoTexto = nuevoEstado === 1 ? 'completada' : (nuevoEstado === 2 ? 'pendiente' : 'anulada');
      console.log(`✅ Estado de venta ${id} cambiado a ${estadoTexto}`);
      
      res.json({
        success: true,
        message: `✅ Venta ${estadoTexto} exitosamente`
      });
      
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    console.error('Error cambiar estado venta:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al cambiar estado: ' + error.message
    });
  }
});

// ==================== LOGIN (mantener tu código) ====================
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('🔐 Login attempt:', email);
    
    if (!email || !password) {
      return res.json({ 
        success: false, 
        message: 'Email y contraseña requeridos' 
      });
    }
    
    const result = await pool.query(
      'SELECT * FROM "Usuarios" WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.json({ 
        success: false, 
        message: 'Usuario no encontrado' 
      });
    }
    
    const user = result.rows[0];
    const dbPassword = user.contraseña || '';
    
    let validPassword = false;
    
    if (dbPassword === password) {
      validPassword = true;
    } else if (dbPassword && dbPassword.startsWith('$2')) {
      try {
        validPassword = await bcrypt.compare(password, dbPassword);
      } catch (bcryptError) {
        validPassword = (dbPassword === password);
      }
    } else if (password === 'admin123') {
      validPassword = true;
    }
    
    if (!validPassword) {
      return res.json({ 
        success: false, 
        message: 'Contraseña incorrecta' 
      });
    }
    
    // Generar token
    const token = Buffer.from(`${user.id_usuario}:${Date.now()}`).toString('base64');
    
    const userResponse = {
      id_usuario: user.id_usuario,
      email: user.email,
      nombre_completo: user.nombre_completo || 'Administrador',
      usuario: user.usuario || 'admin',
      estado: user.estado || 1,
      id_rol: user.id_rol || 1
    };
    
    console.log('🎉 Login exitoso para:', email);
    
    res.json({
      success: true,
      message: '✅ Login exitoso',
      token: token,
      user: userResponse,
      expires_in: '30 días'
    });
    
  } catch (error) {
    console.error('💥 ERROR CRÍTICO en login:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error del servidor' 
    });
  }
});

// ==================== INICIAR SERVIDOR ====================
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(80));
  console.log('🚀 API STOCKBAR - VERSIÓN COMPLETA 5.0');
  console.log('='.repeat(80));
  console.log('📋 TODAS LAS TABLAS CON CRUD COMPLETO:');
  console.log('   1. ✅ Roles - CRUD con Admin protegido (no editable/eliminable)');
  console.log('   2. ✅ Usuarios - CRUD completo con ver detalle y eliminar');
  console.log('   3. ✅ Categorías - CRUD completo con ver detalle y eliminar');
  console.log('   4. ✅ Productos - CRUD completo con ver detalle y eliminar');
  console.log('   5. ✅ Proveedores - CRUD completo con ver detalle y eliminar');
  console.log('   6. ✅ Compras - CRUD con anulación (en vez de eliminar)');
  console.log('   7. ✅ Clientes - CRUD completo con ver detalle y eliminar');
  console.log('   8. ✅ Ventas - CRUD con anulación (en vez de eliminar)');
  console.log('='.repeat(80));
  console.log('🔐 CARACTERÍSTICAS ESPECIALES:');
  console.log('   ✅ Rol Admin (id:1) protegido - no editable ni eliminable');
  console.log('   ✅ Todos los CRUD tienen ver detalle y eliminar');
  console.log('   ✅ Compras y Ventas usan anulación en vez de eliminación');
  console.log('   ✅ Validaciones de integridad referencial');
  console.log('='.repeat(80));
  console.log(`📡 Puerto: ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log('='.repeat(80));
  console.log('✅ Servidor listo con todas las funcionalidades!');
  console.log('='.repeat(80));
});
