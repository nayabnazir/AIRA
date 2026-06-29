const mysql = require("mysql2");

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 5000,
  ssl: {
    rejectUnauthorized: false
  }
});

db.getConnection((err, connection) => {
  if (err) {
    console.log("DB Error:", {
      code: err.code,
      errno: err.errno,
      sqlState: err.sqlState,
      message: err.message || err.sqlMessage || String(err)
    });
  } else {
    console.log("Database Connected");
    connection.release();
  }
});

module.exports = db;