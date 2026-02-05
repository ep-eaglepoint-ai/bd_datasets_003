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
      // Track POST request counts and batch sizes
      let postCount = 0;
      const batchSizes = [];

      const express = require('express');
      const testApp = express();
      testApp.use(express.json());

      testApp.post('/ingest', (req, res) => {
        postCount++;
        const batchSize = req.body.events?.length || 0;
        batchSizes.push(batchSize);
        // Always respond success
        res.status(200).json({ insertedCount: batchSize, addedVolume: batchSize * 0.25, totalVolume: 0 });
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

          // Generate multiple events (should generate ~12 events in 600ms with 50ms interval)
          setTimeout(async () => {
            await testClient.stop();
            testServer.close();
            resolve();
          }, 600);
        });
      });

      // Verify batching: multiple events sent in single POST request
      expect(postCount).toBeGreaterThan(0);
      expect(batchSizes.length).toBeGreaterThan(0);
      // At least one batch should have multiple events (batch size > 1)
      const maxBatchSize = Math.max(...batchSizes);
      expect(maxBatchSize).toBeGreaterThan(1);
      // Total events sent should be greater than number of POST requests
      const totalEventsSent = batchSizes.reduce((sum, size) => sum + size, 0);
      expect(totalEventsSent).toBeGreaterThan(postCount);
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

    it('should handle ECONNRESET errors gracefully and continue WAL appends and retries', async () => {
      const express = require('express');
      const testApp = express();
      testApp.use(express.json());

      let connectionClosedCount = 0;
      let successfulRequestCount = 0;

      testApp.post('/ingest', (req, res) => {
        connectionClosedCount++;
        // Close the socket abruptly to trigger ECONNRESET on client
        // After a few failures, allow success to verify retry works
        if (connectionClosedCount <= 2) {
          req.socket.destroy();
        } else {
          successfulRequestCount++;
          res.status(200).json({ insertedCount: req.body.events?.length || 0, addedVolume: 0, totalVolume: 0 });
        }
      });

      const testServer = http.createServer(testApp);
      
      await new Promise(async (resolve) => {
        testServer.listen(0, async () => {
          const testPort = testServer.address().port;
          const testUrl = `http://127.0.0.1:${testPort}`;

          const testClient = createClient({
            serverUrl: `${testUrl}/ingest`,
            sensorIntervalMs: 100,
            syncBaseIntervalMs: 200
          });

          // Record initial volume
          const initialVolume = await testClient.wal.getTotalGeneratedVolume();

          // Wait for events to be generated and sync attempts (including retries)
          setTimeout(async () => {
            // Verify WAL continues to append events despite ECONNRESET
            const volumeAfterErrors = await testClient.wal.getTotalGeneratedVolume();
            expect(volumeAfterErrors).toBeGreaterThan(initialVolume);
            
            // Verify client attempted retries (should have multiple connection attempts)
            expect(connectionClosedCount).toBeGreaterThan(1);
            
            // Wait a bit more for successful retry
            await new Promise(r => setTimeout(r, 1000));
            
            // Verify eventually successful request occurred
            expect(successfulRequestCount).toBeGreaterThan(0);
            
            testServer.close();
            await testClient.stop();
            resolve();
          }, 2000);
        });
      });
    }, 20000);

    it('should handle 500 errors gracefully, continue WAL appends, and retry', async () => {
      // Create a simple HTTP server that returns 500 for first few requests
      const express = require('express');
      const testApp = express();
      testApp.use(express.json());
      
      let requestCount = 0;
      let serverErrorOccurred = false;
      let successfulRequestCount = 0;

      testApp.post('/ingest', (req, res) => {
        requestCount++;
        if (requestCount <= 2) {
          serverErrorOccurred = true;
          res.status(500).json({ error: 'Simulated server error' });
        } else {
          // Subsequent requests succeed
          successfulRequestCount++;
          res.status(200).json({ insertedCount: req.body.events?.length || 0, addedVolume: 0, totalVolume: 0 });
        }
      });

      const testServer = http.createServer(testApp);
      
      await new Promise(async (resolve) => {
        testServer.listen(0, async () => {
          const testPort = testServer.address().port;
          const testUrl = `http://127.0.0.1:${testPort}`;

          const testClient = createClient({
            serverUrl: `${testUrl}/ingest`,
            sensorIntervalMs: 100,
            syncBaseIntervalMs: 200
          });

          // Record initial volume
          const initialVolume = await testClient.wal.getTotalGeneratedVolume();

          // Wait for events to be generated, 500 errors, and retries
          setTimeout(async () => {
            // Verify server returned 500 at least once
            expect(serverErrorOccurred).toBe(true);
            
            // Verify WAL continues to append events despite 500 errors
            const volumeAfterErrors = await testClient.wal.getTotalGeneratedVolume();
            expect(volumeAfterErrors).toBeGreaterThan(initialVolume);
            
            // Wait a bit more for successful retry after backoff
            await new Promise(r => setTimeout(r, 1000));
            
            // Verify eventually successful request occurred (retry worked)
            expect(successfulRequestCount).toBeGreaterThan(0);
            expect(requestCount).toBeGreaterThan(2); // Should have retried
            
            testServer.close();
            await testClient.stop();
            resolve();
          }, 2000);
        });
      });
    }, 20000);
  });
});
