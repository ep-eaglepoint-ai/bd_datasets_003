const LinkWatchdog = require('../repository_after/LinkWatchdog');

describe('LinkWatchdog', () => {
  let watchdog;

  beforeEach(() => {
    watchdog = new LinkWatchdog();
  });

  test('Returns WARMING_UP until 200 samples', () => {
    const linkId = 'sat-1';
    
    // Send 199 samples
    for (let i = 0; i < 199; i++) {
        const status = watchdog.process({ linkId, latencyMs: 10.0, timestamp: Date.now() });
        expect(status).toBe('WARMING_UP');
    }

    const status200 = watchdog.process({ linkId, latencyMs: 10.0, timestamp: Date.now() });
    expect(status200).toBe('NOMINAL');
  });

  test('Strict Combined Sequence (199x10.0 -> 200th 10.0 -> 5x250.0)', () => {
    const linkId = 'sat-req-8-strict';
    
    // 1. Send 199 pulses of 10.0
    for (let i = 0; i < 199; i++) {
        expect(watchdog.process({ linkId, latencyMs: 10.0, timestamp: Date.now() })).toBe('WARMING_UP');
    }

    // 2. 200th pulse of 10.0 -> NOMINAL
    expect(watchdog.process({ linkId, latencyMs: 10.0, timestamp: Date.now() })).toBe('NOMINAL');

    // 3. Send 5 pulses of 250.0
    watchdog.process({ linkId, latencyMs: 250.0, timestamp: Date.now() }); // 1
    watchdog.process({ linkId, latencyMs: 250.0, timestamp: Date.now() }); // 2
    watchdog.process({ linkId, latencyMs: 250.0, timestamp: Date.now() }); // 3
    watchdog.process({ linkId, latencyMs: 250.0, timestamp: Date.now() }); // 4
    
    // Pulse 5 -> Verify Anomaly
    const status = watchdog.process({ linkId, latencyMs: 250.0, timestamp: Date.now() });
    expect(status).toBe('ANOMALY');
  });

  test('Detects Anomaly when current mean deviates > 2 * baseline stdDev', () => {
    const linkId = 'sat-anomaly';
    
    for (let i = 0; i < 200; i++) {
      watchdog.process({ linkId, latencyMs: 10.0, timestamp: Date.now() });
    }

    expect(watchdog.getLinkState(linkId).status).toBe('NOMINAL');
    
    let status = watchdog.process({ linkId, latencyMs: 250.0, timestamp: Date.now() }); 

    for (let i = 0; i < 4; i++) {
       status = watchdog.process({ linkId, latencyMs: 250.0, timestamp: Date.now() });
    }
    
    expect(status).toBe('ANOMALY');
  });

  test('Reset functionality', () => {
    const linkId = 'sat-reset';
    // Fill to nominal
    for (let i = 0; i < 200; i++) watchdog.process({ linkId, latencyMs: 10.0, timestamp: Date.now() });
    expect(watchdog.getLinkState(linkId).status).toBe('NOMINAL');

    // Reset
    watchdog.reset(linkId);
    
    // Next pulse should be WARMING_UP
    const status = watchdog.process({ linkId, latencyMs: 10.0, timestamp: Date.now() });
    expect(status).toBe('WARMING_UP');
    // Check internal state: count should be 1
    const state = watchdog.getLinkState(linkId);
    // Note: getLinkState uses helper that iterates based on count.
    expect(state.samples.length).toBe(1);
  });

  test('Zero-variance edge case setup', () => {
    const linkId = 'sat-zero-var';
    
    for (let i = 0; i < 200; i++) {
      const status = watchdog.process({ linkId, latencyMs: 50.0, timestamp: Date.now() });
      if (i < 199) expect(status).toBe('WARMING_UP');
      else expect(status).toBe('NOMINAL');
    }
  });
  
  test('Non-zero variance nominal case', () => {
    const linkId = 'sat-noise';

    for (let i = 0; i < 200; i++) {
       watchdog.process({ linkId, latencyMs: i % 2 === 0 ? 10 : 20, timestamp: Date.now() });
    }
    expect(watchdog.getLinkState(linkId).status).toBe('NOMINAL');

    let status = 'NOMINAL';
    for(let i=0; i<50; i++) {
       status = watchdog.process({ linkId, latencyMs: 100, timestamp: Date.now() });
    }
    expect(status).toBe('ANOMALY');
  });

  test('Performance: independent links', () => {
     watchdog.process({ linkId: 'A', latencyMs: 10, timestamp: Date.now() });
     watchdog.process({ linkId: 'B', latencyMs: 20, timestamp: Date.now() });
     expect(watchdog.getLinkState('A').samples[0]).toBe(10);
     expect(watchdog.getLinkState('B').samples[0]).toBe(20);
  });

  test('Edge Case: Flat baseline drift (Reference Req 6 & 3)', () => {
    const linkId = 'sat-flat-drift';
    
    // 200 samples of 10.0
    for(let i=0; i<200; i++) watchdog.process({ linkId, latencyMs: 10.0, timestamp: Date.now() });
    expect(watchdog.getLinkState(linkId).status).toBe('NOMINAL');

    const status = watchdog.process({ linkId, latencyMs: 10.1, timestamp: Date.now() });
    expect(status).toBe('ANOMALY');
  });
});
