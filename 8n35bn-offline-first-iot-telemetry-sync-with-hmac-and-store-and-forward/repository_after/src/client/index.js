const { createClientWal } = require('./wal');
const { startSensorLoop } = require('./sensor');
const { startSyncLoop } = require('./sync');
const config = require('../config');

function createClient(options = {}) {
  const wal = createClientWal();
  const sensor = startSensorLoop(wal, {
    intervalMs: options.sensorIntervalMs || config.sensorIntervalMs
  });
  const sync = startSyncLoop(wal, {
    batchSize: options.batchSize || config.batchSize,
    baseIntervalMs: options.syncBaseIntervalMs || config.syncBaseIntervalMs,
    maxBackoffMs: options.syncMaxBackoffMs || config.syncMaxBackoffMs,
    serverUrl: options.serverUrl || `${config.serverBaseUrl}/ingest`
  });

  async function stop() {
    sensor.stop();
    sync.stop();
    await wal.close();
  }

  return {
    stop,
    wal
  };
}

// If executed directly, run a standalone client using default configuration.
if (require.main === module) {
  // eslint-disable-next-line no-console
  console.log('Starting station controller client...');
  const client = createClient();

  process.on('SIGINT', async () => {
    // eslint-disable-next-line no-console
    console.log('Shutting down client...');
    await client.stop();
    process.exit(0);
  });
}

module.exports = {
  createClient
};


