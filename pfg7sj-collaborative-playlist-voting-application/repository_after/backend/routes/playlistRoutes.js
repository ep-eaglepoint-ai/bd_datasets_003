const express = require('express');
const fs = require('fs');
const path = require('path');
const { generateId, manualSort, isValidId } = require('../utils/helpers');

const router = express.Router();
const DATA_FILE = path.join(__dirname, '../data/playlists.json');

const readData = () => {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return raw ? JSON.parse(raw) : { playlists: [] };
  } catch {
    return { playlists: [] };
  }
};

const writeData = (data) => {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
};

// CREATE PLAYLIST
router.post('/', (req, res) => {
  const { name } = req.body;

  if (!name || typeof name !== 'string' || name.length > 100) {
    return res.status(400).json({ error: 'Invalid playlist name' });
  }

  const data = readData();
  const existingIds = new Set(data.playlists.map(p => p.id));

  const playlist = {
    id: generateId(existingIds),
    name,
    songs: []
  };

  data.playlists.push(playlist);
  writeData(data);

  res.status(201).json(playlist);
});

// ADD SONG
router.post('/:playlistId/songs', (req, res) => {
  const { playlistId } = req.params;

  if (!/^[a-zA-Z0-9]{8}$/.test(playlistId)) {
    return res.status(400).json({ error: 'Invalid playlist ID format' });
  }

  const { title, artist, duration } = req.body;

  if (!title || title.length > 200) return res.status(400).json({ error: 'Invalid title' });
  if (!artist || artist.length > 100) return res.status(400).json({ error: 'Invalid artist' });
  if (!Number.isInteger(duration) || duration <= 0)
    return res.status(400).json({ error: 'Invalid duration' });

  const data = readData();
  const playlist = data.playlists.find(p => p.id === playlistId);
  if (!playlist) return res.status(404).json({ error: 'Playlist not found' });

  const existingSongIds = new Set(playlist.songs.map(s => s.id));

  const song = {
    id: generateId(existingSongIds),
    title,
    artist,
    duration,
    score: 0,
    addedAt: Date.now(),
    votes: {}
  };

  playlist.songs.push(song);
  // sort playlist after adding
  playlist.songs = manualSort(playlist.songs);

  writeData(data);

  res.status(201).json(song);
});

// VOTE
router.post('/:playlistId/songs/:songId/vote', (req, res) => {
  const { playlistId, songId } = req.params;

  if (!/^[a-zA-Z0-9]{8}$/.test(playlistId)) {
    return res.status(400).json({ error: 'Invalid playlist ID format' });
  }
  if (!/^[a-zA-Z0-9]{8}$/.test(songId)) {
    return res.status(400).json({ error: 'Invalid song ID format' });
  }

  const { userId, direction } = req.body;

  if (!isValidId(userId))
    return res.status(400).json({ error: 'Invalid userId' });

  if (!['up', 'down'].includes(direction))
    return res.status(400).json({ error: 'Invalid direction' });

  const data = readData();
  const playlist = data.playlists.find(p => p.id === playlistId);
  if (!playlist) return res.status(404).json({ error: 'Playlist not found' });

  const song = playlist.songs.find(s => s.id === songId);
  if (!song) return res.status(404).json({ error: 'Song not found' });

  // update vote
  song.votes[userId] = direction;

  const values = Object.values(song.votes);
  const up = values.filter(v => v === 'up').length;
  const down = values.filter(v => v === 'down').length;
  song.score = up - down;

  // sort playlist after vote
  playlist.songs = manualSort(playlist.songs);

  writeData(data);
  res.json({ songId: song.id, score: song.score });
});

// QUEUE
router.get('/:playlistId/queue', (req, res) => {
  const { playlistId } = req.params;

  if (!/^[a-zA-Z0-9]{8}$/.test(playlistId)) {
    return res.status(400).json({ error: 'Invalid playlist ID format' });
  }

  const data = readData();
  const playlist = data.playlists.find(p => p.id === playlistId);
  if (!playlist) return res.status(404).json({ error: 'Playlist not found' });

  res.json(manualSort(playlist.songs));
});

// DELETE SONG
router.delete('/:playlistId/songs/:songId', (req, res) => {
  const { playlistId, songId } = req.params;

  if (!/^[a-zA-Z0-9]{8}$/.test(playlistId)) {
    return res.status(400).json({ error: 'Invalid playlist ID format' });
  }

  const data = readData();
  const playlist = data.playlists.find(p => p.id === playlistId);
  if (!playlist) return res.status(404).json({ error: 'Playlist not found' });

  const count = playlist.songs.length;
  playlist.songs = playlist.songs.filter(s => s.id !== songId);

  if (playlist.songs.length === count) {
    return res.status(404).json({ error: 'Song not found' });
  }

  // sort after removal
  playlist.songs = manualSort(playlist.songs);

  writeData(data);
  res.json({ message: 'Song removed' });
});


// STATS
router.get('/:playlistId/stats', (req, res) => {
  const { playlistId } = req.params;

  if (!/^[a-zA-Z0-9]{8}$/.test(playlistId)) {
    return res.status(400).json({ error: 'Invalid playlist ID format' });
  }

  const data = readData();
  const playlist = data.playlists.find(p => p.id === playlistId);
  if (!playlist) return res.status(404).json({ error: 'Playlist not found' });

  let upVotes = 0;
  let downVotes = 0;
  let totalDuration = 0;

  playlist.songs.forEach(song => {
    totalDuration += song.duration;
    Object.values(song.votes).forEach(v => {
      if (v === 'up') upVotes++;
      if (v === 'down') downVotes++;
    });
  });

  res.json({
    playlistId: playlist.id,
    name: playlist.name,
    totalSongs: playlist.songs.length,
    totalVotes: upVotes + downVotes,
    upVotes,
    downVotes,
    totalDuration,
    averageDuration: playlist.songs.length
      ? Math.floor(totalDuration / playlist.songs.length)
      : 0
  });
});

module.exports = router;