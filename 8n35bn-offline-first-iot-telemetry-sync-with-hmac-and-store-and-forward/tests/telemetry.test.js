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

  describe('Requirement 5: Non-blocking Sensor Loop', () => {
    it('should continue generating events while sync loop encounters persistent network failures', async () => {
      const testClient = createClient({
        // Use an invalid port to force connection failures on every sync attempt.
        serverUrl: 'http://127.0.0.1:99999/ingest',
        sensorIntervalMs: 50,
        syncBaseIntervalMs: 100
      });

      // Allow sensor loop to start and generate some initial events.
      const initialVolume = await testClient.wal.getTotalGeneratedVolume();

      // During this window, sync attempts will repeatedly fail, but sensor loop
      // must remain non-blocking and continue appending events to the WAL.
      await new Promise((resolve) => setTimeout(resolve, 400));
      const volumeDuringFailures = await testClient.wal.getTotalGeneratedVolume();

      // Volume should increase even while sync is experiencing network errors.
      expect(volumeDuringFailures).toBeGreaterThan(initialVolume);

      // Wait a bit longer to confirm events keep flowing over time, not just once.
      await new Promise((resolve) => setTimeout(resolve, 400));
      const volumeLater = await testClient.wal.getTotalGeneratedVolume();
      expect(volumeLater).toBeGreaterThan(volumeDuringFailures);

      await testClient.stop();
    }, 10000);
  });

  describe('Requirement 6: Server/Client Volume Consistency After Failures', () => {
    it('should eventually align server total volume with client total volume after transient failures (mock server)', async () => {
      const express = require('express');
      const testApp = express();
      testApp.use(express.json());

      let requestCount = 0;
      let serverErrorOccurred = false;
      let serverTotalVolume = 0;

      testApp.post('/ingest', (req, res) => {
        requestCount++;
        const events = req.body.events || [];
        const batchVolume = events.reduce((sum, e) => sum + (e.volume || 0), 0);

        if (requestCount <= 2) {
          serverErrorOccurred = true;
          return res.status(500).json({ error: 'Simulated server error' });
        }

        serverTotalVolume += batchVolume;
        return res
          .status(200)
          .json({ insertedCount: events.length, addedVolume: batchVolume, totalVolume: serverTotalVolume });
      });

      const testServer = http.createServer(testApp);

      await new Promise((resolve) => {
        testServer.listen(0, () => resolve());
      });

      const testPort = testServer.address().port;
      const testUrl = `http://127.0.0.1:${testPort}`;

      // Start this scenario with a fresh client WAL so we only measure events
      // generated (and synced) during this test, without contamination from
      // previous tests sharing the same database file.
      const config = require('../repository_after/src/config');
      if (fs.existsSync(config.clientDbPath)) {
        fs.unlinkSync(config.clientDbPath);
      }

      const testClient = createClient({
        serverUrl: `${testUrl}/ingest`,
        sensorIntervalMs: 80,
        syncBaseIntervalMs: 150
      });

      // Allow some time for events to be generated and for a mix of failures/successes.
      // Keep this window modest so there aren't too many events to drain later.
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Stop the sensor loop so no new events are generated; from this point on,
      // the sync loop should be able to drain all remaining unsent events.
      testClient.sensor.stop();

      // Wait until unsent events are drained or timeout.
      // Give the sync loop plenty of time (up to 15s) to drain all remaining
      // unsent events after the transient failures have stopped.
      const maxWaitMs = 15000;
      const start = Date.now();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const unsent = await testClient.wal.getUnsentEventCount();
        if (unsent === 0) break;
        if (Date.now() - start > maxWaitMs) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      const clientTotalVolume = await testClient.wal.getTotalGeneratedVolume();

      // We must have observed at least one simulated failure.
      expect(serverErrorOccurred).toBe(true);

      // After retries and recovery, there should be no unsent events left, so
      // serverTotalVolume should match clientTotalVolume.
      expect(serverTotalVolume).toBeGreaterThan(0);
      expect(clientTotalVolume).toBeGreaterThan(0);
      // Allow for minor floating point differences when summing volumes.
      expect(serverTotalVolume).toBeCloseTo(clientTotalVolume, 3);

      testServer.close();
      await testClient.stop();
    }, 20000);

    it('should align server total volume with client total volume using real server idempotency', async () => {
      // Use the real server to verify idempotency and total volume tracking work correctly
      const config = require('../repository_after/src/config');
      
      // Start with fresh databases for this test
      if (fs.existsSync(config.clientDbPath)) {
        fs.unlinkSync(config.clientDbPath);
      }
      if (fs.existsSync(config.serverDbPath)) {
        fs.unlinkSync(config.serverDbPath);
      }

      // Create a new server instance for this test
      const testServerInstance = await startServer(0);
      const testServerPort = testServerInstance.server.address().port;
      const testServerUrl = `http://127.0.0.1:${testServerPort}`;

      const testClient = createClient({
        serverUrl: `${testServerUrl}/ingest`,
        sensorIntervalMs: 100,
        syncBaseIntervalMs: 200
      });

      // Allow time for events to be generated and synced
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Stop the sensor loop so no new events are generated
      testClient.sensor.stop();

      // Wait until unsent events are drained
      const maxWaitMs = 10000;
      const start = Date.now();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const unsent = await testClient.wal.getUnsentEventCount();
        if (unsent === 0) break;
        if (Date.now() - start > maxWaitMs) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      const clientTotalVolume = await testClient.wal.getTotalGeneratedVolume();
      const serverTotalVolume = await testServerInstance.db.getTotalVolume();

      // Verify the real server's total volume matches client total volume
      // This confirms idempotency works (no double-counting) and volume tracking is correct
      expect(serverTotalVolume).toBeGreaterThan(0);
      expect(clientTotalVolume).toBeGreaterThan(0);
      // Allow for minor floating point differences when summing volumes
      expect(serverTotalVolume).toBeCloseTo(clientTotalVolume, 3);

      await testClient.stop();
      await testServerInstance.stop();
    }, 20000);
  });

  describe('Requirement 9: Safe Concurrent WAL Operations', () => {
    it('should safely handle concurrent appends while reading batches', async () => {
      // Use a unique database path for this test to avoid conflicts with other tests
      const testDbPath = path.join(__dirname, '..', 'temp_test_data', `concurrent_wal_test_${Date.now()}_${Math.random().toString(36).substring(7)}.db`);
      
      // Clean up database and all WAL-related files to ensure fresh start
      // SQLite WAL mode creates .db-wal and .db-shm files that must be deleted too
      const dbFiles = [
        testDbPath,
        `${testDbPath}-wal`,
        `${testDbPath}-shm`
      ];
      
      // Delete any existing files (in case of retry)
      for (const dbFile of dbFiles) {
        if (fs.existsSync(dbFile)) {
          try {
            fs.unlinkSync(dbFile);
          } catch (err) {
            // Ignore errors if file is locked or doesn't exist
          }
        }
      }
      
      // Wait a bit to ensure file system operations complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Temporarily override the client DB path
      const originalPath = process.env.CLIENT_DB_PATH;
      process.env.CLIENT_DB_PATH = testDbPath;
      
      // Reload modules to pick up new path
      delete require.cache[require.resolve('../repository_after/src/config')];
      delete require.cache[require.resolve('../repository_after/src/client/wal')];
      
      const { createClientWal } = require('../repository_after/src/client/wal');
      const wal = createClientWal();
      
      // Wait for initialization to complete
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Get initial state (should be empty with unique path, but we use delta-based
      // verification to be robust and focus on what we're testing)
      const initialVolume = await wal.getTotalGeneratedVolume();
      const initialEvents = await wal.getNextBatch(100);
      const initialEventIds = new Set(initialEvents.map(e => e.id));
      
      // Test concurrent operations: appends while reading batches
      // This simulates the real scenario where sensor loop appends while sync loop reads
      const appendPromises = [];
      const readPromises = [];
      const eventIds = new Set();
      const eventVolumes = new Map(); // Track expected volumes
      
      // Create 30 events to append concurrently (simulating sensor loop)
      for (let i = 0; i < 30; i++) {
        const eventId = `test-${i}-${Date.now()}-${Math.random()}`;
        const volume = 0.1 + Math.random() * 0.4;
        eventIds.add(eventId);
        eventVolumes.set(eventId, volume);
        appendPromises.push(
          wal.appendEvent({
            id: eventId,
            timestamp: Date.now() + i,
            volume: volume
          })
        );
      }
      
      // While appending, also read batches concurrently (simulating sync loop)
      // This tests that reads don't block appends and vice versa
      for (let i = 0; i < 10; i++) {
        readPromises.push(wal.getNextBatch(10));
      }
      
      // Wait for all operations to complete
      await Promise.all([...appendPromises, ...readPromises]);
      
      // Wait a bit to ensure all database operations are fully committed
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Calculate expected total volume from our tracked events
      const expectedTotalVolume = Array.from(eventVolumes.values()).reduce((sum, v) => sum + v, 0);
      
      // Get final state
      const finalVolume = await wal.getTotalGeneratedVolume();
      const allEvents = await wal.getNextBatch(100);
      
      // Calculate the volume we added (final - initial)
      const addedVolume = finalVolume - initialVolume;
      
      // Verify we added the expected volume
      expect(addedVolume).toBeCloseTo(expectedTotalVolume, 3);
      
      // Find our events in the results (filter out any initial events)
      const ourEvents = allEvents.filter(e => eventIds.has(e.id));
      
      // Verify we got all 30 of our events
      expect(ourEvents.length).toBe(30);
      
      // Verify no duplicate events (each ID should be unique)
      const readEventIds = ourEvents.map(e => e.id);
      const uniqueReadIds = new Set(readEventIds);
      expect(uniqueReadIds.size).toBe(30);
      
      // Verify all expected event IDs are present
      for (const eventId of eventIds) {
        expect(readEventIds).toContain(eventId);
      }
      
      // Verify each event has the correct volume (no data corruption)
      for (const event of ourEvents) {
        const expectedVolume = eventVolumes.get(event.id);
        expect(event.volume).toBeCloseTo(expectedVolume, 5);
      }
      
      // Verify no data corruption: sum of volumes from our events should match expected
      const sumOfOurEventVolumes = ourEvents.reduce((sum, e) => sum + e.volume, 0);
      expect(sumOfOurEventVolumes).toBeCloseTo(expectedTotalVolume, 3);
      
      await wal.close();
      
      // Wait a bit to ensure database connection is fully closed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Clean up database files after test
      for (const dbFile of dbFiles) {
        if (fs.existsSync(dbFile)) {
          try {
            fs.unlinkSync(dbFile);
          } catch (err) {
            // Ignore errors if file is locked (shouldn't happen after close, but be safe)
          }
        }
      }
      
      // Restore original path
      if (originalPath) {
        process.env.CLIENT_DB_PATH = originalPath;
      } else {
        delete process.env.CLIENT_DB_PATH;
      }
      delete require.cache[require.resolve('../repository_after/src/config')];
      delete require.cache[require.resolve('../repository_after/src/client/wal')];
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
