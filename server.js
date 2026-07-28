const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

// Diagnostic helper: mask sensitive values when logging
function maskValue(val) {
  if (!val) return '❌ NOT SET';
  try {
    const s = String(val);
    if (s.length <= 4) return '***';
    return s.slice(0, 2) + '***' + s.slice(-2);
  } catch (e) {
    return '***';
  }
}

// Log which DB-related env vars are present (masked)
console.log('🔎 ENV DIAGNOSTIC:');
const dbKeys = Object.keys(process.env).filter(k => k.includes('DB') || k === 'DATABASE_URL' || k === 'NODE_ENV');
if (dbKeys.length === 0) {
  console.log('  No DB-related environment variables detected');
} else {
  dbKeys.forEach(k => {
    const v = process.env[k];
    console.log(`  ${k}: ${k.toLowerCase().includes('password') ? maskValue(v) : (v ? v : '❌ NOT SET')}`);
  });
}

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// PostgreSQL Connection Pool
const dbUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const resolvedDbHost = process.env.DB_HOST || dbUrl?.hostname;
const resolvedDbUser = process.env.DB_USER || dbUrl?.username;
const resolvedDbName = process.env.DB_NAME || (dbUrl ? dbUrl.pathname.replace(/^\//, '') : undefined);
const resolvedDbPort = process.env.DB_PORT || dbUrl?.port || '5432';
const resolvedDbPassword = process.env.DB_PASSWORD || (dbUrl?.password ? '***SET***' : undefined);

console.log('🔍 Connection config:');
console.log(`  Host: ${resolvedDbHost}`);
console.log(`  User: ${resolvedDbUser}`);
console.log(`  Database: ${resolvedDbName}`);
console.log(`  Port: ${resolvedDbPort}`);
console.log(`  Password set: ${resolvedDbPassword ? 'YES' : 'NO - THIS IS THE PROBLEM'}`);

const connectionString = process.env.DATABASE_URL || (process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME
  ? `postgresql://${encodeURIComponent(process.env.DB_USER)}:${encodeURIComponent(process.env.DB_PASSWORD || '')}@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME}`
  : null);

if (!connectionString) {
  console.error('❌ No DATABASE_URL or DB_* environment variables found. Set DATABASE_URL or DB_HOST/DB_USER/DB_NAME/DB_PASSWORD.');
  process.exit(1);
}

console.log('🔍 Connecting to:', process.env.DATABASE_URL ? 'DATABASE_URL set' : '❌ DATABASE_URL not set');
console.log(`  Host: ${resolvedDbHost}`);
console.log(`  User: ${resolvedDbUser}`);
console.log(`  DB: ${resolvedDbName}`);
console.log(`  Port: ${resolvedDbPort}`);
console.log(`  Password: ${resolvedDbPassword ? '***SET***' : '❌ NOT SET'}`);

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});
pool.on('connect', () => {
  console.log('✅ Database connected successfully!');
});

pool.on('error', (err) => {
  console.error('❌ Pool error - Code:', err.code, 'Message:', err.message);
});

// TEST ENDPOINT
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend is working!' });
});

// GET ALL CATEGORIES
app.get('/api/categories', async (req, res) => {
  try {
    const query = 'SELECT * FROM categories';
    const result = await pool.query(query);
    res.json({
      success: true,
      categories: result.rows
    });
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET ALL PRODUCTS (NO LIMIT)
app.get('/api/products', async (req, res) => {
  try {
    const query = 'SELECT * FROM products ORDER BY id DESC';
    const result = await pool.query(query);
    
    console.log(`✅ Fetched ${result.rows.length} products from database`);
    console.log('Products by category:');
    
    // Log breakdown by category
    const categoryCounts = {};
    result.rows.forEach(p => {
      categoryCounts[p.category_id] = (categoryCounts[p.category_id] || 0) + 1;
    });
    console.log(categoryCounts);
    
    res.json({
      success: true,
      count: result.rows.length,
      products: result.rows
    });
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET PRODUCTS BY CATEGORY
app.get('/api/products/category/:categoryId', async (req, res) => {
  try {
    const categoryId = req.params.categoryId;
    const query = 'SELECT * FROM products WHERE category_id = $1 ORDER BY id DESC';
    const result = await pool.query(query, [categoryId]);
    
    res.json({
      success: true,
      count: result.rows.length,
      products: result.rows
    });
  } catch (err) {
    console.error('Error fetching products by category:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET SINGLE PRODUCT
app.get('/api/products/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const query = 'SELECT * FROM products WHERE id = $1';
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json({
      success: true,
      product: result.rows[0]
    });
  } catch (err) {
    console.error('Error fetching product:', err);
    res.status(500).json({ error: err.message });
  }
});

// CREATE ORDER
app.post('/api/orders', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { customerName, customerEmail, customerPhone, items, totalAmount } = req.body;
    
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Order must contain items' });
    }
    
    // Start transaction
    await client.query('BEGIN');
    
    const orderQuery = 'INSERT INTO orders (customer_name, customer_email, customer_phone, total_amount, status) VALUES ($1, $2, $3, $4, $5) RETURNING id';
    const orderResult = await client.query(orderQuery, [customerName, customerEmail, customerPhone, totalAmount, 'pending']);
    const orderId = orderResult.rows[0].id;
    
    // Insert order items
    for (let item of items) {
      const itemQuery = 'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)';
      await client.query(itemQuery, [orderId, item.id, item.quantity, item.price]);
    }
    
    // Commit transaction
    await client.query('COMMIT');
    
    res.json({
      success: true,
      orderId: orderId,
      message: 'Order created successfully'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating order:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET ORDERS
app.get('/api/orders/:orderId', async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const query = 'SELECT * FROM orders WHERE id = $1';
    const result = await pool.query(query, [orderId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json({
      success: true,
      order: result.rows[0]
    });
  } catch (err) {
    console.error('Error fetching order:', err);
    res.status(500).json({ error: err.message });
  }
});

// START SERVER
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📡 API: http://localhost:${PORT}/api/products`);
});