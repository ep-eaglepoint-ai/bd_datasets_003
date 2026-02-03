const { v4: uuidv4 } = require('uuid');
const { sensorIntervalMs } = require('../config');

function startSensorLoop(wal, options = {}) {
  const intervalMs = options.intervalMs || sensorIntervalMs;
  let timer = null;

  function generateVolume() {
    // Simulate a small water dispense volume in liters.
    return 0.1 + Math.random() * 0.4;
  }

  function tick() {
    const event = {
      id: uuidv4(),
      timestamp: Date.now(),
      volume: generateVolume()
    };

    // Fire-and-forget append to WAL so sensor loop is not blocked.
    wal.appendEvent(event).catch((err) => {
      // In production we would log to a proper logger.
      // For now, just stderr without crashing.
      // eslint-disable-next-line no-console
      console.error('Failed to append event to WAL', err);
    });
  }

  timer = setInterval(tick, intervalMs);

  return {
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }
  };
}

module.exports = {
  startSensorLoop
};


