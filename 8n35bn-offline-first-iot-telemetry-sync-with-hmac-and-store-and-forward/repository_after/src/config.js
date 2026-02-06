const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

module.exports = {
  stationId: 'station-001',
  sensorIntervalMs: 100,
  syncBaseIntervalMs: 500,
  syncMaxBackoffMs: 30_000,
  batchSize: 50,
  serverPort: 3000,
  serverBaseUrl: process.env.SERVER_BASE_URL || 'http://127.0.0.1:3000',
  hmacSecret: process.env.HMAC_SECRET || 'test_shared_secret',
  hmacSignatureHeader: 'X-Signature',
  hmacTimestampHeader: 'X-Timestamp',
  replayWindowMs: 5 * 60 * 1000,
  // Support environment variable overrides for testing
  clientDbPath: process.env.CLIENT_DB_PATH || path.join(ROOT_DIR, 'client_wal.db'),
  serverDbPath: process.env.SERVER_DB_PATH || path.join(ROOT_DIR, 'server.db')
};
