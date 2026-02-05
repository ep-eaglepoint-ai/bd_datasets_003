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
        db.run('BEGIN TRANSACTION', (beginErr) => {
          if (beginErr) {
            return reject(beginErr);
          }

          const insertStmt = db.prepare(
            'INSERT OR IGNORE INTO processed_events (id, timestamp, volume) VALUES (?, ?, ?)'
          );

          let insertedCount = 0;
          let addedVolume = 0;
          let completedInserts = 0;
          let hasError = false;

          // Process all inserts sequentially within the transaction
          function processNextInsert(index) {
            if (hasError || index >= events.length) {
              // All inserts processed, finalize and commit
              insertStmt.finalize((finalizeErr) => {
                if (hasError || finalizeErr) {
                  db.run('ROLLBACK', () => {
                    reject(finalizeErr || new Error('Insert failed'));
                  });
                  return;
                }

                // Update stats only after all inserts are confirmed complete
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
              });
              return;
            }

            const ev = events[index];
            insertStmt.run([ev.id, ev.timestamp, ev.volume], function (err) {
              if (err) {
                hasError = true;
                insertStmt.finalize(() => {
                  db.run('ROLLBACK', () => reject(err));
                });
                return;
              }

              // Check if this was a new insert (not ignored due to duplicate)
              // We need to check changes property to see if row was actually inserted
              if (this.changes > 0 && !existing.has(ev.id)) {
                insertedCount += 1;
                addedVolume += ev.volume;
              }

              completedInserts++;
              // Process next insert
              processNextInsert(index + 1);
            });
          }

          // Start processing inserts
          processNextInsert(0);
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


