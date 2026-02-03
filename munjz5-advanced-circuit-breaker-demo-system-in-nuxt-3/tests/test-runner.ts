/**
 * Standalone Test Runner for Circuit Breaker Requirements
 * Can run against any server instance (before or after)
 */

interface TestResult {
  requirement: number;
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  results: TestResult[];
  timestamp: string;
}

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function resetBreakers(): Promise<void> {
  try {
    await fetch(`${BASE_URL}/api/breaker/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
  } catch {
    // Ignore errors during reset
  }
}

async function makeRequest(service: string, params: Record<string, string | number> = {}): Promise<any> {
  const searchParams = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  );
  const response = await fetch(`${BASE_URL}/api/services/${service}?${searchParams}`);
  return response.json();
}

type TestFunction = () => Promise<void>;

const tests: Array<{ requirement: number; name: string; fn: TestFunction }> = [
  // REQ 1: Nuxt 3 server routes as integration point
  {
    requirement: 1,
    name: 'System uses Nuxt 3 server routes for external service calls',
    fn: async () => {
      const response = await fetch(`${BASE_URL}/api/services/fast`);
      if (!response.ok) throw new Error('Server route not accessible');
      const data = await response.json();
      if (!data.serviceKey || !data.serviceKey.startsWith('upstream-')) {
        throw new Error('Response does not include proper serviceKey');
      }
    }
  },

  // REQ 2: Three states support
  {
    requirement: 2,
    name: 'Circuit breaker supports CLOSED state',
    fn: async () => {
      await resetBreakers();
      const result = await makeRequest('fast');
      if (result.stats.state !== 'CLOSED') {
        throw new Error(`Expected CLOSED state, got ${result.stats.state}`);
      }
    }
  },
  {
    requirement: 2,
    name: 'Circuit breaker supports OPEN state',
    fn: async () => {
      await resetBreakers();
      for (let i = 0; i < 10; i++) {
        await makeRequest('flaky', { failureRate: 100, minimumRequestVolume: 3, failureRateThreshold: 40 });
      }
      const statusResponse = await fetch(`${BASE_URL}/api/breaker/status?serviceKey=upstream-flaky`);
      const status = await statusResponse.json();
      if (status.status.state !== 'OPEN') {
        throw new Error(`Expected OPEN state, got ${status.status.state}`);
      }
    }
  },
  {
    requirement: 2,
    name: 'Circuit breaker supports HALF_OPEN state',
    fn: async () => {
      await resetBreakers();
      for (let i = 0; i < 10; i++) {
        await makeRequest('flaky', { failureRate: 100, minimumRequestVolume: 3, resetTimeout: 500 });
      }
      await sleep(700);
      const result = await makeRequest('flaky', { failureRate: 0, resetTimeout: 500 });
      if (!['HALF_OPEN', 'CLOSED'].includes(result.stats.state)) {
        throw new Error(`Expected HALF_OPEN or CLOSED state, got ${result.stats.state}`);
      }
    }
  },

  // REQ 3: CLOSED to OPEN transition
  {
    requirement: 3,
    name: 'Breaker transitions from CLOSED to OPEN when failure threshold exceeded',
    fn: async () => {
      await resetBreakers();
      for (let i = 0; i < 8; i++) {
        await makeRequest('flaky', { failureRate: 100, minimumRequestVolume: 3, failureRateThreshold: 40 });
      }
      const statusResponse = await fetch(`${BASE_URL}/api/breaker/status?serviceKey=upstream-flaky`);
      const status = await statusResponse.json();
      if (status.status.state !== 'OPEN') {
        throw new Error(`Expected OPEN state after failures, got ${status.status.state}`);
      }
    }
  },

  // REQ 4: OPEN to HALF_OPEN transition
  {
    requirement: 4,
    name: 'Breaker transitions from OPEN to HALF_OPEN after reset interval',
    fn: async () => {
      await resetBreakers();
      for (let i = 0; i < 10; i++) {
        await makeRequest('flaky', { failureRate: 100, minimumRequestVolume: 3, resetTimeout: 500 });
      }
      const beforeWait = await fetch(`${BASE_URL}/api/breaker/status?serviceKey=upstream-flaky`);
      const beforeStatus = await beforeWait.json();
      if (beforeStatus.status.state !== 'OPEN') {
        throw new Error(`Expected OPEN state before wait, got ${beforeStatus.status.state}`);
      }
      await sleep(700);
      // Make a request to trigger transition check
      await makeRequest('flaky', { failureRate: 0, resetTimeout: 500 });
      const afterWait = await fetch(`${BASE_URL}/api/breaker/status?serviceKey=upstream-flaky`);
      const afterStatus = await afterWait.json();
      if (!['HALF_OPEN', 'CLOSED'].includes(afterStatus.status.state)) {
        throw new Error(`Expected HALF_OPEN or CLOSED state after wait, got ${afterStatus.status.state}`);
      }
    }
  },

  // REQ 5: HALF_OPEN to CLOSED transition
  {
    requirement: 5,
    name: 'Breaker transitions from HALF_OPEN to CLOSED after successful probes',
    fn: async () => {
      await resetBreakers();
      for (let i = 0; i < 10; i++) {
        await makeRequest('flaky', { failureRate: 100, minimumRequestVolume: 3, resetTimeout: 300, successThreshold: 2 });
      }
      await sleep(500);
      for (let i = 0; i < 5; i++) {
        await makeRequest('flaky', { failureRate: 0, resetTimeout: 300, successThreshold: 2 });
      }
      const statusResponse = await fetch(`${BASE_URL}/api/breaker/status?serviceKey=upstream-flaky`);
      const status = await statusResponse.json();
      if (status.status.state !== 'CLOSED') {
        throw new Error(`Expected CLOSED state after successful probes, got ${status.status.state}`);
      }
    }
  },

  // REQ 6: Immediate blocking in OPEN state
  {
    requirement: 6,
    name: 'Breaker immediately blocks upstream calls when OPEN',
    fn: async () => {
      await resetBreakers();
      for (let i = 0; i < 10; i++) {
        await makeRequest('flaky', { failureRate: 100, minimumRequestVolume: 3, resetTimeout: 30000 });
      }
      const start = Date.now();
      const result = await makeRequest('slow', { delay: 5000, resetTimeout: 30000 });
      const duration = Date.now() - start;
      if (!result.fallbackUsed || result.fallbackReason !== 'OPEN') {
        throw new Error('Expected fallback with OPEN reason');
      }
      if (duration > 500) {
        throw new Error(`Response took ${duration}ms, expected < 500ms for fast fail`);
      }
    }
  },

  // REQ 7: Fallback response
  {
    requirement: 7,
    name: 'System returns fallback response when circuit is OPEN',
    fn: async () => {
      await resetBreakers();
      for (let i = 0; i < 10; i++) {
        await makeRequest('flaky', { failureRate: 100, minimumRequestVolume: 3 });
      }
      const result = await makeRequest('flaky', { failureRate: 0 });
      if (!result.fallbackUsed) {
        throw new Error('Expected fallback to be used when circuit is OPEN');
      }
      if (result.data === null) {
        throw new Error('Expected fallback data to be returned');
      }
    }
  },

  // REQ 8: Rolling time window tracking
  {
    requirement: 8,
    name: 'Request failures and timeouts tracked using rolling time window',
    fn: async () => {
      await resetBreakers();
      await makeRequest('fast');
      const statusResponse = await fetch(`${BASE_URL}/api/breaker/status?serviceKey=upstream-fast`);
      const status = await statusResponse.json();
      if (!status.status.metrics) {
        throw new Error('Expected metrics in status');
      }
      const requiredFields = ['totalSuccesses', 'totalFailures', 'totalTimeouts', 'failureRate', 'buckets'];
      for (const field of requiredFields) {
        if (!(field in status.status.metrics)) {
          throw new Error(`Missing metric field: ${field}`);
        }
      }
      if (!Array.isArray(status.status.metrics.buckets)) {
        throw new Error('Expected buckets to be an array');
      }
    }
  },

  // REQ 9: Timeout enforcement and classification
  {
    requirement: 9,
    name: 'Upstream request timeouts are enforced and classified separately',
    fn: async () => {
      await resetBreakers();
      const result = await makeRequest('slow', { delay: 10000, timeout: 300 });
      const statusResponse = await fetch(`${BASE_URL}/api/breaker/status?serviceKey=upstream-slow`);
      const status = await statusResponse.json();
      if (status.status.metrics.totalTimeouts < 1) {
        throw new Error('Expected timeout to be recorded');
      }
      if (result.fallbackUsed && result.fallbackReason !== 'TIMEOUT') {
        throw new Error(`Expected TIMEOUT fallback reason, got ${result.fallbackReason}`);
      }
    }
  },

  // REQ 10: No automatic retries
  {
    requirement: 10,
    name: 'Automatic retries are disabled for protected calls',
    fn: async () => {
      await resetBreakers();
      const start = Date.now();
      await makeRequest('flaky', { failureRate: 100, timeout: 500 });
      const duration = Date.now() - start;
      // Without retries, should complete within single timeout + buffer
      if (duration > 1500) {
        throw new Error(`Request took ${duration}ms, suggests retries may be happening`);
      }
    }
  },

  // REQ 11: State and stats in response
  {
    requirement: 11,
    name: 'Breaker state and runtime statistics returned in API response',
    fn: async () => {
      await resetBreakers();
      const result = await makeRequest('fast');
      if (!result.stats) {
        throw new Error('Expected stats in response');
      }
      const requiredFields = ['state', 'metrics', 'lastStateChange', 'consecutiveSuccesses', 'currentInFlight', 'config'];
      for (const field of requiredFields) {
        if (!(field in result.stats)) {
          throw new Error(`Missing stats field: ${field}`);
        }
      }
      if (!['CLOSED', 'OPEN', 'HALF_OPEN'].includes(result.stats.state)) {
        throw new Error(`Invalid state: ${result.stats.state}`);
      }
    }
  },

  // REQ 12: Multiple simulated services
  {
    requirement: 12,
    name: 'Fast service responds quickly with success',
    fn: async () => {
      await resetBreakers();
      const start = Date.now();
      const result = await makeRequest('fast', { delay: 50 });
      const duration = Date.now() - start;
      if (result.data.service !== 'fast') {
        throw new Error(`Expected fast service, got ${result.data.service}`);
      }
      if (duration > 1000) {
        throw new Error(`Fast service took ${duration}ms`);
      }
    }
  },
  {
    requirement: 12,
    name: 'Flaky service has configurable failure rate',
    fn: async () => {
      await resetBreakers();
      // Test with 0% failure rate should succeed
      const successResult = await makeRequest('flaky', { failureRate: 0 });
      if (!successResult.data || successResult.data.service !== 'flaky') {
        throw new Error('Flaky service with 0% failure rate should succeed');
      }
    }
  },
  {
    requirement: 12,
    name: 'Slow service has configurable delay',
    fn: async () => {
      await resetBreakers();
      const result = await makeRequest('slow', { delay: 100, timeout: 5000 });
      if (!result.data || result.data.service !== 'slow') {
        throw new Error('Slow service should respond');
      }
    }
  },

  // REQ 13: Server-side logging
  {
    requirement: 13,
    name: 'Circuit breaker state changes are logged on the server',
    fn: async () => {
      await resetBreakers();
      for (let i = 0; i < 10; i++) {
        await makeRequest('flaky', { failureRate: 100, minimumRequestVolume: 3 });
      }
      const eventsResponse = await fetch(`${BASE_URL}/api/breaker/events?seconds=60`);
      const eventsData = await eventsResponse.json();
      const stateChangeEvents = eventsData.events.filter((e: any) => e.eventType === 'STATE_CHANGE');
      if (stateChangeEvents.length < 1) {
        throw new Error('Expected state change events to be logged');
      }
      const event = stateChangeEvents[0];
      if (!event.timestamp || !event.serviceKey || !event.details) {
        throw new Error('State change event missing required fields');
      }
    }
  },

  // REQ 14: UI Dashboard
  {
    requirement: 14,
    name: 'Nuxt 3 UI page serves circuit breaker dashboard',
    fn: async () => {
      const response = await fetch(BASE_URL);
      if (!response.ok) {
        throw new Error(`UI page returned status ${response.status}`);
      }
      const html = await response.text();
      if (!html.toLowerCase().includes('circuit') || !html.toLowerCase().includes('breaker')) {
        throw new Error('UI page does not appear to be circuit breaker dashboard');
      }
    }
  }
];

async function runTest(test: { requirement: number; name: string; fn: TestFunction }): Promise<TestResult> {
  const start = Date.now();
  try {
    await test.fn();
    return {
      requirement: test.requirement,
      name: test.name,
      passed: true,
      duration: Date.now() - start
    };
  } catch (error) {
    return {
      requirement: test.requirement,
      name: test.name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start
    };
  }
}

async function runAllTests(): Promise<TestSummary> {
  console.log(`Running tests against ${BASE_URL}\n`);

  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    process.stdout.write(`REQ ${test.requirement}: ${test.name}... `);
    const result = await runTest(test);
    results.push(result);

    if (result.passed) {
      passed++;
      console.log(`PASSED (${result.duration}ms)`);
    } else {
      failed++;
      console.log(`FAILED: ${result.error}`);
    }

    // Small delay between tests
    await sleep(100);
  }

  const summary: TestSummary = {
    total: tests.length,
    passed,
    failed,
    results,
    timestamp: new Date().toISOString()
  };

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Total: ${summary.total} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`${'='.repeat(60)}`);

  return summary;
}

// Run if executed directly
runAllTests()
  .then(summary => {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.failed > 0 ? 1 : 0);
  })
  .catch(error => {
    console.error('Test runner error:', error);
    process.exit(1);
  });

export { runAllTests, TestResult, TestSummary };
