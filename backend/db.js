require("dotenv").config();

const mysql = require("mysql2");

const config = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "utility_db",
  // keep the connection alive a bit longer
  connectTimeout: 10000,
  // enable keep-alive on the underlying socket
  enableKeepAlive: true
};

let connection = null;

function createConnection() {
  connection = mysql.createConnection(config);

  connection.connect((err) => {
    if (err) {
      console.error("DB Error on connect:", err);
      // try reconnect after a delay
      setTimeout(createConnection, 2000);
      return;
    }
    console.log("MySQL Connected");
  });

  connection.on("error", (err) => {
    console.error("MySQL connection error:", err);
    // If the connection is lost (server closed it), attempt reconnection
    if (err && (err.code === "PROTOCOL_CONNECTION_LOST" || err.fatal)) {
      try {
        connection.destroy();
      } catch (_) {}
      // attempt to recreate connection after short delay
      setTimeout(createConnection, 2000);
    }
  });

  return connection;
}

createConnection();

// Export a thin wrapper that delegates to the current connection instance
module.exports = {
  query: (...args) => {
    if (!connection) {
      throw new Error("Database not initialized");
    }
    return connection.query(...args);
  },
  beginTransaction: (cb) => {
    if (!connection) return cb(new Error("Database not initialized"));
    return connection.beginTransaction(cb);
  },
  commit: (cb) => {
    if (!connection) return cb(new Error("Database not initialized"));
    return connection.commit(cb);
  },
  rollback: (cb) => {
    if (!connection) return cb(new Error("Database not initialized"));
    return connection.rollback(cb);
  },
  // expose the raw connection for advanced usages if needed
  _getConnection: () => connection
};