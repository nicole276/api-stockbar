const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const app = express();

// ✅ CONFIGURACIÓN PARA RENDER - POSTGRESQL EN LA NUBE
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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

    // Decodificar token simple (en producción usar JWT)
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

// 1. Endpoint para verificar email
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
    
    // Generar token simple (en producción usar JWT)
    const tokenData = `${user.id_usuario}:${Date.now()}`;
    const token = Buffer.from(tokenData).toString('base64');
    
    // Remover contraseña del objeto de respuesta
    const { contraseña, ...userWithoutPassword } = user;
    
    // Obtener permisos del rol
    const permisosResult = await pool.query(
      `SELECT p.* 
       FROM ver_detalle_rol vdr
       JOIN permisos p ON vdr.id_permiso = p.id_permiso
       WHERE vdr.id_rol = $1`,
      [user.id_rol]
    );
    
    res.json({ 
      success: true, 
      token: token,
      user: userWithoutPassword,
      permisos: permisosResult.rows,
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
app.get('/api/roles', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id_rol, nombre_rol, descripcion, 
             CASE WHEN estado = 1 THEN 'Activo' ELSE 'Inactivo' END as estado
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

app.post('/api/roles', authenticateToken, async (req, res) => {
  try {
    const { nombre_rol, descripcion, estado } = req.body;
    
    if (!nombre_rol) {
      return res.status(400).json({ 
        success: false, 
        error: 'Nombre del rol es requerido' 
      });
    }
    
    const result = await pool.query(
      `INSERT INTO roles (nombre_rol, descripcion, estado) 
       VALUES ($1, $2, $3) RETURNING *`,
      [nombre_rol, descripcion, estado || 1]
    );
    
    res.status(201).json({ 
      success: true, 
      message: 'Rol creado exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/roles/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre_rol, descripcion, estado } = req.body;
    
    const result = await pool.query(
      `UPDATE roles SET nombre_rol=$1, descripcion=$2, estado=$3 
       WHERE id_rol=$4 RETURNING *`,
      [nombre_rol, descripcion, estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Rol no encontrado' });
    }
    
    res.json({ 
      success: true, 
      message: 'Rol actualizado exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

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
    
    const result = await pool.query(
      'DELETE FROM roles WHERE id_rol = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Rol no encontrado' });
    }
    
    res.json({ 
      success: true, 
      message: 'Rol eliminado exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ENDPOINTS CRUD - USUARIOS ====================
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
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_usuario, nombre_completo, email, usuario, estado`,
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

app.put('/api/usuarios/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { id_rol, nombre_completo, email, usuario, estado } = req.body;
    
    // Verificar si es el admin por defecto (NO SE PUEDE MODIFICAR EL ROL)
    const usuarioActual = await pool.query(
      'SELECT email FROM usuarios WHERE id_usuario = $1',
      [id]
    );
    
    if (usuarioActual.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }
    
    const esAdmin = usuarioActual.rows[0].email === ADMIN_EMAIL;
    
    const result = await pool.query(
      `UPDATE usuarios SET id_rol=$1, nombre_completo=$2, email=$3, usuario=$4, estado=$5 
       WHERE id_usuario=$6 RETURNING id_usuario, nombre_completo, email, usuario, estado, id_rol`,
      [id_rol, nombre_completo, email, usuario, estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }
    
    let mensaje = 'Usuario actualizado exitosamente';
    if (esAdmin) {
      mensaje += ' (Admin por defecto - algunos datos protegidos)';
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
app.get('/api/categorias', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id_categoria, nombre, descripcion, 
             CASE WHEN estado = 1 THEN 'Activo' ELSE 'Inactivo' END as estado
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

app.post('/api/categorias', authenticateToken, async (req, res) => {
  try {
    const { nombre, descripcion, estado } = req.body;
    
    if (!nombre) {
      return res.status(400).json({ 
        success: false, 
        error: 'Nombre de categoría es requerido' 
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

app.put('/api/categorias/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, estado } = req.body;
    
    const result = await pool.query(
      `UPDATE categorias SET nombre=$1, descripcion=$2, estado=$3 
       WHERE id_categoria=$4 RETURNING *`,
      [nombre, descripcion, estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Categoría no encontrada' });
    }
    
    res.json({ 
      success: true, 
      message: 'Categoría actualizada exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ENDPOINTS CRUD - COMPRAS ====================
app.get('/api/compras', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, p.nombre_razon_social as proveedor_nombre,
             CASE WHEN c.estado = 1 THEN 'Activa' ELSE 'Inactiva' END as estado_texto
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
      SELECT dc.*, pr.nombre as producto_nombre
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
      const precio = producto.precio || 0;
      const subtotal = cantidad * precio;
      
      await client.query(
        `INSERT INTO detalle_compras (id_compra, id_producto, cantidad, precio, subtotal) 
         VALUES ($1, $2, $3, $4, $5)`,
        [compraId, producto.id_producto, cantidad, precio, subtotal]
      );
      
      // 3. Actualizar stock de productos (SUMAR stock)
      await client.query(
        'UPDATE productos SET stock = stock + $1 WHERE id_producto = $2',
        [cantidad, producto.id_producto]
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

// ==================== ENDPOINT PARA CREAR TODAS LAS TABLAS ====================
app.get('/api/create-all-tables', async (req, res) => {
  try {
    console.log('🔄 Creando tablas...');

    // TABLA ROLES
    await pool.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id_rol SERIAL PRIMARY KEY,
        nombre_rol VARCHAR(50),
        descripcion VARCHAR(50),
        estado SMALLINT DEFAULT 1
      );
    `);

    // TABLA PERMISOS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS permisos (
        id_permiso SERIAL PRIMARY KEY,
        nombre_permiso VARCHAR(50),
        descripcion VARCHAR(100),
        modulo VARCHAR(50),
        estado SMALLINT DEFAULT 1
      );
    `);

    // TABLA VER_DETALLE_ROL
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ver_detalle_rol (
        id_detalle SERIAL PRIMARY KEY,
        id_rol INTEGER REFERENCES roles(id_rol),
        id_permiso INTEGER REFERENCES permisos(id_permiso)
      );
    `);

    // TABLA USUARIOS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id_usuario SERIAL PRIMARY KEY,
        id_rol INTEGER REFERENCES roles(id_rol),
        nombre_completo VARCHAR(50),
        email VARCHAR(50) UNIQUE,
        usuario VARCHAR(50),
        contraseña VARCHAR(255),
        estado SMALLINT DEFAULT 1
      );
    `);

    // TABLA CATEGORIAS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categorias (
        id_categoria SERIAL PRIMARY KEY,
        nombre VARCHAR(50),
        descripcion VARCHAR(50),
        estado SMALLINT DEFAULT 1
      );
    `);

    // TABLA PRODUCTOS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS productos (
        id_producto SERIAL PRIMARY KEY,
        id_categoria INTEGER REFERENCES categorias(id_categoria),
        nombre VARCHAR(50),
        stock INTEGER DEFAULT 0,
        precio_compra DECIMAL(10,2),
        precio_venta DECIMAL(10,2),
        estado SMALLINT DEFAULT 1
      );
    `);

    // TABLA PROVEEDORES
    await pool.query(`
      CREATE TABLE IF NOT EXISTS proveedores (
        id_proveedor SERIAL PRIMARY KEY,
        nombre_razon_social VARCHAR(50),
        tipo_documento VARCHAR(20),
        documento VARCHAR(20),
        contacto VARCHAR(50),
        telefono VARCHAR(15),
        email VARCHAR(50),
        direccion VARCHAR(50),
        estado SMALLINT DEFAULT 1
      );
    `);

    // TABLA COMPRAS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS compras (
        id_compra SERIAL PRIMARY KEY,
        id_proveedor INTEGER REFERENCES proveedores(id_proveedor),
        fecha TIMESTAMP DEFAULT NOW(),
        total DECIMAL(10,2),
        numero_factura VARCHAR(50),
        estado SMALLINT DEFAULT 1
      );
    `);

    // TABLA DETALLE_COMPRAS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS detalle_compras (
        id_det_compra SERIAL PRIMARY KEY,
        id_compra INTEGER REFERENCES compras(id_compra),
        id_producto INTEGER REFERENCES productos(id_producto),
        cantidad INTEGER,
        precio DECIMAL(10,2),
        subtotal DECIMAL(10,2)
      );
    `);

    // TABLA CLIENTES
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clientes (
        id_cliente SERIAL PRIMARY KEY,
        nombre VARCHAR(50),
        tipo_documento VARCHAR(20),
        documento VARCHAR(20),
        telefono VARCHAR(15),
        direccion VARCHAR(50),
        estado SMALLINT DEFAULT 1
      );
    `);

    // TABLA VENTAS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ventas (
        id_venta SERIAL PRIMARY KEY,
        id_cliente INTEGER REFERENCES clientes(id_cliente),
        fecha TIMESTAMP DEFAULT NOW(),
        total DECIMAL(10,2),
        estado SMALLINT DEFAULT 0
      );
    `);

    // TABLA DETALLE_VENTAS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS detalle_ventas (
        id_det_venta SERIAL PRIMARY KEY,
        id_venta INTEGER REFERENCES ventas(id_venta),
        id_producto INTEGER REFERENCES productos(id_producto),
        cantidad INTEGER,
        precio DECIMAL(10,2),
        subtotal DECIMAL(10,2)
      );
    `);

    console.log('✅ Tablas creadas, insertando datos...');

    // INSERTAR DATOS DE ROLES
    await pool.query(`
      INSERT INTO roles (nombre_rol, descripcion, estado) VALUES
      ('Administrador', 'Acceso total al sistema', 1),
      ('Cajero', 'Puede realizar ventas', 1),
      ('Bodeguero', 'Gestiona inventario', 1)
      ON CONFLICT DO NOTHING;
    `);

    // INSERTAR PERMISOS
    await pool.query(`
      INSERT INTO permisos (nombre_permiso, descripcion, modulo, estado) VALUES
      ('ver_dashboard', 'Ver panel principal', 'dashboard', 1),
      ('gestionar_usuarios', 'Gestionar usuarios del sistema', 'usuarios', 1),
      ('gestionar_roles', 'Gestionar roles y permisos', 'roles', 1),
      ('gestionar_productos', 'Gestionar productos', 'productos', 1),
      ('gestionar_categorias', 'Gestionar categorías', 'categorias', 1),
      ('gestionar_proveedores', 'Gestionar proveedores', 'proveedores', 1),
      ('gestionar_compras', 'Gestionar compras', 'compras', 1),
      ('gestionar_clientes', 'Gestionar clientes', 'clientes', 1),
      ('realizar_ventas', 'Realizar ventas', 'ventas', 1),
      ('ver_reportes', 'Ver reportes y estadísticas', 'reportes', 1)
      ON CONFLICT DO NOTHING;
    `);

    // Asignar permisos a roles
    // Administrador: todos los permisos
    const permisosAdmin = await pool.query('SELECT id_permiso FROM permisos');
    for (const permiso of permisosAdmin.rows) {
      await pool.query(
        'INSERT INTO ver_detalle_rol (id_rol, id_permiso) VALUES (1, $1) ON CONFLICT DO NOTHING',
        [permiso.id_permiso]
      );
    }

    // Cajero: ver dashboard, productos, clientes, realizar ventas
    await pool.query(`
      INSERT INTO ver_detalle_rol (id_rol, id_permiso) VALUES
      (2, 1), (2, 4), (2, 8), (2, 9)
      ON CONFLICT DO NOTHING;
    `);

    // Bodeguero: ver dashboard, productos, categorías, proveedores, compras
    await pool.query(`
      INSERT INTO ver_detalle_rol (id_rol, id_permiso) VALUES
      (3, 1), (3, 4), (3, 5), (3, 6), (3, 7)
      ON CONFLICT DO NOTHING;
    `);

    // Hashear contraseñas antes de insertarlas
    const adminHash = await bcrypt.hash('admin123', 10);
    const cajaHash = await bcrypt.hash('caja123', 10);
    const bodegaHash = await bcrypt.hash('bodega123', 10);

    // INSERTAR USUARIOS POR DEFECTO
    await pool.query(`
      INSERT INTO usuarios (id_rol, nombre_completo, email, usuario, contraseña, estado) VALUES
      (1, 'Administrador Principal', '${ADMIN_EMAIL}', 'admin', $1, 1),
      (2, 'Maria Cajera', 'caja@elbar.com', 'mariacaja', $2, 1),
      (3, 'Pedro Bodega', 'bodega@elbar.com', 'pedrobodega', $3, 1)
      ON CONFLICT DO NOTHING;
    `, [adminHash, cajaHash, bodegaHash]);

    // INSERTAR CATEGORÍAS
    await pool.query(`
      INSERT INTO categorias (nombre, descripcion, estado) VALUES
      ('Licores', 'Bebidas alcoholicas fuertes', 1),
      ('Cervezas', 'Cervezas nacionales e importadas', 1),
      ('Cigarrillos', 'Marcas de cigarrillos', 1),
      ('Dulcería', 'Snacks y botanas', 1)
      ON CONFLICT DO NOTHING;
    `);

    // INSERTAR PRODUCTOS
    await pool.query(`
      INSERT INTO productos (id_categoria, nombre, stock, precio_compra, precio_venta, estado) VALUES
      (1, 'Aguardiente Antioqueño 750ml', 50, 35000, 52000, 1),
      (1, 'Ron Medellín Añejo 750ml', 30, 45000, 65000, 1),
      (1, 'Ron Viejo de Caldas 750ml', 25, 38000, 55000, 1),
      (2, 'Cerveza Águila Lata 330ml', 200, 2500, 4500, 1),
      (2, 'Cerveza Poker Lata 330ml', 150, 2500, 4500, 1),
      (2, 'Cerveza Corona Botella 355ml', 80, 5000, 8000, 1),
      (3, 'Cigarrillo Marlboro Rojo', 100, 4500, 7000, 1),
      (3, 'Cigarrillo Marlboro Gold', 90, 4500, 7000, 1),
      (3, 'Cigarrillo Lucky Strike', 80, 4200, 6500, 1),
      (4, 'Papas Margarita Natural', 60, 3200, 5500, 1),
      (4, 'Papas Margarita Pollo', 45, 3200, 5500, 1),
      (4, 'Platanitos Verdes', 55, 2800, 4800, 1)
      ON CONFLICT DO NOTHING;
    `);

    // INSERTAR PROVEEDORES
    await pool.query(`
      INSERT INTO proveedores (nombre_razon_social, tipo_documento, documento, contacto, telefono, email, direccion, estado) VALUES
      ('Bavaria S.A.', 'NIT', '860000123', 'Juan Distribuidor', '6012345678', 'ventas@bavaria.com.co', 'Autopista Norte #125-80, Bogotá', 1),
      ('Distribuidora La Rebaja', 'NIT', '860000789', 'Carlos Suministros', '6034567890', 'compras@larebaja.com.co', 'Avenida 68 #15-40, Cali', 1),
      ('Licores de Colombia S.A.', 'NIT', '860000456', 'Maria Proveedora', '6023456789', 'pedidos@licorescolombia.com.co', 'Calle 100 #25-50, Medellín', 1)
      ON CONFLICT DO NOTHING;
    `);

    // INSERTAR CLIENTES
    await pool.query(`
      INSERT INTO clientes (nombre, tipo_documento, documento, telefono, direccion, estado) VALUES
      ('Ana Maria López', 'CC', '1023456789', '3001234567', 'Carrera 80 #25-35, Medellín', 1),
      ('Carlos Andrés Rodríguez', 'CC', '5234567890', '3102345678', 'Calle 50 #45-20, Bogotá', 1),
      ('Laura Valentina García', 'CC', '2345678901', '3203456789', 'Avenida 68 #15-40, Cali', 1)
      ON CONFLICT DO NOTHING;
    `);

    console.log('✅ Todas las tablas y datos creados exitosamente!');

    res.json({ 
      success: true, 
      message: 'Base de datos creada exitosamente',
      admin_por_defecto: {
        email: ADMIN_EMAIL,
        password: 'admin123',
        nota: 'Este usuario no se puede eliminar'
      },
      usuarios_creados: [
        { email: ADMIN_EMAIL, password: 'admin123', rol: 'Administrador' },
        { email: 'caja@elbar.com', password: 'caja123', rol: 'Cajero' },
        { email: 'bodega@elbar.com', password: 'bodega123', rol: 'Bodeguero' }
      ]
    });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// (Mantén todos los endpoints existentes de productos, clientes, ventas...)
// Solo añade el código anterior, el resto de tus endpoints existentes se mantienen igual

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

// ==================== ENDPOINT DE ESTADO ACTUALIZADO ====================
app.get('/api/status', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as server_time');
    
    // Obtener conteos
    const productosCount = await pool.query('SELECT COUNT(*) FROM productos');
    const clientesCount = await pool.query('SELECT COUNT(*) FROM clientes');
    const ventasCount = await pool.query('SELECT COUNT(*) FROM ventas');
    const ventasActivas = await pool.query("SELECT COUNT(*) FROM ventas WHERE estado != 2");
    const usuariosCount = await pool.query('SELECT COUNT(*) FROM usuarios');
    const rolesCount = await pool.query('SELECT COUNT(*) FROM roles');
    const categoriasCount = await pool.query('SELECT COUNT(*) FROM categorias');
    const comprasCount = await pool.query('SELECT COUNT(*) FROM compras');
    
    res.json({
      success: true,
      message: '🚀 API StockBar funcionando correctamente',
      server_time: result.rows[0].server_time,
      version: '4.0.0',
      admin_por_defecto: ADMIN_EMAIL,
      estadisticas: {
        productos: parseInt(productosCount.rows[0].count),
        clientes: parseInt(clientesCount.rows[0].count),
        ventas_totales: parseInt(ventasCount.rows[0].count),
        ventas_activas: parseInt(ventasActivas.rows[0].count),
        usuarios: parseInt(usuariosCount.rows[0].count),
        roles: parseInt(rolesCount.rows[0].count),
        categorias: parseInt(categoriasCount.rows[0].count),
        compras: parseInt(comprasCount.rows[0].count)
      },
      endpoints_autenticacion: {
        verificar_email: 'POST /api/verificar-email',
        actualizar_password: 'POST /api/actualizar-password',
        login: 'POST /api/login',
        perfil: 'GET /api/perfil (requiere token)'
      },
      endpoints_principales: {
        roles: 'GET /api/roles',
        usuarios: 'GET /api/usuarios',
        categorias: 'GET /api/categorias',
        compras: 'GET /api/compras',
        productos: 'GET /api/productos',
        clientes: 'GET /api/clientes',
        ventas: 'GET /api/ventas',
        ventas_completas: 'GET /api/ventas-completas',
        crear_venta: 'POST /api/ventas-completas',
        anular_venta: 'PATCH /api/ventas/:id/anular',
        actualizar_stock: 'PATCH /api/productos/:id/stock'
      },
      nota: `El usuario ${ADMIN_EMAIL} es el administrador por defecto y no se puede eliminar`
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Ruta principal
app.get('/', (req, res) => {
  res.json({
    message: '🚀 API StockBar - Sistema de Gestión para Licorería',
    version: '4.0.0',
    admin_por_defecto: ADMIN_EMAIL,
    features: [
      '✅ Sistema de autenticación completo con recuperación de contraseña',
      '✅ Gestión de roles y permisos por usuario',
      '✅ Admin por defecto protegido (no se puede eliminar)',
      '✅ Gestión completa de ventas con control de stock automático',
      '✅ CRUD completo para usuarios, roles, categorías, compras',
      '✅ Contraseñas almacenadas de forma segura con bcrypt'
    ],
    moneda: 'Todos los precios están en Pesos Colombianos (COP)',
    documentacion: 'Visita /api/status para ver todos los endpoints disponibles',
    crear_base_datos: 'GET /api/create-all-tables'
  });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 Servidor API StockBar - VERSION 4.0');
  console.log('📡 Puerto: ' + PORT);
  console.log('🌐 URL: https://api-stockbar.onrender.com');
  console.log('🔐 Sistema de autenticación completo');
  console.log('👑 Admin por defecto: ' + ADMIN_EMAIL);
  console.log('💰 Todos los precios en Pesos Colombianos (COP)');
  console.log('⚡ Para crear la base de datos: GET /api/create-all-tables');
});
