const sqlite3 = require('sqlite3').verbose();
const { clientDbPath } = require('../config');

function createClientWal() {
  const db = new sqlite3.Database(clientDbPath);

  db.serialize(() => {
    db.run(
      `CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        volume REAL NOT NULL,
        sent INTEGER NOT NULL DEFAULT 0
      )`
    );
  });

  function appendEvent(event) {
    return new Promise((resolve, reject) => {
      const stmt = db.prepare(
        'INSERT INTO events (id, timestamp, volume, sent) VALUES (?, ?, ?, 0)'
      );
      stmt.run([event.id, event.timestamp, event.volume], (err) => {
        stmt.finalize();
        if (err) return reject(err);
        resolve();
      });
    });
  }

  function getNextBatch(limit) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT id, timestamp, volume FROM events WHERE sent = 0 ORDER BY timestamp ASC LIMIT ?',
        [limit],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        }
      );
    });
  }

  function markEventsSent(ids) {
    if (!ids.length) return Promise.resolve();
    const placeholders = ids.map(() => '?').join(',');
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE events SET sent = 1 WHERE id IN (${placeholders})`,
        ids,
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  }

  function getTotalGeneratedVolume() {
    return new Promise((resolve, reject) => {
      db.get('SELECT COALESCE(SUM(volume), 0) AS total FROM events', [], (err, row) => {
        if (err) return reject(err);
        resolve(row.total || 0);
      });
    });
  }

  function close() {
    return new Promise((resolve, reject) => {
      db.close((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  return {
    appendEvent,
    getNextBatch,
    markEventsSent,
    getTotalGeneratedVolume,
    close
  };
}

module.exports = {
  createClientWal
};


