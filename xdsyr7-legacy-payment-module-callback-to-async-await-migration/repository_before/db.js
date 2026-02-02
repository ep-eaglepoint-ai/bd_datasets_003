var mysql = require('mysql');

var pool = mysql.createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'payments'
});

function getConnection(callback) {
  pool.getConnection(function(err, connection) {
    if (err) {
      callback(err, null);
      return;
    }
    callback(null, connection);
  });
}

function query(sql, params, callback) {
  pool.query(sql, params, function(err, results) {
    if (err) {
      callback(err, null);
      return;
    }
    callback(null, results);
  });
}

module.exports = {
  pool: pool,
  getConnection: getConnection,
  query: query
};
