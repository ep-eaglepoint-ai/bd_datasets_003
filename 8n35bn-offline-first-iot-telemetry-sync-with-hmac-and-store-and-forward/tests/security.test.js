/**
 * @jest-environment node
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Set environment variables BEFORE loading any modules
process.env.CLIENT_DB_PATH = path.join(__dirname, '..', 'temp_test_data', 'security_client.db');
process.env.SERVER_DB_PATH = path.join(__dirname, '..', 'temp_test_data', 'security_server.db');

// Create temp directory
const tempDir = path.join(__dirname, '..', 'temp_test_data');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Import from repository_after AFTER setting env vars
const { createApp } = require('../repository_after/src/server/app');

describe('Security Tests', () => {
  let app;
  let server;
  let port;
  let baseUrl;

  beforeAll(async () => {
    // Create fresh app instance
    const result = createApp();
    app = result.app;
    
    await new Promise(resolve => {
      server = app.listen(0, () => {
        port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  async function sendSignedBatch(events, secretOverride = null, timestampOverride = null) {
    const timestamp = timestampOverride || Date.now().toString();
    const payload = { events };
    const body = JSON.stringify(payload);
    const config = require('../repository_after/src/config');
    const secret = secretOverride || config.hmacSecret;

    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}:${body}`)
      .digest('hex');

    const res = await fetch(`${baseUrl}/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [config.hmacSignatureHeader]: signature,
        [config.hmacTimestampHeader]: timestamp
      },
      body
    });
    return res;
  }

  describe('Requirement 3: HMAC Authentication', () => {
    it('should reject requests with invalid HMAC signature', async () => {
      const events = [
        { id: `test-1-${Date.now()}`, timestamp: Date.now(), volume: 1.0 }
      ];

      const res = await sendSignedBatch(events, 'wrong_secret');

      expect(res.status).toBe(401);
    });

    it('should accept requests with valid HMAC signature', async () => {
      const events = [
        { id: `test-2-${Date.now()}`, timestamp: Date.now(), volume: 2.0 }
      ];

      const res = await sendSignedBatch(events);

      expect(res.status).toBe(200);
    });
  });

  describe('Requirement 4: Idempotency', () => {
    it('should not double-count volume on duplicate batch', async () => {
      const batchId = Date.now();
      const events = [
        { id: `idemp-1-${batchId}`, timestamp: Date.now(), volume: 10.0 },
        { id: `idemp-2-${batchId}`, timestamp: Date.now(), volume: 20.0 }
      ];

      // First request
      const firstRes = await sendSignedBatch(events);
      expect(firstRes.status).toBe(200);
      const firstJson = await firstRes.json();
      expect(firstJson.insertedCount).toBe(2);

      // Duplicate request
      const dupRes = await sendSignedBatch(events);
      expect(dupRes.status).toBe(200);
      const dupJson = await dupRes.json();
      expect(dupJson.insertedCount).toBe(0);
      expect(dupJson.addedVolume).toBe(0);
    });

    it('should return zero addedVolume for duplicate batches', async () => {
      const batchId = Date.now() + 1;
      const events = [
        { id: `vol-1-${batchId}`, timestamp: Date.now(), volume: 5.0 },
        { id: `vol-2-${batchId}`, timestamp: Date.now(), volume: 5.0 }
      ];

      // Send once
      await sendSignedBatch(events);

      // Send again (duplicate)
      const dupRes = await sendSignedBatch(events);
      const dupJson = await dupRes.json();

      // Duplicate should return 0 addedVolume
      expect(dupJson.addedVolume).toBe(0);
      expect(dupJson.insertedCount).toBe(0);
    });
  });

  describe('Requirement 7: Replay Attack Protection', () => {
    it('should reject requests with expired timestamp', async () => {
      const events = [
        { id: `replay-1-${Date.now()}`, timestamp: Date.now(), volume: 1.0 }
      ];

      // Timestamp from 10 minutes ago (beyond replay window)
      const staleTimestamp = (Date.now() - 10 * 60 * 1000).toString();

      const res = await sendSignedBatch(events, null, staleTimestamp);

      expect(res.status).toBe(401);
    });

    it('should reject requests with future timestamp', async () => {
      const events = [
        { id: `replay-2-${Date.now()}`, timestamp: Date.now(), volume: 1.0 }
      ];

      // Timestamp from 10 minutes in the future
      const futureTimestamp = (Date.now() + 10 * 60 * 1000).toString();

      const res = await sendSignedBatch(events, null, futureTimestamp);

      expect(res.status).toBe(401);
    });

    it('should accept requests with valid recent timestamp', async () => {
      const events = [
        { id: `fresh-1-${Date.now()}`, timestamp: Date.now(), volume: 1.0 }
      ];

      const res = await sendSignedBatch(events);

      expect(res.status).toBe(200);
    });
  });
});
