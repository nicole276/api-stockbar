const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

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
        estado SMALLINT
      );
    `);

    // TABLA PERMISOS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS permisos (
        id_permiso SERIAL PRIMARY KEY,
        id_rol INTEGER
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
        estado SMALLINT
      );
    `);

    // TABLA CATEGORIAS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categorias (
        id_categoria SERIAL PRIMARY KEY,
        nombre VARCHAR(50),
        descripcion VARCHAR(50),
        estado SMALLINT
      );
    `);

    // TABLA PRODUCTOS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS productos (
        id_producto SERIAL PRIMARY KEY,
        id_categoria INTEGER REFERENCES categorias(id_categoria),
        nombre VARCHAR(50),
        stock INTEGER,
        precio_compra DECIMAL(10,2),
        precio_venta DECIMAL(10,2),
        estado SMALLINT
      );
    `);

    // TABLA PROVEEDORES
    await pool.query(`
      CREATE TABLE IF NOT EXISTS proveedores (
        id_proveedor SERIAL PRIMARY KEY,
        nombre_razon_social VARCHAR(50),
        tipo_documento VARCHAR(20),
        documento INTEGER,
        contacto VARCHAR(50),
        telefono VARCHAR(15),
        email VARCHAR(50),
        direccion VARCHAR(50),
        estado SMALLINT
      );
    `);

    // TABLA COMPRAS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS compras (
        id_compra SERIAL PRIMARY KEY,
        id_proveedor INTEGER REFERENCES proveedores(id_proveedor),
        fecha TIMESTAMP,
        total DECIMAL(10,2),
        numero_factura VARCHAR(50),
        estado SMALLINT
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
        estado SMALLINT
      );
    `);

    // TABLA VENTAS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ventas (
        id_venta SERIAL PRIMARY KEY,
        id_cliente INTEGER REFERENCES clientes(id_cliente),
        fecha TIMESTAMP,
        total DECIMAL(10,2),
        estado SMALLINT
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

    // INSERTAR DATOS
    await pool.query(`
      INSERT INTO roles (nombre_rol, descripcion, estado) VALUES
      ('Administrador', 'Acceso total al sistema', 1),
      ('Cajero', 'Puede realizar ventas', 1),
      ('Bodeguero', 'Gestiona inventario', 1)
      ON CONFLICT DO NOTHING;
    `);

    await pool.query(`
      INSERT INTO permisos (id_rol) VALUES (1), (2), (3)
      ON CONFLICT DO NOTHING;
    `);

    await pool.query(`
      INSERT INTO ver_detalle_rol (id_rol, id_permiso) VALUES
      (1, 1), (2, 2), (3, 3)
      ON CONFLICT DO NOTHING;
    `);

    await pool.query(`
      INSERT INTO usuarios (id_rol, nombre_completo, email, usuario, contraseña, estado) VALUES
      (1, 'Carlos Admin', 'admin@elbar.com', 'carlosadmin', 'admin123', 1),
      (2, 'Maria Cajera', 'caja@elbar.com', 'mariacaja', 'caja123', 1),
      (3, 'Pedro Bodega', 'bodega@elbar.com', 'pedrobodega', 'bodega123', 1)
      ON CONFLICT DO NOTHING;
    `);

    await pool.query(`
      INSERT INTO categorias (nombre, descripcion, estado) VALUES
      ('Licores', 'Bebidas alcoholicas fuertes', 1),
      ('Cervezas', 'Cervezas nacionales e importadas', 1),
      ('Cigarrillos', 'Marcas de cigarrillos', 1),
      ('Dulcería', 'Snacks y botanas', 1)
      ON CONFLICT DO NOTHING;
    `);

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

    await pool.query(`
      INSERT INTO proveedores (nombre_razon_social, tipo_documento, documento, contacto, telefono, email, direccion, estado) VALUES
      ('Bavaria S.A.', 'NIT', 860000123, 'Juan Distribuidor', '6012345678', 'ventas@bavaria.com.co', 'Autopista Norte #125-80, Bogotá', 1),
      ('Distribuidora La Rebaja', 'NIT', 860000789, 'Carlos Suministros', '6034567890', 'compras@larebaja.com.co', 'Avenida 68 #15-40, Cali', 1),
      ('Licores de Colombia S.A.', 'NIT', 860000456, 'Maria Proveedora', '6023456789', 'pedidos@licorescolombia.com.co', 'Calle 100 #25-50, Medellín', 1)
      ON CONFLICT DO NOTHING;
    `);

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
      tablas_creadas: [
        'roles', 'permisos', 'ver_detalle_rol', 'usuarios',
        'categorias', 'productos', 'proveedores', 'compras',
        'detalle_compras', 'clientes', 'ventas', 'detalle_ventas'
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

// ==================== ENDPOINTS CRUD - PRODUCTOS ====================
app.get('/api/productos', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.id_producto, p.nombre, c.nombre as categoria, 
             p.stock, p.precio_compra, p.precio_venta, 
             CASE WHEN p.estado = 1 THEN 'Activo' ELSE 'Inactivo' END as estado
      FROM productos p 
      LEFT JOIN categorias c ON p.id_categoria = c.id_categoria 
      ORDER BY p.id_producto
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

app.get('/api/productos/:id', async (req, res) => {
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

app.post('/api/productos', async (req, res) => {
  try {
    const { id_categoria, nombre, stock, precio_compra, precio_venta, estado } = req.body;
    
    const result = await pool.query(
      `INSERT INTO productos (id_categoria, nombre, stock, precio_compra, precio_venta, estado) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id_categoria, nombre, stock, precio_compra, precio_venta, estado || 1]
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

app.put('/api/productos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { id_categoria, nombre, stock, precio_compra, precio_venta, estado } = req.body;
    
    const result = await pool.query(
      `UPDATE productos SET id_categoria=$1, nombre=$2, stock=$3, precio_compra=$4, precio_venta=$5, estado=$6 
       WHERE id_producto=$7 RETURNING *`,
      [id_categoria, nombre, stock, precio_compra, precio_venta, estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }
    
    res.json({ 
      success: true, 
      message: 'Producto actualizado exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/productos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM productos WHERE id_producto = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }
    
    res.json({ 
      success: true, 
      message: 'Producto eliminado exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.patch('/api/productos/:id/estado', async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    const result = await pool.query(
      'UPDATE productos SET estado = $1 WHERE id_producto = $2 RETURNING *',
      [estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }
    
    res.json({ 
      success: true, 
      message: `Estado del producto actualizado a ${estado === 1 ? 'Activo' : 'Inactivo'}`,
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ENDPOINTS CRUD - CLIENTES ====================
app.get('/api/clientes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clientes ORDER BY id_cliente');
    
    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/clientes', async (req, res) => {
  try {
    const { nombre, tipo_documento, documento, telefono, direccion, estado } = req.body;
    
    const result = await pool.query(
      `INSERT INTO clientes (nombre, tipo_documento, documento, telefono, direccion, estado) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [nombre, tipo_documento, documento, telefono, direccion, estado || 1]
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

// ==================== ENDPOINTS CRUD - VENTAS ====================
// ==================== ENDPOINTS CRUD - VENTAS ====================

// GET - Obtener todas las ventas
app.get('/api/ventas', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT v.*, c.nombre as cliente_nombre
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

// GET - Obtener una venta por ID
app.get('/api/ventas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT v.*, c.nombre as cliente_nombre, c.documento as cliente_documento
      FROM ventas v 
      LEFT JOIN clientes c ON v.id_cliente = c.id_cliente 
      WHERE v.id_venta = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Venta no encontrada' });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST - Crear nueva venta
app.post('/api/ventas', async (req, res) => {
  try {
    const { id_cliente, total, estado } = req.body;
    
    const result = await pool.query(
      `INSERT INTO ventas (id_cliente, fecha, total, estado) 
       VALUES ($1, NOW(), $2, $3) RETURNING *`,
      [id_cliente, total, estado || 1]
    );
    
    res.status(201).json({ 
      success: true, 
      message: 'Venta creada exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT - Actualizar venta
app.put('/api/ventas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { id_cliente, total, estado } = req.body;
    
    // Verificar si la venta existe
    const ventaExistente = await pool.query(
      'SELECT * FROM ventas WHERE id_venta = $1',
      [id]
    );
    
    if (ventaExistente.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Venta no encontrada' });
    }
    
    const result = await pool.query(
      `UPDATE ventas SET id_cliente=$1, total=$2, estado=$3 
       WHERE id_venta=$4 RETURNING *`,
      [id_cliente, total, estado, id]
    );
    
    res.json({ 
      success: true, 
      message: 'Venta actualizada exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH - Cambiar solo el estado de la venta
app.patch('/api/ventas/:id/estado', async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    // Verificar si la venta existe
    const ventaExistente = await pool.query(
      'SELECT * FROM ventas WHERE id_venta = $1',
      [id]
    );
    
    if (ventaExistente.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Venta no encontrada' });
    }
    
    const result = await pool.query(
      'UPDATE ventas SET estado = $1 WHERE id_venta = $2 RETURNING *',
      [estado, id]
    );
    
    const textoEstado = estado === 1 ? 'Completada' : estado === 2 ? 'Anulada' : 'Pendiente';
    
    res.json({ 
      success: true, 
      message: `Estado de la venta actualizado a "${textoEstado}"`,
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE - Eliminar venta
app.delete('/api/ventas/:id', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    
    // Verificar si la venta existe
    const ventaExistente = await client.query(
      'SELECT * FROM ventas WHERE id_venta = $1',
      [id]
    );
    
    if (ventaExistente.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Venta no encontrada' });
    }
    
    // Primero eliminar los detalles de venta (si existen)
    await client.query(
      'DELETE FROM detalle_ventas WHERE id_venta = $1',
      [id]
    );
    
    // Luego eliminar la venta
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
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// ==================== VENTAS COMPLETAS CON DETALLES ====================
app.post('/api/ventas-completas', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id_cliente, total, productos } = req.body;
    
    // 1. Crear la venta principal
    const ventaResult = await client.query(
      `INSERT INTO ventas (id_cliente, fecha, total, estado) 
       VALUES ($1, NOW(), $2, $3) RETURNING *`,
      [id_cliente, total, 1]
    );
    
    const ventaId = ventaResult.rows[0].id_venta;
    
    // 2. Crear los detalles de venta (productos)
    for (const producto of productos) {
      await client.query(
        `INSERT INTO detalle_ventas (id_venta, id_producto, cantidad, precio, subtotal) 
         VALUES ($1, $2, $3, $4, $5)`,
        [ventaId, producto.id_producto, producto.cantidad, producto.precio_unitario, producto.cantidad * producto.precio_unitario]
      );
      
      // 3. Actualizar stock de productos
      await client.query(
        'UPDATE productos SET stock = stock - $1 WHERE id_producto = $2',
        [producto.cantidad, producto.id_producto]
      );
    }
    
    await client.query('COMMIT');
    
    res.status(201).json({ 
      success: true, 
      message: 'Venta registrada exitosamente con productos',
      data: {
        venta: ventaResult.rows[0],
        productos_vendidos: productos.length
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

app.get('/api/ventas-completas', async (req, res) => {
  try {
    // Obtener ventas principales
    const ventasResult = await pool.query(`
      SELECT v.*, c.nombre as cliente_nombre, c.telefono as cliente_telefono
      FROM ventas v 
      LEFT JOIN clientes c ON v.id_cliente = c.id_cliente 
      ORDER BY v.fecha DESC
    `);
    
    const ventas = ventasResult.rows;
    
    // Para cada venta, obtener sus detalles
    for (let venta of ventas) {
      const detallesResult = await pool.query(`
        SELECT dv.*, p.nombre as producto_nombre, p.precio_venta
        FROM detalle_ventas dv 
        LEFT JOIN productos p ON dv.id_producto = p.id_producto 
        WHERE dv.id_venta = $1
      `, [venta.id_venta]);
      
      venta.productos = detallesResult.rows;
    }
    
    res.json({
      success: true,
      data: ventas,
      total: ventas.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ENDPOINTS QUE FALTAN PARA COMPLETAR CRUD ====================

// PUT - Actualizar venta (para editar y cambiar estado)
app.put('/api/ventas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { id_cliente, total, estado } = req.body;
    
    const result = await pool.query(
      `UPDATE ventas SET id_cliente=$1, total=$2, estado=$3 
       WHERE id_venta=$4 RETURNING *`,
      [id_cliente, total, estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Venta no encontrada' });
    }
    
    res.json({ 
      success: true, 
      message: 'Venta actualizada exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE - Eliminar venta
app.delete('/api/ventas/:id', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    
    // Primero eliminar los detalles de venta
    await client.query('DELETE FROM detalle_ventas WHERE id_venta = $1', [id]);
    
    // Luego eliminar la venta principal
    const result = await client.query(
      'DELETE FROM ventas WHERE id_venta = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Venta no encontrada' });
    }
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      message: 'Venta eliminada exitosamente',
      data: result.rows[0] 
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// ==================== ENDPOINT DE ESTADO ====================
app.get('/api/status', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as server_time');
    
    res.json({
      success: true,
      message: 'API StockBar funcionando correctamente',
      server_time: result.rows[0].server_time
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
    version: '1.0.0',
    documentation: 'Visita /api/status para ver todos los endpoints disponibles'
  });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 Servidor API StockBar - COMPLETO');
  console.log('📡 Puerto: ' + PORT);
  console.log('🌐 URL: https://api-stockbar.onrender.com');
  console.log('📚 Documentación: /api/status');
  console.log('⚡ Para crear la base de datos: GET /api/create-all-tables');
});
