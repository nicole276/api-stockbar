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

// Función para generar HTML con estilos
const generarHTML = (titulo, datos, columnas) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>${titulo} - StockBar</title>
        <style>
            body { 
                font-family: Arial, sans-serif; 
                margin: 20px; 
                background-color: #f5f5f5;
            }
            .container { 
                max-width: 1400px; 
                margin: 0 auto; 
                background: white; 
                padding: 20px; 
                border-radius: 10px; 
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            h1 { 
                color: #2c3e50; 
                text-align: center; 
                margin-bottom: 30px;
            }
            table { 
                width: 100%; 
                border-collapse: collapse; 
                margin-bottom: 20px;
                font-size: 0.9em;
            }
            th { 
                background-color: #34495e; 
                color: white; 
                padding: 10px; 
                text-align: left;
            }
            td { 
                padding: 8px; 
                border-bottom: 1px solid #ddd;
            }
            tr:nth-child(even) { 
                background-color: #f8f9fa;
            }
            tr:hover { 
                background-color: #e9f7fe;
            }
            .precio { 
                text-align: right; 
                font-weight: bold; 
                color: #27ae60;
            }
            .stock { 
                text-align: center;
            }
            .stock-bajo { 
                color: #e74c3c; 
                font-weight: bold;
            }
            .nav { 
                text-align: center; 
                margin: 20px 0;
            }
            .nav a { 
                display: inline-block; 
                margin: 3px; 
                padding: 6px 12px; 
                background: #3498db; 
                color: white; 
                text-decoration: none; 
                border-radius: 5px;
                font-size: 0.8em;
            }
            .nav a:hover { 
                background: #2980b9;
            }
            .total { 
                text-align: right; 
                font-weight: bold; 
                margin-top: 10px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🍻 ${titulo} - StockBar</h1>
            <div class="nav">
                <a href="/">Inicio</a>
                <a href="/api/productos">Productos</a>
                <a href="/api/clientes">Clientes</a>
                <a href="/api/categorias">Categorías</a>
                <a href="/api/ventas">Ventas</a>
                <a href="/api/detalle-ventas">Detalle Ventas</a>
                <a href="/api/compras">Compras</a>
                <a href="/api/detalle-compras">Detalle Compras</a>
                <a href="/api/proveedores">Proveedores</a>
                <a href="/api/usuarios">Usuarios</a>
                <a href="/api/roles">Roles</a>
                <a href="/api/permisos">Permisos</a>
                <a href="/api/detalle-roles">Detalle Roles</a>
                <a href="/api/create-all-tables">⚡ Crear BD</a>
            </div>
            <table>
                <thead>
                    <tr>
                        ${columnas.map(col => `<th>${col}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${datos.map(fila => `
                        <tr>
                            ${fila.map((celda, index) => `
                                <td class="${typeof celda === 'number' && celda > 10000 ? 'precio' : ''} 
                                          ${index === 3 && celda < 10 ? 'stock-bajo' : 'stock'}">
                                    ${typeof celda === 'number' && celda > 1000 ? `$${celda.toLocaleString()}` : celda}
                                </td>
                            `).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <div class="total">Total: ${datos.length} registros</div>
        </div>
    </body>
    </html>
  `;
};

// Página principal con menú
app.get('/', (req, res) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>StockBar - Sistema de Gestión</title>
        <style>
            body { 
                font-family: Arial, sans-serif; 
                margin: 0; 
                padding: 0; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
            }
            .container { 
                max-width: 1400px; 
                margin: 0 auto; 
                padding: 40px 20px; 
                text-align: center;
            }
            .header { 
                background: white; 
                padding: 30px; 
                border-radius: 15px; 
                box-shadow: 0 10px 30px rgba(0,0,0,0.2); 
                margin-bottom: 30px;
            }
            h1 { 
                color: #2c3e50; 
                margin-bottom: 10px; 
                font-size: 2.5em;
            }
            .subtitle { 
                color: #7f8c8d; 
                font-size: 1.2em; 
                margin-bottom: 30px;
            }
            .menu { 
                display: grid; 
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
                gap: 20px; 
                margin-top: 30px;
            }
            .menu-item { 
                background: white; 
                padding: 20px; 
                border-radius: 10px; 
                text-decoration: none; 
                color: #2c3e50; 
                box-shadow: 0 5px 15px rgba(0,0,0,0.1);
                transition: transform 0.3s, box-shadow 0.3s;
            }
            .menu-item:hover { 
                transform: translateY(-5px); 
                box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            }
            .menu-item h3 { 
                margin: 0 0 10px 0; 
                color: #3498db;
                font-size: 1.1em;
            }
            .menu-item p { 
                margin: 0; 
                color: #7f8c8d; 
                font-size: 0.8em;
            }
            .icon { 
                font-size: 1.8em; 
                margin-bottom: 10px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🍻 StockBar</h1>
                <div class="subtitle">Sistema Completo de Gestión para Licorería</div>
                
                <div class="menu">
                    <a href="/api/productos" class="menu-item">
                        <div class="icon">📦</div>
                        <h3>Productos</h3>
                        <p>Gestionar inventario</p>
                    </a>
                    <a href="/api/clientes" class="menu-item">
                        <div class="icon">👥</div>
                        <h3>Clientes</h3>
                        <p>Clientes registrados</p>
                    </a>
                    <a href="/api/categorias" class="menu-item">
                        <div class="icon">📋</div>
                        <h3>Categorías</h3>
                        <p>Tipos de productos</p>
                    </a>
                    <a href="/api/ventas" class="menu-item">
                        <div class="icon">💰</div>
                        <h3>Ventas</h3>
                        <p>Historial de ventas</p>
                    </a>
                    <a href="/api/detalle-ventas" class="menu-item">
                        <div class="icon">📋</div>
                        <h3>Detalle Ventas</h3>
                        <p>Detalles de ventas</p>
                    </a>
                    <a href="/api/compras" class="menu-item">
                        <div class="icon">📥</div>
                        <h3>Compras</h3>
                        <p>Compras a proveedores</p>
                    </a>
                    <a href="/api/detalle-compras" class="menu-item">
                        <div class="icon">📋</div>
                        <h3>Detalle Compras</h3>
                        <p>Detalles de compras</p>
                    </a>
                    <a href="/api/proveedores" class="menu-item">
                        <div class="icon">🏢</div>
                        <h3>Proveedores</h3>
                        <p>Gestión de proveedores</p>
                    </a>
                    <a href="/api/usuarios" class="menu-item">
                        <div class="icon">👤</div>
                        <h3>Usuarios</h3>
                        <p>Administración</p>
                    </a>
                    <a href="/api/roles" class="menu-item">
                        <div class="icon">🔐</div>
                        <h3>Roles</h3>
                        <p>Roles del sistema</p>
                    </a>
                    <a href="/api/permisos" class="menu-item">
                        <div class="icon">🔑</div>
                        <h3>Permisos</h3>
                        <p>Permisos de acceso</p>
                    </a>
                    <a href="/api/detalle-roles" class="menu-item">
                        <div class="icon">⚙️</div>
                        <h3>Detalle Roles</h3>
                        <p>Asignación permisos</p>
                    </a>
                    <a href="/api/create-all-tables" class="menu-item" style="background: #e74c3c; color: white;">
                        <div class="icon">⚡</div>
                        <h3>Crear Base de Datos</h3>
                        <p>Inicializar tablas y datos</p>
                    </a>
                </div>
            </div>
        </div>
    </body>
    </html>
  `;
  res.send(html);
});

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
      (1, 'Whisky Old Parr 750ml', 15, 120000, 180000, 1),
      (1, 'Whisky Buchanan''s 750ml', 12, 95000, 140000, 1),
      (1, 'Tequila José Cuervo 750ml', 10, 85000, 125000, 1),
      (1, 'Vino Gato Negro Tinto', 40, 25000, 38000, 1),
      (1, 'Vino Casillero del Diablo', 20, 45000, 68000, 1),
      (1, 'Smirnoff Vodka 750ml', 18, 55000, 82000, 1),
      (1, 'Ginebra Gordon''s 750ml', 15, 48000, 72000, 1),
      (1, 'Brandy Terry 750ml', 22, 32000, 48000, 1),
      (1, 'Anís Núñez 750ml', 28, 28000, 42000, 1),
      -- CERVEZAS
      (2, 'Cerveza Águila Lata 330ml', 200, 2500, 4500, 1),
      (2, 'Cerveza Poker Lata 330ml', 150, 2500, 4500, 1),
      (2, 'Cerveza Corona Botella 355ml', 80, 5000, 8000, 1),
      (2, 'Cerveza Heineken Lata 330ml', 60, 4000, 7000, 1),
      (2, 'Cerveza Club Colombia Dorada', 45, 4500, 7500, 1),
      (2, 'Cerveza Budweiser Lata', 55, 3500, 6000, 1),
      (2, 'Cerveza Pilsen Lata', 65, 2400, 4200, 1),
      (2, 'Cerveza Costeña Lata', 40, 2300, 4000, 1),
      -- CIGARRILLOS
      (3, 'Cigarrillo Marlboro Rojo', 100, 4500, 7000, 1),
      (3, 'Cigarrillo Marlboro Gold', 90, 4500, 7000, 1),
      (3, 'Cigarrillo Lucky Strike', 80, 4200, 6500, 1),
      (3, 'Cigarrillo Camel', 70, 4800, 7500, 1),
      (3, 'Cigarrillo Belmont', 60, 5200, 8000, 1),
      (3, 'Cigarrillo Pielroja', 85, 3800, 6000, 1),
      (3, 'Cigarrillo Mustang', 75, 4000, 6200, 1),
      (3, 'Cigarrillo Derby', 95, 3500, 5500, 1),
      -- DULCERÍA
      (4, 'Papas Margarita Natural', 60, 3200, 5500, 1),
      (4, 'Papas Margarita Pollo', 45, 3200, 5500, 1),
      (4, 'Platanitos Verdes', 55, 2800, 4800, 1),
      (4, 'Mani Japonés', 65, 2500, 4200, 1),
      (4, 'Choclitos', 40, 3000, 5000, 1),
      (4, 'De Todito', 35, 3500, 5800, 1),
      (4, 'Chitos', 50, 3200, 5200, 1),
      (4, 'Gomitas Trululú', 75, 1800, 3000, 1),
      (4, 'Chocolate Jet', 60, 1500, 2500, 1),
      (4, 'Galletas Festival', 80, 1200, 2000, 1),
      (4, 'Cheetos', 45, 3400, 5600, 1),
      (4, 'Tostacos', 30, 3800, 6200, 1)
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
      ('Laura Valentina García', 'CC', '2345678901', '3203456789', 'Avenida 68 #15-40, Cali', 1),
      ('Javier Antonio Gómez', 'CE', 'AL12345678', '3154567890', 'Transversal 25 #30-15, Barranquilla', 1)
      ON CONFLICT DO NOTHING;
    `);

    // COMPRAS
    await pool.query(`
      INSERT INTO compras (id_proveedor, fecha, total, numero_factura, estado) VALUES
      (1, '2024-01-15 08:30:00', 3975000.00, 'FAC-BAV-2024-001', 1),
      (3, '2024-01-16 10:15:00', 1209500.00, 'FAC-LIC-2024-002', 1)
      ON CONFLICT DO NOTHING;
    `);

    // DETALLE_COMPRAS
    await pool.query(`
      INSERT INTO detalle_compras (id_compra, id_producto, cantidad, precio, subtotal) VALUES
      (1, 1, 50, 35000, 1750000),
      (1, 2, 30, 45000, 1350000),
      (1, 13, 200, 2500, 500000),
      (1, 14, 150, 2500, 375000),
      (2, 19, 100, 4500, 450000),
      (2, 20, 90, 4500, 405000),
      (2, 27, 60, 3200, 192000),
      (2, 29, 65, 2500, 162500)
      ON CONFLICT DO NOTHING;
    `);

    // VENTAS
    await pool.query(`
      INSERT INTO ventas (id_cliente, fecha, total, estado) VALUES
      (1, '2024-01-16 20:15:00', 71500.00, 1),
      (2, '2024-01-16 21:30:00', 58400.00, 1),
      (3, '2024-01-16 22:45:00', 191300.00, 1)
      ON CONFLICT DO NOTHING;
    `);

    // DETALLE_VENTAS
    await pool.query(`
      INSERT INTO detalle_ventas (id_venta, id_producto, cantidad, precio, subtotal) VALUES
      (1, 1, 1, 52000, 52000),
      (1, 19, 2, 7000, 14000),
      (1, 27, 1, 5500, 5500),
      (2, 13, 6, 4500, 27000),
      (2, 14, 4, 4500, 18000),
      (2, 29, 2, 4200, 8400),
      (2, 30, 1, 5000, 5000),
      (3, 4, 1, 180000, 180000),
      (3, 21, 1, 6500, 6500),
      (3, 28, 1, 4800, 4800)
      ON CONFLICT DO NOTHING;
    `);

    console.log('✅ Todas las tablas y datos creados exitosamente!');

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>✅ Base de Datos Creada - StockBar</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; background: #f0f8f0; }
          .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          h1 { color: #27ae60; text-align: center; }
          .success { background: #d4edda; color: #155724; padding: 15px; border-radius: 5px; margin: 20px 0; }
          .menu { text-align: center; margin: 30px 0; }
          .menu a { display: inline-block; margin: 5px; padding: 10px 20px; background: #3498db; color: white; text-decoration: none; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✅ BASE DE DATOS CREADA EXITOSAMENTE</h1>
          <div class="success">
            <h3>¡Todas las tablas y datos han sido creados!</h3>
            <p>Se crearon 13 tablas con datos de ejemplo para StockBar</p>
          </div>
          
          <div class="menu">
            <a href="/api/productos">📦 Ver Productos</a>
            <a href="/api/clientes">👥 Ver Clientes</a>
            <a href="/api/ventas">💰 Ver Ventas</a>
            <a href="/api/categorias">📋 Ver Categorías</a>
            <a href="/api/usuarios">👤 Ver Usuarios</a>
            <a href="/">🏠 Ir al Inicio</a>
          </div>

          <h3>Tablas creadas:</h3>
          <ul>
            <li>📊 roles, permisos, ver_detalle_rol</li>
            <li>👤 usuarios</li>
            <li>📦 categorias, productos</li>
            <li>🏢 proveedores, compras, detalle_compras</li>
            <li>👥 clientes, ventas, detalle_ventas</li>
          </ul>
        </div>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Error - StockBar</title></head>
      <body style="font-family: Arial; margin: 40px;">
        <h1 style="color: #e74c3c;">❌ Error creando base de datos</h1>
        <p><strong>Error:</strong> ${error.message}</p>
        <a href="/">Volver al inicio</a>
      </body>
      </html>
    `);
  }
});

// ==================== ENDPOINTS PARA TODAS LAS TABLAS ====================

// 1. PRODUCTOS
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
    
    const columnas = ['ID', 'Producto', 'Categoría', 'Stock', 'Precio Compra', 'Precio Venta', 'Estado'];
    const datos = result.rows.map(row => [
      row.id_producto,
      row.nombre,
      row.categoria,
      row.stock,
      row.precio_compra,
      row.precio_venta,
      row.estado
    ]);
    
    res.send(generarHTML('Productos - Licorería', datos, columnas));
  } catch (error) {
    res.status(500).send(`Error: ${error.message}`);
  }
});

// 2. CLIENTES
app.get('/api/clientes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clientes ORDER BY id_cliente');
    
    const columnas = ['ID', 'Nombre', 'Documento', 'Teléfono', 'Dirección', 'Estado'];
    const datos = result.rows.map(row => [
      row.id_cliente,
      row.nombre,
      `${row.tipo_documento}: ${row.documento}`,
      row.telefono,
      row.direccion,
      row.estado === 1 ? 'Activo' : 'Inactivo'
    ]);
    
    res.send(generarHTML('Clientes', datos, columnas));
  } catch (error) {
    res.status(500).send(`Error: ${error.message}`);
  }
});

// 3. CATEGORÍAS
app.get('/api/categorias', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categorias ORDER BY id_categoria');
    
    const columnas = ['ID', 'Categoría', 'Descripción', 'Estado'];
    const datos = result.rows.map(row => [
      row.id_categoria,
      row.nombre,
      row.descripcion,
      row.estado === 1 ? 'Activa' : 'Inactiva'
    ]);
    
    res.send(generarHTML('Categorías', datos, columnas));
  } catch (error) {
    res.status(500).send(`Error: ${error.message}`);
  }
});

// 4. VENTAS
app.get('/api/ventas', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT v.id_venta, c.nombre as cliente, 
             TO_CHAR(v.fecha, 'DD/MM/YYYY HH24:MI') as fecha, 
             v.total, 
             CASE WHEN v.estado = 1 THEN 'Completada' ELSE 'Cancelada' END as estado
      FROM ventas v 
      LEFT JOIN clientes c ON v.id_cliente = c.id_cliente 
      ORDER BY v.fecha DESC
    `);
    
    const columnas = ['ID Venta', 'Cliente', 'Fecha', 'Total', 'Estado'];
    const datos = result.rows.map(row => [
      row.id_venta,
      row.cliente,
      row.fecha,
      row.total,
      row.estado
    ]);
    
    res.send(generarHTML('Ventas', datos, columnas));
  } catch (error) {
    res.status(500).send(`Error: ${error.message}`);
  }
});

// 5. DETALLE VENTAS
app.get('/api/detalle-ventas', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT dv.*, p.nombre as producto_nombre, cl.nombre as cliente,
             v.fecha, v.total as total_venta
      FROM detalle_ventas dv
      JOIN productos p ON dv.id_producto = p.id_producto
      JOIN ventas v ON dv.id_venta = v.id_venta
      JOIN clientes cl ON v.id_cliente = cl.id_cliente
      ORDER BY dv.id_det_venta
    `);
    
    const columnas = ['ID Detalle', 'Venta', 'Producto', 'Cliente', 'Cantidad', 'Precio', 'Subtotal', 'Fecha Venta', 'Total Venta'];
    const datos = result.rows.map(row => [
      row.id_det_venta,
      row.id_venta,
      row.producto_nombre,
      row.cliente,
      row.cantidad,
      row.precio,
      row.subtotal,
      new Date(row.fecha).toLocaleString('es-CO'),
      row.total_venta
    ]);
    
    res.send(generarHTML('Detalle de Ventas', datos, columnas));
  } catch (error) {
    res.status(500).send(`Error: ${error.message}`);
  }
});

// 6. COMPRAS
app.get('/api/compras', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.id_compra, p.nombre_razon_social as proveedor, 
             TO_CHAR(c.fecha, 'DD/MM/YYYY HH24:MI') as fecha, 
             c.total, c.numero_factura,
             CASE WHEN c.estado = 1 THEN 'Completada' ELSE 'Cancelada' END as estado
      FROM compras c 
      LEFT JOIN proveedores p ON c.id_proveedor = p.id_proveedor 
      ORDER BY c.fecha DESC
    `);
    
    const columnas = ['ID Compra', 'Proveedor', 'Fecha', 'Total', 'N° Factura', 'Estado'];
    const datos = result.rows.map(row => [
      row.id_compra,
      row.proveedor,
      row.fecha,
      row.total,
      row.numero_factura,
      row.estado
    ]);
    
    res.send(generarHTML('Compras a Proveedores', datos, columnas));
  } catch (error) {
    res.status(500).send(`Error: ${error.message}`);
  }
});

// 7. DETALLE COMPRAS
app.get('/api/detalle-compras', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT dc.*, p.nombre as producto_nombre, c.numero_factura,
             pr.nombre_razon_social as proveedor
      FROM detalle_compras dc
      JOIN productos p ON dc.id_producto = p.id_producto
      JOIN compras c ON dc.id_compra = c.id_compra
      JOIN proveedores pr ON c.id_proveedor = pr.id_proveedor
      ORDER BY dc.id_det_compra
    `);
    
    const columnas = ['ID Detalle', 'Compra', 'Producto', 'Cantidad', 'Precio', 'Subtotal', 'Proveedor', 'Factura'];
    const datos = result.rows.map(row => [
      row.id_det_compra,
      row.id_compra,
      row.producto_nombre,
      row.cantidad,
      row.precio,
      row.subtotal,
      row.proveedor,
      row.numero_factura
    ]);
    
    res.send(generarHTML('Detalle de Compras', datos, columnas));
  } catch (error) {
    res.status(500).send(`Error: ${error.message}`);
  }
});

// 8. PROVEEDORES
app.get('/api/proveedores', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM proveedores ORDER BY id_proveedor');
    
    const columnas = ['ID', 'Proveedor', 'Documento', 'Contacto', 'Teléfono', 'Email', 'Estado'];
    const datos = result.rows.map(row => [
      row.id_proveedor,
      row.nombre_razon_social,
      `${row.tipo_documento}: ${row.documento}`,
      row.contacto,
      row.telefono,
      row.email,
      row.estado === 1 ? 'Activo' : 'Inactivo'
    ]);
    
    res.send(generarHTML('Proveedores', datos, columnas));
  } catch (error) {
    res.status(500).send(`Error: ${error.message}`);
  }
});

// 9. USUARIOS
app.get('/api/usuarios', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id_usuario, u.nombre_completo, u.usuario, u.email, 
             r.nombre_rol, 
             CASE WHEN u.estado = 1 THEN 'Activo' ELSE 'Inactivo' END as estado
      FROM usuarios u 
      LEFT JOIN roles r ON u.id_rol = r.id_rol 
      ORDER BY u.id_usuario
    `);
    
    const columnas = ['ID', 'Nombre Completo', 'Usuario', 'Email', 'Rol', 'Estado'];
    const datos = result.rows.map(row => [
      row.id_usuario,
      row.nombre_completo,
      row.usuario,
      row.email,
      row.nombre_rol,
      row.estado
    ]);
    
    res.send(generarHTML('Usuarios del Sistema', datos, columnas));
  } catch (error) {
    res.status(500).send(`Error: ${error.message}`);
  }
});

// 10. ROLES
app.get('/api/roles', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM roles ORDER BY id_rol');
    
    const columnas = ['ID', 'Nombre Rol', 'Descripción', 'Estado'];
    const datos = result.rows.map(row => [
      row.id_rol,
      row.nombre_rol,
      row.descripcion,
      row.estado === 1 ? 'Activo' : 'Inactivo'
    ]);
    
    res.send(generarHTML('Roles del Sistema', datos, columnas));
  } catch (error) {
    res.status(500).send(`Error: ${error.message}`);
  }
});

// 11. PERMISOS
app.get('/api/permisos', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, r.nombre_rol 
      FROM permisos p 
      LEFT JOIN roles r ON p.id_rol = r.id_rol 
      ORDER BY p.id_permiso
    `);
    
    const columnas = ['ID Permiso', 'Rol', 'ID Rol'];
    const datos = result.rows.map(row => [
      row.id_permiso,
      row.nombre_rol,
      row.id_rol
    ]);
    
    res.send(generarHTML('Permisos del Sistema', datos, columnas));
  } catch (error) {
    res.status(500).send(`Error: ${error.message}`);
  }
});

// 12. VER_DETALLE_ROL
app.get('/api/detalle-roles', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT vdr.*, r.nombre_rol, p.id_permiso
      FROM ver_detalle_rol vdr 
      LEFT JOIN roles r ON vdr.id_rol = r.id_rol 
      LEFT JOIN permisos p ON vdr.id_permiso = p.id_permiso 
      ORDER BY vdr.id_detalle
    `);
    
    const columnas = ['ID Detalle', 'Rol', 'ID Rol', 'ID Permiso'];
    const datos = result.rows.map(row => [
      row.id_detalle,
      row.nombre_rol,
      row.id_rol,
      row.id_permiso
    ]);
    
    res.send(generarHTML('Detalle de Roles y Permisos', datos, columnas));
  } catch (error) {
    res.status(500).send(`Error: ${error.message}`);
  }
});

// 13. Test de base de datos
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as current_time');
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
          <title>Estado BD - StockBar</title>
          <style>
              body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
              .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
              .success { color: #27ae60; font-size: 1.2em; margin: 20px 0; }
              .time { color: #7f8c8d; margin: 10px 0; }
              a { display: inline-block; margin-top: 20px; padding: 10px 20px; background: #3498db; color: white; text-decoration: none; border-radius: 5px; }
          </style>
      </head>
      <body>
          <div class="container">
              <h1>🔍 Estado de la Base de Datos</h1>
              <div class="success">✅ Conectado a PostgreSQL correctamente</div>
              <div class="time">Hora del servidor: ${result.rows[0].current_time}</div>
              <a href="/">Volver al Inicio</a>
          </div>
      </body>
      </html>
    `;
    res.send(html);
  } catch (error) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
          <title>Error BD - StockBar</title>
          <style>
              body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
              .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
              .error { color: #e74c3c; font-size: 1.2em; margin: 20px 0; }
              a { display: inline-block; margin-top: 20px; padding: 10px 20px; background: #3498db; color: white; text-decoration: none; border-radius: 5px; }
          </style>
      </head>
      <body>
          <div class="container">
              <h1>🔍 Error de Base de Datos</h1>
              <div class="error">❌ Error: ${error.message}</div>
              <a href="/">Volver al Inicio</a>
          </div>
      </body>
      </html>
    `;
    res.status(500).send(html);
  }
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 Servidor API StockBar - CONECTADO A POSTGRESQL EN RENDER');
  console.log('📡 Puerto: ' + PORT);
  console.log('🌐 URL: https://api-stockbar.onrender.com');
  console.log('⚡ Para crear la base de datos, visita: /api/create-all-tables');
});
