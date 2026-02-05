const sqlite3 = require('sqlite3').verbose();
const { clientDbPath } = require('../config');

function createClientWal() {
  const db = new sqlite3.Database(clientDbPath);

  // Queue for serializing database operations to ensure thread-safe concurrent access
  let operationQueue = [];
  let isProcessing = false;
  let isClosed = false;
  let isInitialized = false;

  // Initialize database with WAL mode and busy timeout
  // This must complete before any other operations
  function initializeDatabase() {
    return new Promise((resolve, reject) => {
      if (isInitialized) {
        resolve();
        return;
      }
      
      if (isClosed) {
        reject(new Error('Database is closed'));
        return;
      }
      
      db.serialize(() => {
        // Enable WAL mode for better concurrency (allows multiple readers and one writer)
        db.run('PRAGMA journal_mode = WAL', (err) => {
          if (err) {
            if (err.code === 'SQLITE_MISUSE' || isClosed) {
              reject(new Error('Database is closed'));
            } else {
              reject(err);
            }
            return;
          }
          
          if (isClosed) {
            reject(new Error('Database is closed'));
            return;
          }
          
          // Set busy timeout to wait up to 5 seconds for locks
          db.run('PRAGMA busy_timeout = 5000', (err2) => {
            if (err2) {
              if (err2.code === 'SQLITE_MISUSE' || isClosed) {
                reject(new Error('Database is closed'));
              } else {
                reject(err2);
              }
              return;
            }
            
            if (isClosed) {
              reject(new Error('Database is closed'));
              return;
            }
            
            // Create table
            db.run(
              `CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                timestamp INTEGER NOT NULL,
                volume REAL NOT NULL,
                sent INTEGER NOT NULL DEFAULT 0
              )`,
              (err3) => {
                if (err3) {
                  if (err3.code === 'SQLITE_MISUSE' || isClosed) {
                    reject(new Error('Database is closed'));
                  } else {
                    reject(err3);
                  }
                  return;
                }
                
                if (isClosed) {
                  reject(new Error('Database is closed'));
                  return;
                }
                
                isInitialized = true;
                resolve();
              }
            );
          });
        });
      });
    });
  }

  // Serialize all database operations to prevent concurrent access issues
  function queueOperation(operation) {
    return new Promise((resolve, reject) => {
      if (isClosed) {
        reject(new Error('Database is closed'));
        return;
      }
      
      // Ensure database is initialized before queuing operations
      initPromise
        .then(() => {
          if (isClosed) {
            reject(new Error('Database is closed'));
            return;
          }
          operationQueue.push({ operation, resolve, reject });
          processQueue();
        })
        .catch(reject);
    });
  }

  async function processQueue() {
    if (isProcessing || operationQueue.length === 0) {
      return;
    }

    isProcessing = true;
    while (operationQueue.length > 0) {
      const { operation, resolve, reject } = operationQueue.shift();
      try {
        const result = await operation();
        resolve(result);
      } catch (err) {
        // Retry SQLITE_BUSY errors once (busy_timeout should handle most cases)
        if (err && err.code === 'SQLITE_BUSY') {
          // Wait a bit and retry once
          await new Promise(r => setTimeout(r, 50));
          try {
            const retryResult = await operation();
            resolve(retryResult);
          } catch (retryErr) {
            reject(retryErr);
          }
        } else {
          reject(err);
        }
      }
    }
    isProcessing = false;
  }

  // Store initialization promise to ensure it completes before operations
  let initPromise = initializeDatabase().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to initialize database:', err);
    throw err; // Re-throw to prevent operations from proceeding with uninitialized DB
  });

  function appendEvent(event) {
    return queueOperation(() => {
      return new Promise((resolve, reject) => {
        // Operations are already serialized by queue, no need for nested serialize()
        const stmt = db.prepare(
          'INSERT INTO events (id, timestamp, volume, sent) VALUES (?, ?, ?, 0)'
        );
        stmt.run([event.id, event.timestamp, event.volume], (err) => {
          stmt.finalize();
          if (err) return reject(err);
          resolve();
        });
      });
    });
  }

  function getNextBatch(limit) {
    return queueOperation(() => {
      return new Promise((resolve, reject) => {
        // Operations are already serialized by queue, no need for nested serialize()
        db.all(
          'SELECT id, timestamp, volume FROM events WHERE sent = 0 ORDER BY timestamp ASC LIMIT ?',
          [limit],
          (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
          }
        );
      });
    });
  }

  function markEventsSent(ids) {
    if (!ids.length) return Promise.resolve();
    return queueOperation(() => {
      const placeholders = ids.map(() => '?').join(',');
      return new Promise((resolve, reject) => {
        // Operations are already serialized by queue, no need for nested serialize()
        db.run(
          `UPDATE events SET sent = 1 WHERE id IN (${placeholders})`,
          ids,
          (err) => {
            if (err) return reject(err);
            resolve();
          }
        );
      });
    });
  }

  function getTotalGeneratedVolume() {
    return queueOperation(() => {
      return new Promise((resolve, reject) => {
        // Operations are already serialized by queue, no need for nested serialize()
        db.get('SELECT COALESCE(SUM(volume), 0) AS total FROM events', [], (err, row) => {
          if (err) return reject(err);
          resolve(row.total || 0);
        });
      });
    });
  }

  function getUnsentEventCount() {
    return queueOperation(() => {
      return new Promise((resolve, reject) => {
        // Operations are already serialized by queue, no need for nested serialize()
        db.get('SELECT COUNT(*) AS count FROM events WHERE sent = 0', [], (err, row) => {
          if (err) return reject(err);
          resolve(row ? row.count : 0);
        });
      });
    });
  }

  async function close() {
    // Mark as closed to prevent new operations
    isClosed = true;
    
    // Wait for initialization to complete (or fail)
    try {
      await initPromise;
    } catch (err) {
      // Ignore initialization errors during close
    }
    
    // Wait for all queued operations to complete
    while (isProcessing || operationQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
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
    getUnsentEventCount,
    close
  };
}

module.exports = {
  createClientWal
};


