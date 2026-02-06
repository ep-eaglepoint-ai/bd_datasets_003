const express = require('express');
const crypto = require('crypto');
const {
  hmacSecret,
  hmacSignatureHeader,
  hmacTimestampHeader,
  replayWindowMs
} = require('../config');
const { createServerDb } = require('./db');

function createApp() {
  const app = express();
  const db = createServerDb();

  app.use(express.json());

  // HMAC verification middleware for all POST /ingest requests.
  app.post('/ingest', verifyHmacMiddleware, async (req, res) => {
    const { events } = req.body || {};
    if (!Array.isArray(events)) {
      return res.status(400).json({ error: 'Invalid payload: events must be an array' });
    }

    try {
      const { insertedCount, addedVolume } = await db.recordEvents(events);
      const totalVolume = await db.getTotalVolume();

      return res.status(200).json({
        insertedCount,
        addedVolume,
        totalVolume
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to record events', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/stats', async (req, res) => {
    try {
      const totalVolume = await db.getTotalVolume();
      res.json({ totalVolume });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to read stats', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Middleware implementation.
  function verifyHmacMiddleware(req, res, next) {
    try {
      const signature = req.header(hmacSignatureHeader);
      const timestamp = req.header(hmacTimestampHeader);

      if (!signature || !timestamp) {
        return res.status(401).json({ error: 'Missing signature or timestamp' });
      }

      const now = Date.now();
      const ts = Number(timestamp);
      if (Number.isNaN(ts) || Math.abs(now - ts) > replayWindowMs) {
        return res.status(401).json({ error: 'Stale or invalid timestamp' });
      }

      const body = JSON.stringify(req.body || {});
      const expected = crypto
        .createHmac('sha256', hmacSecret)
        .update(`${timestamp}:${body}`)
        .digest('hex');

      const sigBuf = Buffer.from(signature, 'hex');
      const expBuf = Buffer.from(expected, 'hex');

      if (sigBuf.length !== expBuf.length) {
        return res.status(401).json({ error: 'Invalid signature' });
      }

      const valid = crypto.timingSafeEqual(sigBuf, expBuf);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid signature' });
      }

      return next();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('HMAC verification failed', err);
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  return { app, db };
}

module.exports = {
  createApp
};


