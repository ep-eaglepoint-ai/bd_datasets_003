const sqlite3 = require('sqlite3').verbose();
const { serverDbPath } = require('../config');

function createServerDb() {
  const db = new sqlite3.Database(serverDbPath);

  db.serialize(() => {
    db.run(
      `CREATE TABLE IF NOT EXISTS processed_events (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        volume REAL NOT NULL
      )`
    );
    db.run(
      `CREATE TABLE IF NOT EXISTS stats (
        key TEXT PRIMARY KEY,
        value REAL NOT NULL
      )`
    );
    db.run(
      `INSERT OR IGNORE INTO stats (key, value) VALUES ('total_volume', 0)`
    );
  });

  function getExistingIds(ids) {
    if (!ids.length) return Promise.resolve(new Set());
    const placeholders = ids.map(() => '?').join(',');
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT id FROM processed_events WHERE id IN (${placeholders})`,
        ids,
        (err, rows) => {
          if (err) return reject(err);
          const set = new Set((rows || []).map((r) => r.id));
          resolve(set);
        }
      );
    });
  }

  async function recordEvents(events) {
    if (!events.length) {
      return { insertedCount: 0, addedVolume: 0 };
    }

    const ids = events.map((e) => e.id);
    const existing = await getExistingIds(ids);

    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        let insertedCount = 0;
        let addedVolume = 0;

        const insertStmt = db.prepare(
          'INSERT OR IGNORE INTO processed_events (id, timestamp, volume) VALUES (?, ?, ?)'
        );

        // Track all insert callbacks
        const insertPromises = events.map((ev) => {
          return new Promise((innerResolve) => {
            insertStmt.run(
              [ev.id, ev.timestamp, ev.volume],
              function (err) {
                if (err) {
                  innerResolve({ success: false, error: err });
                  return;
                }
                if (!existing.has(ev.id)) {
                  insertedCount += 1;
                  addedVolume += ev.volume;
                }
                innerResolve({ success: true });
              }
            );
          });
        });

        insertStmt.finalize((err) => {
          if (err) {
            db.run('ROLLBACK', () => reject(err));
            return;
          }

          // Wait for all inserts to complete
          Promise.all(insertPromises)
            .then((results) => {
              const failedInsert = results.find((r) => !r.success);
              if (failedInsert) {
                db.run('ROLLBACK', () => reject(failedInsert.error));
                return;
              }

              db.run(
                'UPDATE stats SET value = value + ? WHERE key = ?',
                [addedVolume, 'total_volume'],
                (updateErr) => {
                  if (updateErr) {
                    db.run('ROLLBACK', () => reject(updateErr));
                    return;
                  }
                  db.run('COMMIT', (commitErr) => {
                    if (commitErr) {
                      reject(commitErr);
                    } else {
                      resolve({ insertedCount, addedVolume });
                    }
                  });
                }
              );
            })
            .catch((batchErr) => {
              db.run('ROLLBACK', () => reject(batchErr));
            });
        });
      });
    });
  }

  function getTotalVolume() {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT value AS total FROM stats WHERE key = ?',
        ['total_volume'],
        (err, row) => {
          if (err) return reject(err);
          resolve(row ? row.total : 0);
        }
      );
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
    recordEvents,
    getTotalVolume,
    close
  };
}

module.exports = {
  createServerDb
};


