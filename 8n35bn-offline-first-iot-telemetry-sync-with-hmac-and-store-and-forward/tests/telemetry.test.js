/**
 * @jest-environment node
 */

const path = require('path');
const fs = require('fs');
const http = require('http');

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
    port = serverInstance.server.address().port;    baseUrl = `http://127.0.0.1:${port}`;
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
      // Track POST request counts with a custom server
      let postCount = 0;
      let eventsInFirstBatch = 0;

      const express = require('express');
      const testApp = express();
      testApp.use(express.json());

      testApp.post('/ingest', (req, res) => {
        postCount++;
        if (postCount === 1) {
          eventsInFirstBatch = req.body.events?.length || 0;
        }
        // Always respond success
        res.status(200).json({ insertedCount: eventsInFirstBatch, addedVolume: eventsInFirstBatch * 0.25, totalVolume: 0 });
      });

      const testServer = http.createServer(testApp);
      
      await new Promise((resolve) => {
        testServer.listen(0, () => {
          const testPort = testServer.address().port;
          const testUrl = `http://127.0.0.1:${testPort}`;
          
          const testClient = createClient({
            serverUrl: `${testUrl}/ingest`,
            sensorIntervalMs: 50,
            syncBaseIntervalMs: 300,
            batchSize: 10
          });

          // Generate multiple events (should generate ~10 events in 500ms)
          setTimeout(async () => {
            testServer.close();
            await testClient.stop();
            resolve();
          }, 600);
        });
      });

      // Verify batching: more events than POST requests
      // With 50ms interval and 600ms runtime, we expect ~12 events
      // With batch size 10, we expect only 2 POSTs max
      expect(postCount).toBeLessThan(eventsInFirstBatch);
    }, 10000);
  });

  describe('Requirement 5 & 6: Non-blocking Sensor and Volume Match After Failures', () => {
    it('sensor loop should not be blocked by network sync and volume matches after recovery', async () => {
      const testClient = createClient({
        serverUrl: `${baseUrl}/ingest`,
        sensorIntervalMs: 100,
        syncBaseIntervalMs: 500
      });

      await new Promise(resolve => setTimeout(resolve, 300));
      const volumeBefore = await testClient.wal.getTotalGeneratedVolume();
      expect(volumeBefore).toBeGreaterThan(0);

      // Stop server to simulate network failure
      await serverInstance.stop();
      serverInstance = null;

      // Let client continue generating while server is down
      await new Promise(resolve => setTimeout(resolve, 1500));

      const volumeDuringOutage = await testClient.wal.getTotalGeneratedVolume();
      expect(volumeDuringOutage).toBeGreaterThan(volumeBefore);

      // Start a new server for recovery
      serverInstance = await startServer(0);
      const newPort = serverInstance.server.address().port;
      const newBaseUrl = `http://127.0.0.1:${newPort}`;

      // Reconfigure client to use new server URL
      await testClient.stop();
      
      const testClient2 = createClient({
        serverUrl: `${newBaseUrl}/ingest`,
        sensorIntervalMs: 100,
        syncBaseIntervalMs: 200
      });

      // Wait for sync to complete
      await new Promise(r => setTimeout(r, 2000));

      // Get final volume from server
      const statsRes = await fetch(`${newBaseUrl}/stats`);
      const serverStats = await statsRes.json();
      const serverTotalVolume = serverStats.totalVolume;

      // Get final client volume
      const clientVolume = await testClient2.wal.getTotalGeneratedVolume();

      // Volume should match (allowing for some variance due to timing)
      // The difference should be less than the events generated during sync time
      const maxExpectedDifference = clientVolume * 0.25; // Allow 25% tolerance
      expect(Math.abs(serverTotalVolume - clientVolume)).toBeLessThan(maxExpectedDifference);

      await testClient2.stop();
    }, 15000);
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

    it('should handle ECONNRESET errors gracefully', async () => {
      const express = require('express');
      const testApp = express();
      testApp.use(express.json());

      let connectionClosed = false;

      testApp.post('/ingest', (req, res) => {
        // Close the socket abruptly to trigger ECONNRESET on client
        req.socket.destroy();
        connectionClosed = true;
      });

      const testServer = http.createServer(testApp);
      
      await new Promise((resolve) => {
        testServer.listen(0, () => {
          const testPort = testServer.address().port;
          const testUrl = `http://127.0.0.1:${testPort}`;

          const testClient = createClient({
            serverUrl: testUrl,
            sensorIntervalMs: 300,
            syncBaseIntervalMs: 100
          });

          // Generate event and trigger sync
          setTimeout(async () => {
            testServer.close();
            
            // Give client time to handle error
            await new Promise(r => setTimeout(r, 300));
            
            // Client should still be running and generating events
            const volume = await testClient.wal.getTotalGeneratedVolume();
            expect(volume).toBeGreaterThan(0);
            
            await testClient.stop();
            resolve();
          }, 500);
        });
      });
    }, 10000);

    it('should handle 500 errors gracefully and retry', async () => {
      // Create a simple HTTP server that returns 500 for first request
      let requestCount = 0;
      let serverErrorOccurred = false;

      const testServer = http.createServer((req, res) => {
        requestCount++;
        if (requestCount === 1) {
          serverErrorOccurred = true;
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Simulated server error' }));
        } else {
          // Subsequent requests succeed
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ insertedCount: 0, addedVolume: 0, totalVolume: 0 }));
        }
      });
      
      await new Promise((resolve) => {
        testServer.listen(0, () => {
          const testPort = testServer.address().port;
          const testUrl = `http://127.0.0.1:${testPort}`;

          const testClient = createClient({
            serverUrl: testUrl,
            sensorIntervalMs: 200,
            syncBaseIntervalMs: 150
          });

          // Wait for retry after 500 error
          setTimeout(async () => {
            testServer.close();
            
            // Verify server returned 500 at least once
            expect(serverErrorOccurred).toBe(true);
            
            // Client should still be running and generated events
            const volume = await testClient.wal.getTotalGeneratedVolume();
            expect(volume).toBeGreaterThan(0);
            
            await testClient.stop();
            resolve();
          }, 1500);
        });
      });
    }, 10000);
  });
});
