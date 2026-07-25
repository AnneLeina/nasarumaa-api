const mysql = require('mysql2');
const dotenv = require('dotenv');

dotenv.config();

const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'nasarumaa_collection'
});

db.connect((error) => {
  if (error) {
    console.error(' Database connection error:', error);
    setTimeout(() => {
      db.connect();
    }, 2000);
  } else {
    console.log(' Connected to MySQL Database');
  }
});

module.exports = db;