const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// PostgreSQL Connection Pool
console.log('🔍 Connection config:');
console.log(`  Host: ${process.env.DB_HOST}`);
console.log(`  User: ${process.env.DB_USER}`);
console.log(`  Database: ${process.env.DB_NAME}`);
console.log(`  Port: ${process.env.DB_PORT}`);
console.log(`  Password set: ${process.env.DB_PASSWORD ? 'YES' : 'NO - THIS IS THE PROBLEM'}`);

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'postgres',
  port: parseInt(process.env.DB_PORT) || 5432,
  ssl: {
    rejectUnauthorized: false
  }
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