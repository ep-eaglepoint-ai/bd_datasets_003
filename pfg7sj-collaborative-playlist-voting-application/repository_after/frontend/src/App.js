import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const API_BASE = 'http://localhost:3001/api/playlists';

const getOrGenerateUserId = () => {
  let id = localStorage.getItem('playlist_user_id');

  if (!id || !/^[A-Za-z0-9]{8}$/.test(id)) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    id = '';
    for (let i = 0; i < 8; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    localStorage.setItem('playlist_user_id', id);
  }

  return id;
};


function App() {
  const [userId] = useState(getOrGenerateUserId());
  const [playlist, setPlaylist] = useState(null);
  const [queue, setQueue] = useState([]);
  const [playlistName, setPlaylistName] = useState('');
  const [playlistIdInput, setPlaylistIdInput] = useState('');
  const [songForm, setSongForm] = useState({ title: '', artist: '', duration: '' });
  const [stats, setStats] = useState({ totalSongs: 0, totalDuration: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const formatDuration = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const validatePlaylistName = (name) => name && name.length <= 100;
  const validateSong = (song) =>
    song.title && song.title.length <= 200 &&
    song.artist && song.artist.length <= 100 &&
    song.duration > 0;

  const createPlaylist = async (e) => {
    e.preventDefault();
    setError('');
    if (!validatePlaylistName(playlistName)) {
      setError('Playlist name must be non-empty and ≤100 chars.');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(API_BASE, { name: playlistName });
      setPlaylist(res.data);
      fetchQueue(res.data.id);
      fetchStats(res.data.id);
      setPlaylistName('');
    } catch { setError('Error creating playlist.'); }
    finally { setLoading(false); }
  };

  const joinPlaylist = async (e) => {
    e.preventDefault();
    setError('');
    if (!playlistIdInput) { setError('Enter a playlist ID.'); return; }
    setLoading(true);
    try {
      const queueRes = await axios.get(`${API_BASE}/${playlistIdInput}/queue`);
      const statsRes = await axios.get(`${API_BASE}/${playlistIdInput}/stats`);
      setPlaylist({ id: playlistIdInput, name: 'Joined Playlist' });
      setQueue(queueRes.data);
      setStats(statsRes.data);
      setPlaylistIdInput('');
    } catch { setError('Playlist not found.'); }
    finally { setLoading(false); }
  };

  const addSong = async (e) => {
    e.preventDefault();
    setError('');
    const duration = parseInt(songForm.duration);
    if (!validateSong({ ...songForm, duration })) {
      setError('Invalid song. Check title, artist length, and duration > 0.');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/${playlist.id}/songs`, { ...songForm, duration });
      setSongForm({ title: '', artist: '', duration: '' });
      fetchQueue();
      fetchStats();
    } catch { setError('Error adding song.'); }
    finally { setLoading(false); }
  };

  const handleVote = async (songId, direction) => {
    setError('');
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/${playlist.id}/songs/${songId}/vote`, { userId, direction });
      fetchQueue();
      fetchStats();
    } catch { setError('Vote failed.'); }
    finally { setLoading(false); }
  };

  const removeSong = async (songId) => {
    setError('');
    setLoading(true);
    try {
      await axios.delete(`${API_BASE}/${playlist.id}/songs/${songId}`);
      fetchQueue();
      fetchStats();
    } catch { setError('Failed to remove song.'); }
    finally { setLoading(false); }
  };

  const fetchQueue = async (plId = playlist?.id) => {
    if (!plId) return;
    try { const res = await axios.get(`${API_BASE}/${plId}/queue`); setQueue(res.data); }
    catch { setError('Failed to fetch queue.'); }
  };

  const fetchStats = async (plId = playlist?.id) => {
    if (!plId) return;
    try { const res = await axios.get(`${API_BASE}/${plId}/stats`); setStats(res.data); }
    catch { setError('Failed to fetch stats.'); }
  };

  useEffect(() => {
    const interval = setInterval(fetchQueue, 3000);
    return () => clearInterval(interval);
  }, [playlist]);

  if (!playlist) {
    return (
      <div className="container">
        <h1>🎧 Collaborative Queue</h1>
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={createPlaylist}>
          <input
            value={playlistName}
            onChange={(e) => setPlaylistName(e.target.value)}
            placeholder="Enter Playlist Name"
          />
          <button type="submit" className="create" disabled={loading}>Create</button>
        </form>

        <form onSubmit={joinPlaylist}>
          <input
            value={playlistIdInput}
            onChange={(e) => setPlaylistIdInput(e.target.value)}
            placeholder="Enter Playlist ID to Join"
          />
          <button type="submit" className="join" disabled={loading}>Join</button>
        </form>
      </div>
    );
  }

  return (
    <div className="container">
      <h2>Playlist: {playlist.name} <small>(ID: {playlist.id})</small></h2>
      <p>Voting as User: <code>{userId}</code></p>
      {error && <div className="error-message">{error}</div>}

      <form onSubmit={addSong}>
        <input placeholder="Title" value={songForm.title} onChange={e => setSongForm({ ...songForm, title: e.target.value })} required />
        <input placeholder="Artist" value={songForm.artist} onChange={e => setSongForm({ ...songForm, artist: e.target.value })} required />
        <input placeholder="Duration (sec)" type="number" value={songForm.duration} onChange={e => setSongForm({ ...songForm, duration: e.target.value })} required />
        <button type="submit" className="add" disabled={loading}>Add Song</button>
      </form>

      <div style={{ marginBottom: '20px' }}>
        <strong>Total Songs:</strong> {stats.totalSongs} | <strong>Total Duration:</strong> {formatDuration(stats.totalDuration)}
      </div>

      <h3>The Queue (Sorted by Votes)</h3>
      <div>
        {queue.map(song => (
          <div key={song.id} className="queue-item">
            <div className="song-info">
              <strong>{song.title}</strong> by {song.artist}
              <div className="song-score">Score: {song.score} | {formatDuration(song.duration)}</div>
            </div>
            <div>
              <button onClick={() => handleVote(song.id, 'up')} className="vote-up" disabled={loading}>
                ▲ Up
              </button>
              <button onClick={() => handleVote(song.id, 'down')} className="vote-down" disabled={loading}>
                ▼ Down
              </button>
              <button onClick={() => removeSong(song.id)} className="remove" disabled={loading}>Remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
