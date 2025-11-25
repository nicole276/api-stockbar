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

    // ==================== TABLA ROLES ====================
    await pool.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id_rol SERIAL PRIMARY KEY,
        nombre_rol VARCHAR(50),
        descripcion VARCHAR(50),
        estado SMALLINT
      );
    `);

    // ==================== TABLA PERMISOS ====================
    await pool.query(`
      CREATE TABLE IF NOT EXISTS permisos (
        id_permiso SERIAL PRIMARY KEY,
        id_rol INTEGER
      );
    `);

    // ==================== TABLA VER_DETALLE_ROL ====================
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ver_detalle_rol (
        id_detalle SERIAL PRIMARY KEY,
        id_rol INTEGER REFERENCES roles(id_rol),
        id_permiso INTEGER REFERENCES permisos(id_permiso)
      );
    `);

    // ==================== TABLA USUARIOS ====================
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

    // ==================== TABLA CATEGORIAS ====================
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categorias (
        id_categoria SERIAL PRIMARY KEY,
        nombre VARCHAR(50),
        descripcion VARCHAR(50),
        estado SMALLINT
      );
    `);

    // ==================== TABLA PRODUCTOS ====================
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

    // ==================== TABLA PROVEEDORES ====================
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

    // ==================== TABLA COMPRAS ====================
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

    // ==================== TABLA DETALLE_COMPRAS ====================
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

    // ==================== TABLA CLIENTES ====================
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

    // ==================== TABLA VENTAS ====================
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ventas (
        id_venta SERIAL PRIMARY KEY,
        id_cliente INTEGER REFERENCES clientes(id_cliente),
        fecha TIMESTAMP,
        total DECIMAL(10,2),
        estado SMALLINT
      );
    `);

    // ==================== TABLA DETALLE_VENTAS ====================
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

    // ==================== INSERTAR DATOS ====================

    // ROLES
    await pool.query(`
      INSERT INTO roles (nombre_rol, descripcion, estado) VALUES
      ('Administrador', 'Acceso total al sistema', 1),
      ('Cajero', 'Puede realizar ventas', 1),
      ('Bodeguero', 'Gestiona inventario', 1)
      ON CONFLICT DO NOTHING;
    `);

    // PERMISOS
    await pool.query(`
      INSERT INTO permisos (id_rol) VALUES (1), (2), (3)
      ON CONFLICT DO NOTHING;
    `);

    // VER_DETALLE_ROL
    await pool.query(`
      INSERT INTO ver_detalle_rol (id_rol, id_permiso) VALUES
      (1, 1), (2, 2), (3, 3)
      ON CONFLICT DO NOTHING;
    `);

    // USUARIOS
    await pool.query(`
      INSERT INTO usuarios (id_rol, nombre_completo, email, usuario, contraseña, estado) VALUES
      (1, 'Carlos Admin', 'admin@elbar.com', 'carlosadmin', 'admin123', 1),
      (2, 'Maria Cajera', 'caja@elbar.com', 'mariacaja', 'caja123', 1),
      (3, 'Pedro Bodega', 'bodega@elbar.com', 'pedrobodega', 'bodega123', 1)
      ON CONFLICT DO NOTHING;
    `);

    // CATEGORIAS
    await pool.query(`
      INSERT INTO categorias (nombre, descripcion, estado) VALUES
      ('Licores', 'Bebidas alcoholicas fuertes', 1),
      ('Cervezas', 'Cervezas nacionales e importadas', 1),
      ('Cigarrillos', 'Marcas de cigarrillos', 1),
      ('Dulcería', 'Snacks y botanas', 1)
      ON CONFLICT DO NOTHING;
    `);

    // PRODUCTOS
    await pool.query(`
      INSERT INTO productos (id_categoria, nombre, stock, precio_compra, precio_venta, estado) VALUES
      -- LICORES
      (1, 'Aguardiente Antioqueño 750ml', 50, 35000, 52000, 1),
      (1, 'Ron Medellín Añejo 750ml', 30, 45000, 65000, 1),
      (1, 'Ron Viejo de Caldas 750ml', 25, 38000, 55000, 1),
      -- CERVEZAS
      (2, 'Cerveza Águila Lata 330ml', 200, 2500, 4500, 1),
      (2, 'Cerveza Poker Lata 330ml', 150, 2500, 4500, 1),
      (2, 'Cerveza Corona Botella 355ml', 80, 5000, 8000, 1),
      -- CIGARRILLOS
      (3, 'Cigarrillo Marlboro Rojo', 100, 4500, 7000, 1),
      (3, 'Cigarrillo Marlboro Gold', 90, 4500, 7000, 1),
      (3, 'Cigarrillo Lucky Strike', 80, 4200, 6500, 1),
      -- DULCERÍA
      (4, 'Papas Margarita Natural', 60, 3200, 5500, 1),
      (4, 'Papas Margarita Pollo', 45, 3200, 5500, 1),
      (4, 'Platanitos Verdes', 55, 2800, 4800, 1)
      ON CONFLICT DO NOTHING;
    `);

    // PROVEEDORES
    await pool.query(`
      INSERT INTO proveedores (nombre_razon_social, tipo_documento, documento, contacto, telefono, email, direccion, estado) VALUES
      ('Bavaria S.A.', 'NIT', 860000123, 'Juan Distribuidor', '6012345678', 'ventas@bavaria.com.co', 'Autopista Norte #125-80, Bogotá', 1),
      ('Distribuidora La Rebaja', 'NIT', 860000789, 'Carlos Suministros', '6034567890', 'compras@larebaja.com.co', 'Avenida 68 #15-40, Cali', 1),
      ('Licores de Colombia S.A.', 'NIT', 860000456, 'Maria Proveedora', '6023456789', 'pedidos@licorescolombia.com.co', 'Calle 100 #25-50, Medellín', 1)
      ON CONFLICT DO NOTHING;
    `);

    // CLIENTES
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

// ==================== ENDPOINTS CRUD - VER_DETALLE_ROL ====================

// GET - Obtener todos los detalles de rol
app.get('/api/ver-detalle-rol', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT vdr.*, r.nombre_rol, p.id_permiso
      FROM ver_detalle_rol vdr 
      LEFT JOIN roles r ON vdr.id_rol = r.id_rol 
      LEFT JOIN permisos p ON vdr.id_permiso = p.id_permiso 
      ORDER BY vdr.id_detalle
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

// POST - Crear nuevo detalle de rol
app.post('/api/ver-detalle-rol', async (req, res) => {
  try {
    const { id_rol, id_permiso } = req.body;
    
    const result = await pool.query(
      `INSERT INTO ver_detalle_rol (id_rol, id_permiso) 
       VALUES ($1, $2) RETURNING *`,
      [id_rol, id_permiso]
    );
    
    res.status(201).json({ 
      success: true, 
      message: 'Detalle de rol creado exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ENDPOINTS CRUD - DETALLE_COMPRAS ====================

// GET - Obtener todos los detalles de compra
app.get('/api/detalle-compras', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT dc.*, c.numero_factura, p.nombre as producto_nombre, 
             pr.nombre_razon_social as proveedor_nombre
      FROM detalle_compras dc 
      LEFT JOIN compras c ON dc.id_compra = c.id_compra 
      LEFT JOIN productos p ON dc.id_producto = p.id_producto 
      LEFT JOIN proveedores pr ON c.id_proveedor = pr.id_proveedor 
      ORDER BY dc.id_det_compra DESC
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

// GET - Obtener detalles de compra por ID de compra
app.get('/api/detalle-compras/compra/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT dc.*, p.nombre as producto_nombre, p.precio_compra, p.precio_venta
      FROM detalle_compras dc 
      LEFT JOIN productos p ON dc.id_producto = p.id_producto 
      WHERE dc.id_compra = $1
    `, [id]);
    
    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST - Crear nuevo detalle de compra
app.post('/api/detalle-compras', async (req, res) => {
  try {
    const { id_compra, id_producto, cantidad, precio, subtotal } = req.body;
    
    const result = await pool.query(
      `INSERT INTO detalle_compras (id_compra, id_producto, cantidad, precio, subtotal) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id_compra, id_producto, cantidad, precio, subtotal]
    );
    
    res.status(201).json({ 
      success: true, 
      message: 'Detalle de compra creado exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ENDPOINTS CRUD - DETALLE_VENTAS ====================

// GET - Obtener todos los detalles de venta
app.get('/api/detalle-ventas', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT dv.*, v.fecha as venta_fecha, c.nombre as cliente_nombre, 
             p.nombre as producto_nombre, p.precio_venta
      FROM detalle_ventas dv 
      LEFT JOIN ventas v ON dv.id_venta = v.id_venta 
      LEFT JOIN clientes c ON v.id_cliente = c.id_cliente 
      LEFT JOIN productos p ON dv.id_producto = p.id_producto 
      ORDER BY dv.id_det_venta DESC
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

// GET - Obtener detalles de venta por ID de venta
app.get('/api/detalle-ventas/venta/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT dv.*, p.nombre as producto_nombre, p.precio_venta
      FROM detalle_ventas dv 
      LEFT JOIN productos p ON dv.id_producto = p.id_producto 
      WHERE dv.id_venta = $1
    `, [id]);
    
    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST - Crear nuevo detalle de venta
app.post('/api/detalle-ventas', async (req, res) => {
  try {
    const { id_venta, id_producto, cantidad, precio, subtotal } = req.body;
    
    const result = await pool.query(
      `INSERT INTO detalle_ventas (id_venta, id_producto, cantidad, precio, subtotal) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id_venta, id_producto, cantidad, precio, subtotal]
    );
    
    res.status(201).json({ 
      success: true, 
      message: 'Detalle de venta creado exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ENDPOINTS PARA VENTAS COMPLETAS ====================

// POST - Crear venta completa con productos
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

// GET - Obtener ventas completas con detalles
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

// ==================== ENDPOINTS PARA COMPRAS COMPLETAS ====================

// POST - Crear compra completa con productos
app.post('/api/compras-completas', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id_proveedor, total, numero_factura, productos } = req.body;
    
    // 1. Crear la compra principal
    const compraResult = await client.query(
      `INSERT INTO compras (id_proveedor, fecha, total, numero_factura, estado) 
       VALUES ($1, NOW(), $2, $3, $4) RETURNING *`,
      [id_proveedor, total, numero_factura, 1]
    );
    
    const compraId = compraResult.rows[0].id_compra;
    
    // 2. Crear los detalles de compra (productos)
    for (const producto of productos) {
      await client.query(
        `INSERT INTO detalle_compras (id_compra, id_producto, cantidad, precio, subtotal) 
         VALUES ($1, $2, $3, $4, $5)`,
        [compraId, producto.id_producto, producto.cantidad, producto.precio, producto.cantidad * producto.precio]
      );
      
      // 3. Actualizar stock de productos
      await client.query(
        'UPDATE productos SET stock = stock + $1 WHERE id_producto = $2',
        [producto.cantidad, producto.id_producto]
      );
    }
    
    await client.query('COMMIT');
    
    res.status(201).json({ 
      success: true, 
      message: 'Compra registrada exitosamente con productos',
      data: {
        compra: compraResult.rows[0],
        productos_comprados: productos.length
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// GET - Obtener compras completas con detalles
app.get('/api/compras-completas', async (req, res) => {
  try {
    // Obtener compras principales
    const comprasResult = await pool.query(`
      SELECT c.*, p.nombre_razon_social as proveedor_nombre, p.contacto as proveedor_contacto
      FROM compras c 
      LEFT JOIN proveedores p ON c.id_proveedor = p.id_proveedor 
      ORDER BY c.fecha DESC
    `);
    
    const compras = comprasResult.rows;
    
    // Para cada compra, obtener sus detalles
    for (let compra of compras) {
      const detallesResult = await pool.query(`
        SELECT dc.*, pr.nombre as producto_nombre, pr.precio_compra, pr.precio_venta
        FROM detalle_compras dc 
        LEFT JOIN productos pr ON dc.id_producto = pr.id_producto 
        WHERE dc.id_compra = $1
      `, [compra.id_compra]);
      
      compra.productos = detallesResult.rows;
    }
    
    res.json({
      success: true,
      data: compras,
      total: compras.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ENDPOINTS CRUD - PRODUCTOS ====================

// GET - Obtener todos los productos
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

// GET - Obtener un producto por ID
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

// POST - Crear nuevo producto
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

// PUT - Actualizar producto
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

// DELETE - Eliminar producto
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

// PATCH - Cambiar estado de producto
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

// GET - Obtener todos los clientes
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

// GET - Obtener un cliente por ID
app.get('/api/clientes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM clientes WHERE id_cliente = $1', [id]);
    
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

// POST - Crear nuevo cliente
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

// PUT - Actualizar cliente
app.put('/api/clientes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, tipo_documento, documento, telefono, direccion, estado } = req.body;
    
    const result = await pool.query(
      `UPDATE clientes SET nombre=$1, tipo_documento=$2, documento=$3, telefono=$4, direccion=$5, estado=$6 
       WHERE id_cliente=$7 RETURNING *`,
      [nombre, tipo_documento, documento, telefono, direccion, estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }
    
    res.json({ 
      success: true, 
      message: 'Cliente actualizado exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE - Eliminar cliente
app.delete('/api/clientes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM clientes WHERE id_cliente = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }
    
    res.json({ 
      success: true, 
      message: 'Cliente eliminado exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ENDPOINTS CRUD - CATEGORÍAS ====================

// GET - Obtener todas las categorías
app.get('/api/categorias', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categorias ORDER BY id_categoria');
    
    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST - Crear nueva categoría
app.post('/api/categorias', async (req, res) => {
  try {
    const { nombre, descripcion, estado } = req.body;
    
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

// ==================== ENDPOINTS CRUD - USUARIOS ====================

// GET - Obtener todos los usuarios
app.get('/api/usuarios', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.*, r.nombre_rol 
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

// POST - Crear nuevo usuario
app.post('/api/usuarios', async (req, res) => {
  try {
    const { id_rol, nombre_completo, email, usuario, contraseña, estado } = req.body;
    
    const result = await pool.query(
      `INSERT INTO usuarios (id_rol, nombre_completo, email, usuario, contraseña, estado) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id_rol, nombre_completo, email, usuario, contraseña, estado || 1]
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

// ==================== ENDPOINTS CRUD - PROVEEDORES ====================

// GET - Obtener todos los proveedores
app.get('/api/proveedores', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM proveedores ORDER BY id_proveedor');
    
    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST - Crear nuevo proveedor
app.post('/api/proveedores', async (req, res) => {
  try {
    const { nombre_razon_social, tipo_documento, documento, contacto, telefono, email, direccion, estado } = req.body;
    
    const result = await pool.query(
      `INSERT INTO proveedores (nombre_razon_social, tipo_documento, documento, contacto, telefono, email, direccion, estado) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [nombre_razon_social, tipo_documento, documento, contacto, telefono, email, direccion, estado || 1]
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

// ==================== ENDPOINTS CRUD - COMPRAS ====================

// GET - Obtener todas las compras
app.get('/api/compras', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, p.nombre_razon_social as proveedor_nombre
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

// ==================== ENDPOINT DE ESTADO ====================

app.get('/api/status', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as server_time');
    
    res.json({
      success: true,
      message: 'API StockBar funcionando correctamente',
      server_time: result.rows[0].server_time,
      endpoints: {
        productos: {
          GET: '/api/productos',
          POST: '/api/productos',
          PUT: '/api/productos/:id',
          DELETE: '/api/productos/:id',
          PATCH: '/api/productos/:id/estado'
        },
        clientes: {
          GET: '/api/clientes',
          POST: '/api/clientes', 
          PUT: '/api/clientes/:id',
          DELETE: '/api/clientes/:id'
        },
        categorias: {
          GET: '/api/categorias',
          POST: '/api/categorias'
        },
        usuarios: {
          GET: '/api/usuarios',
          POST: '/api/usuarios'
        },
        proveedores: {
          GET: '/api/proveedores',
          POST: '/api/proveedores'
        },
        ventas: {
          GET: '/api/ventas',
          POST: '/api/ventas',
          'GET con detalles': '/api/ventas-completas',
          'POST con productos': '/api/ventas-completas',
          'GET detalles venta': '/api/detalle-ventas'
        },
        compras: {
          GET: '/api/compras',
          'GET con detalles': '/api/compras-completas',
          'POST con productos': '/api/compras-completas',
          'GET detalles compra': '/api/detalle-compras'
        },
        'detalle-ventas': {
          GET: '/api/detalle-ventas',
          POST: '/api/detalle-ventas',
          'GET por venta': '/api/detalle-ventas/venta/:id'
        },
        'detalle-compras': {
          GET: '/api/detalle-compras',
          POST: '/api/detalle-compras',
          'GET por compra': '/api/detalle-compras/compra/:id'
        },
        'ver-detalle-rol': {
          GET: '/api/ver-detalle-rol',
          POST: '/api/ver-detalle-rol'
        },
        setup: {
          'Crear BD': '/api/create-all-tables'
        }
      }
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

// Manejo de rutas no encontradas
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint no encontrado',
    available_endpoints: [
      'GET /',
      'GET /api/status',
      'GET /api/create-all-tables',
      'GET /api/productos',
      'GET /api/productos/:id', 
      'POST /api/productos',
      'PUT /api/productos/:id',
      'DELETE /api/productos/:id',
      'PATCH /api/productos/:id/estado',
      'GET /api/clientes',
      'GET /api/clientes/:id',
      'POST /api/clientes',
      'PUT /api/clientes/:id',
      'DELETE /api/clientes/:id',
      'GET /api/categorias',
      'POST /api/categorias',
      'GET /api/usuarios',
      'POST /api/usuarios',
      'GET /api/proveedores',
      'POST /api/proveedores',
      'GET /api/ventas',
      'POST /api/ventas',
      'GET /api/ventas-completas',
      'POST /api/ventas-completas',
      'GET /api/compras',
      'GET /api/compras-completas',
      'POST /api/compras-completas',
      'GET /api/detalle-ventas',
      'POST /api/detalle-ventas',
      'GET /api/detalle-ventas/venta/:id',
      'GET /api/detalle-compras',
      'POST /api/detalle-compras',
      'GET /api/detalle-compras/compra/:id',
      'GET /api/ver-detalle-rol',
      'POST /api/ver-detalle-rol'
    ]
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
