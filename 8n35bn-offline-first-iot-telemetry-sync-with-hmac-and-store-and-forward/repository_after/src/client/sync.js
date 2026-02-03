const crypto = require('crypto');
const {
  hmacSecret,
  hmacSignatureHeader,
  hmacTimestampHeader,
  batchSize: defaultBatchSize,
  syncBaseIntervalMs,
  syncMaxBackoffMs,
  serverBaseUrl
} = require('../config');

/**
 * Start the asynchronous synchronization loop.
 * The loop polls the WAL for unsent events and batches them into HTTP requests.
 */
function startSyncLoop(wal, options = {}) {
  const batchSize = options.batchSize || defaultBatchSize;
  const baseInterval = options.baseIntervalMs || syncBaseIntervalMs;
  const maxBackoff = options.maxBackoffMs || syncMaxBackoffMs;
  const url = options.serverUrl || `${serverBaseUrl}/ingest`;

  let backoffDelay = baseInterval;
  let stopped = false;
  let timer = null;

  async function syncOnce() {
    if (stopped) return;

    try {
      const events = await wal.getNextBatch(batchSize);

      if (!events.length) {
        scheduleNext(baseInterval);
        return;
      }

      const timestamp = Date.now().toString();
      const payload = { events };
      const body = JSON.stringify(payload);

      const signature = crypto
        .createHmac('sha256', hmacSecret)
        .update(`${timestamp}:${body}`)
        .digest('hex');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [hmacSignatureHeader]: signature,
          [hmacTimestampHeader]: timestamp
        },
        body
      });

      if (!response.ok) {
        // Treat 5xx and other non-2xx as transient for backoff purposes.
        throw new Error(`Server responded with status ${response.status}`);
      }

      const ids = events.map((e) => e.id);
      await wal.markEventsSent(ids);

      // Reset backoff on success.
      backoffDelay = baseInterval;
      scheduleNext(baseInterval);
    } catch (err) {
      // ECONNRESET or other network/server failure must not crash the process.
      // eslint-disable-next-line no-console
      console.error('Sync loop error', err && err.code ? err.code : err.message);

      // Exponential backoff with upper bound.
      backoffDelay = Math.min(backoffDelay * 2, maxBackoff);
      scheduleNext(backoffDelay);
    }
  }

  function scheduleNext(delay) {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(syncOnce, delay);
  }

  // Start immediately.
  scheduleNext(0);

  return {
    stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }
  };
}

module.exports = {
  startSyncLoop
};


