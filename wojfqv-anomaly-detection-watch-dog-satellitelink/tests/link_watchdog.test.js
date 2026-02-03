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
      const status = watchdog.process(linkId, 10.0);
      expect(status).toBe('WARMING_UP');
    }

    const status200 = watchdog.process(linkId, 10.0);
    expect(status200).toBe('NOMINAL');
  });

  test('Strict Combined Sequence (199x10.0 -> 200th 10.0 -> 5x250.0)', () => {
    const linkId = 'sat-req-8-strict';
    
    // 1. Send 199 pulses of 10.0
    for (let i = 0; i < 199; i++) {
        expect(watchdog.process(linkId, 10.0)).toBe('WARMING_UP');
    }

    // 2. 200th pulse of 10.0 -> NOMINAL
    expect(watchdog.process(linkId, 10.0)).toBe('NOMINAL');

    // 3. Send 5 pulses of 250.0
    // Pulse 1
    watchdog.process(linkId, 250.0);
    // Pulse 2
    watchdog.process(linkId, 250.0);
    // Pulse 3
    watchdog.process(linkId, 250.0);
    // Pulse 4
    watchdog.process(linkId, 250.0);
    
    // Pulse 5 -> Verify Anomaly
    const status = watchdog.process(linkId, 250.0);
    expect(status).toBe('ANOMALY');
  });

  test('Detects Anomaly when current mean deviates > 2 * baseline stdDev', () => {
    const linkId = 'sat-anomaly';
    
    for (let i = 0; i < 200; i++) {
      watchdog.process(linkId, 10.0);
    }

    expect(watchdog.getLinkState(linkId).status).toBe('NOMINAL');
    
    let status = watchdog.process(linkId, 250.0); 

    for (let i = 0; i < 4; i++) {
       status = watchdog.process(linkId, 250.0);
    }
    
    expect(status).toBe('ANOMALY');
  });

  test('Reset functionality', () => {
    const linkId = 'sat-reset';
    // Fill to nominal
    for (let i = 0; i < 200; i++) watchdog.process(linkId, 10.0);
    expect(watchdog.getLinkState(linkId).status).toBe('NOMINAL');

    // Reset
    watchdog.reset(linkId);
    
    // Next pulse should be WARMING_UP
    const status = watchdog.process(linkId, 10.0);
    expect(status).toBe('WARMING_UP');
    expect(watchdog.getLinkState(linkId).samples.length).toBe(1);
  });

  test('Zero-variance edge case setup', () => {
    const linkId = 'sat-zero-var';
    
    for (let i = 0; i < 200; i++) {
      const status = watchdog.process(linkId, 50.0);
      if (i < 199) expect(status).toBe('WARMING_UP');
      else expect(status).toBe('NOMINAL');
    }
  });
  
  test('Non-zero variance nominal case', () => {
    const linkId = 'sat-noise';

    for (let i = 0; i < 200; i++) {
       watchdog.process(linkId, i % 2 === 0 ? 10 : 20);
    }
    expect(watchdog.getLinkState(linkId).status).toBe('NOMINAL');

    let status = 'NOMINAL';
    for(let i=0; i<50; i++) {
       status = watchdog.process(linkId, 100);
    }
    expect(status).toBe('ANOMALY');
  });

  test('Performance: independent links', () => {
     // Use enough IDs to verify no cross-talk
     watchdog.process('A', 10);
     watchdog.process('B', 20);
     expect(watchdog.getLinkState('A').samples[0]).toBe(10);
     expect(watchdog.getLinkState('B').samples[0]).toBe(20);
  });

  test('Edge Case: Flat baseline drift (Reference Req 6 & 3)', () => {
    const linkId = 'sat-flat-drift';
    
    // 200 samples of 10.0
    for(let i=0; i<200; i++) watchdog.process(linkId, 10.0);
    expect(watchdog.getLinkState(linkId).status).toBe('NOMINAL');

    const status = watchdog.process(linkId, 10.1);
    expect(status).toBe('ANOMALY');
  });
});
