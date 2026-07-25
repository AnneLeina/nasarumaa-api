const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MySQL Connection
const connection = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'nasarumaa_collection'
});

connection.connect((err) => {
  if (err) {
    console.error('Database connection failed:', err.message);
    return;
  }
  console.log('✅ Database connected successfully!');
});

// TEST ENDPOINT
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend is working!' });
});

// GET ALL CATEGORIES
app.get('/api/categories', (req, res) => {
  const query = 'SELECT * FROM categories';
  connection.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching categories:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json({
      success: true,
      categories: results
    });
  });
});

// GET ALL PRODUCTS (NO LIMIT)
app.get('/api/products', (req, res) => {
  const query = 'SELECT * FROM products ORDER BY id DESC';
  
  connection.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching products:', err);
      return res.status(500).json({ error: err.message });
    }
    
    console.log(`📦 Fetched ${results.length} products from database`);
    console.log('Products by category:');
    
    // Log breakdown by category
    const categoryCounts = {};
    results.forEach(p => {
      categoryCounts[p.category_id] = (categoryCounts[p.category_id] || 0) + 1;
    });
    console.log(categoryCounts);
    
    res.json({
      success: true,
      count: results.length,
      products: results
    });
  });
});

// GET PRODUCTS BY CATEGORY
app.get('/api/products/category/:categoryId', (req, res) => {
  const categoryId = req.params.categoryId;
  const query = 'SELECT * FROM products WHERE category_id = ? ORDER BY id DESC';
  
  connection.query(query, [categoryId], (err, results) => {
    if (err) {
      console.error('Error fetching products by category:', err);
      return res.status(500).json({ error: err.message });
    }
    
    res.json({
      success: true,
      count: results.length,
      products: results
    });
  });
});

// GET SINGLE PRODUCT
app.get('/api/products/:id', (req, res) => {
  const id = req.params.id;
  const query = 'SELECT * FROM products WHERE id = ?';
  
  connection.query(query, [id], (err, results) => {
    if (err) {
      console.error('Error fetching product:', err);
      return res.status(500).json({ error: err.message });
    }
    
    if (results.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json({
      success: true,
      product: results[0]
    });
  });
});

// CREATE ORDER
app.post('/api/orders', (req, res) => {
  const { customerName, customerEmail, customerPhone, items, totalAmount } = req.body;
  
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Order must contain items' });
  }
  
  const orderQuery = 'INSERT INTO orders (customer_name, customer_email, customer_phone, total_amount, status) VALUES (?, ?, ?, ?, ?)';
  
  connection.query(orderQuery, [customerName, customerEmail, customerPhone, totalAmount, 'pending'], (err, orderResult) => {
    if (err) {
      console.error('Error creating order:', err);
      return res.status(500).json({ error: err.message });
    }
    
    const orderId = orderResult.insertId;
    
    // Insert order items
    const itemsQuery = 'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ?';
    const itemValues = items.map(item => [orderId, item.id, item.quantity, item.price]);
    
    connection.query(itemsQuery, [itemValues], (err) => {
      if (err) {
        console.error('Error creating order items:', err);
        return res.status(500).json({ error: err.message });
      }
      
      res.json({
        success: true,
        orderId: orderId,
        message: 'Order created successfully'
      });
    });
  });
});

// GET ORDERS
app.get('/api/orders/:orderId', (req, res) => {
  const orderId = req.params.orderId;
  const query = 'SELECT * FROM orders WHERE id = ?';
  
  connection.query(query, [orderId], (err, results) => {
    if (err) {
      console.error('Error fetching order:', err);
      return res.status(500).json({ error: err.message });
    }
    
    if (results.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json({
      success: true,
      order: results[0]
    });
  });
});

// START SERVER
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 API: http://localhost:${PORT}/api/products`);
});