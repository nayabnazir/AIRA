const mysql = require("mysql2");

const db = mysql.createPool({
  host: "127.0.0.1",
  user: "root",
  password: "",
  database: "aira_db",
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 5000
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
