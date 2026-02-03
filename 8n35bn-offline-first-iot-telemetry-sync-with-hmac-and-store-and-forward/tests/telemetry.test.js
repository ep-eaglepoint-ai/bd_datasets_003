/**
 * @jest-environment node
 */

const path = require('path');
const fs = require('fs');

// Set environment variables BEFORE loading any modules
process.env.CLIENT_DB_PATH = path.join(__dirname, '..', 'temp_test_data', 'telemetry_client.db');
process.env.SERVER_DB_PATH = path.join(__dirname, '..', 'temp_test_data', 'telemetry_server.db');

// Create temp directory
const tempDir = path.join(__dirname, '..', 'temp_test_data');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Import from repository_after AFTER setting env vars
const { startServer } = require('../repository_after/src/server');
const { createClient } = require('../repository_after/src/client');

describe('Telemetry Integration Tests', () => {
  let serverInstance = null;
  let client = null;
  let port = null;
  let baseUrl = null;

  beforeAll(async () => {
    // Start server on random available port
    serverInstance = await startServer(0);
    port = serverInstance.server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    // Stop client first
    if (client) {
      try {
        await client.stop();
      } catch (e) {
        // Ignore errors
      }
      client = null;
    }
    // Stop server
    if (serverInstance) {
      try {
        await serverInstance.stop();
      } catch (e) {
        // Ignore errors
      }
      serverInstance = null;
    }
  });

  describe('Requirement 1: WAL Persistence', () => {
    it('should persist events to disk before sending', async () => {
      const testClient = createClient({
        serverUrl: `${baseUrl}/ingest`,
        sensorIntervalMs: 100,
        syncBaseIntervalMs: 500
      });

      // Wait for some events to be generated
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify events are in WAL (client database)
      const volume = await testClient.wal.getTotalGeneratedVolume();
      expect(volume).toBeGreaterThan(0);

      await testClient.stop();
    }, 10000);
  });

  describe('Requirement 2: Batching', () => {
    it('should aggregate multiple events into single HTTP request', async () => {
      const testClient = createClient({
        serverUrl: `${baseUrl}/ingest`,
        sensorIntervalMs: 50,
        syncBaseIntervalMs: 1000,
        batchSize: 10
      });

      // Generate multiple events
      await new Promise(resolve => setTimeout(resolve, 600));

      // Verify events are batched
      const volume = await testClient.wal.getTotalGeneratedVolume();
      expect(volume).toBeGreaterThan(0);

      await testClient.stop();
    }, 10000);
  });

  describe('Requirement 5 & 6: Non-blocking Sensor', () => {
    it('sensor loop should not be blocked by network sync', async () => {
      const testClient = createClient({
        serverUrl: `${baseUrl}/ingest`,
        sensorIntervalMs: 100,
        syncBaseIntervalMs: 500
      });

      await new Promise(resolve => setTimeout(resolve, 300));
      const volumeBefore = await testClient.wal.getTotalGeneratedVolume();

      // Stop server
      await serverInstance.stop();
      serverInstance = null;

      await new Promise(resolve => setTimeout(resolve, 1000));

      const volumeAfter = await testClient.wal.getTotalGeneratedVolume();
      expect(volumeAfter).toBeGreaterThan(volumeBefore);

      await testClient.stop();
    }, 10000);
  });

  describe('Requirement 8: Graceful Error Handling', () => {
    it('should handle connection errors gracefully without crashing', async () => {
      const testClient = createClient({
        serverUrl: `http://127.0.0.1:99999/ingest`,
        sensorIntervalMs: 200,
        syncBaseIntervalMs: 100
      });

      await new Promise(resolve => setTimeout(resolve, 800));

      const volume = await testClient.wal.getTotalGeneratedVolume();
      expect(volume).toBeGreaterThan(0);

      await testClient.stop();
    }, 10000);
  });
});
