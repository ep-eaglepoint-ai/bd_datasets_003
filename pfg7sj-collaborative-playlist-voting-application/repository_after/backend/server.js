const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const playlistRoutes = require('./routes/playlistRoutes');

const app = express();
app.use(cors());
app.use(express.json());

// Init data storage
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'playlists.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ playlists: [] }, null, 2));
}

app.use('/api/playlists', playlistRoutes);

const PORT = 3001;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;