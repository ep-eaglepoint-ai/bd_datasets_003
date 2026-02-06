const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
app.use(bodyParser.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Database setup
const dbPath = path.join(__dirname, 'data', 'auction.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Failed to connect to SQLite', err);
  else console.log('Connected to SQLite');
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      current_price REAL NOT NULL,
      end_time INTEGER NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS bids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER,
      amount REAL,
      user_id TEXT,
      created_at INTEGER,
      FOREIGN KEY(item_id) REFERENCES items(id)
    )
  `);

  // Seed Data
  db.get('SELECT COUNT(*) as count FROM items', (err, row) => {
    if (row && row.count === 0) {
      const now = Date.now();
      db.run('INSERT INTO items (id, name, current_price, end_time) VALUES (?,?,?,?)', [1, 'Test Item Active', 10, now + 60000]);
      db.run('INSERT INTO items (id, name, current_price, end_time) VALUES (?,?,?,?)', [2, 'Expired Item', 10, now - 5000]);
      console.log('Seeded test items');
    }
  });
});

io.on('connection', (socket) => {
  socket.on('JOIN_ITEM', (itemId) => {
    socket.join(`item-${itemId}`);
  });
});

// Bidding Route
app.post('/api/bids/:itemId/bid', (req, res) => {
  const { itemId } = req.params;
  const { amount, userId } = req.body;
  const now = Date.now();
  const bidAmount = Number(amount);

  // Requirement 1: Atomic Locking via BEGIN IMMEDIATE
  db.run('BEGIN IMMEDIATE TRANSACTION', (err) => {
    if (err) return res.status(409).json({ error: 'Database busy' });

    db.get('SELECT * FROM items WHERE id = ?', [itemId], (err, item) => {
      if (err || !item) {
        db.run('ROLLBACK');
        return res.status(404).json({ error: 'Item not found' });
      }

      // Requirement 3 & 9: Server-side validation of time
      if (now > item.end_time) {
        db.run('ROLLBACK');
        return res.status(400).json({ error: 'Auction ended' });
      }

      // Requirement 5 & 7: Validate bid amount
      if (bidAmount <= item.current_price) {
        db.run('ROLLBACK');
        return res.status(409).json({ error: 'Outbid' });
      }

      // Requirement 2: Soft Close Logic (Remaining < 60s)
      let newEndTime = item.end_time;
      const remaining = item.end_time - now;
      const isSoftClose = remaining < 60000;

      if (isSoftClose) {
        newEndTime = now + 60000; // Extend to 60s from now
      }

      // Requirement 8: Update and Insert in same transaction
      db.run(
        'UPDATE items SET current_price = ?, end_time = ? WHERE id = ?',
        [bidAmount, newEndTime, itemId],
        function (err) {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: 'Update failed' });
          }

          db.run(
            'INSERT INTO bids (item_id, amount, user_id, created_at) VALUES (?,?,?,?)',
            [itemId, bidAmount, userId, now],
            function (err) {
              db.run('COMMIT', (commitErr) => {
                if (commitErr) {
                  db.run('ROLLBACK');
                  return res.status(500).json({ error: 'Commit failed' });
                }

                // Requirement 6: Real-time update to all clients
                io.emit('NEW_BID', {
                  itemId: itemId.toString(),
                  amount: bidAmount,
                  userId,
                  end_time: newEndTime,
                  endTime: newEndTime
                });

                // Requirement 2 & 4: Timer Synchronization event
                if (isSoftClose) {
                  io.emit('TIMER_UPDATE', {
                    itemId: itemId.toString(),
                    end_time: newEndTime,
                    endTime: newEndTime
                  });
                }

                return res.json({ success: true });
              });
            }
          );
        }
      );
    });
  });
});

app.get('/api/items/:itemId', (req, res) => {
  const { itemId } = req.params;
  db.get('SELECT * FROM items WHERE id = ?', [itemId], (err, item) => {
    if (err || !item) return res.status(404).json({ error: 'Item not found' });
    db.all('SELECT * FROM bids WHERE item_id = ? ORDER BY created_at DESC', [itemId], (err, bids) => {
      res.json({ item, bids });
    });
  });
});

server.listen(4000, () => {
  console.log('Backend running on port 4000');
});