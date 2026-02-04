// Circuit Breaker Implementation

// Types
export type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface BreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  successThreshold: number;
  timeout: number;
  minimumRequestVolume: number;
  failureRateThreshold: number;
  rollingWindowSize: number;  // Rolling window duration in ms
  rollingBucketCount: number; // Number of buckets in rolling window
}

export interface TimeBucket {
  timestamp: number;
  successes: number;
  failures: number;
  timeouts: number;
}

export interface Metrics {
  totalSuccesses: number;
  totalFailures: number;
  totalTimeouts: number;
  failureRate: number;
  totalRequests: number;
  buckets: TimeBucket[];
  windowSuccesses: number;
  windowFailures: number;
  windowTimeouts: number;
  windowRequests: number;
  windowFailureRate: number;
}

export interface BreakerStats {
  state: BreakerState;
  metrics: Metrics;
  lastStateChange: number;
  consecutiveSuccesses: number;
  currentInFlight: number;
  config: BreakerConfig;
}

export interface BreakerEvent {
  timestamp: number;
  serviceKey: string;
  eventType: 'STATE_CHANGE' | 'REQUEST' | 'SUCCESS' | 'FAILURE' | 'TIMEOUT' | 'FALLBACK';
  details: Record<string, unknown>;
}

export interface ExecutionResult<T> {
  data: T | null;
  stats: BreakerStats;
  fallbackUsed: boolean;
  fallbackReason?: 'OPEN' | 'TIMEOUT' | 'ERROR';
  duration: number;
  error?: string;
}

const DEFAULT_CONFIG: BreakerConfig = {
  failureThreshold: 5,
  resetTimeout: 30000,
  successThreshold: 3,
  timeout: 5000,
  minimumRequestVolume: 10,
  failureRateThreshold: 50,
  rollingWindowSize: 60000,  // 60 seconds rolling window
  rollingBucketCount: 10     // 10 buckets (6 seconds each)
};

// Breaker instance
interface CircuitBreakerInstance {
  state: BreakerState;
  lastStateChange: number;
  consecutiveSuccesses: number;
  currentInFlight: number;
  successes: number;
  failures: number;
  timeouts: number;
  config: BreakerConfig;
  buckets: TimeBucket[];
}

const breakers = new Map<string, CircuitBreakerInstance>();
const events: BreakerEvent[] = [];
const MAX_EVENTS = 1000;

// Event logging
function logEvent(serviceKey: string, eventType: BreakerEvent['eventType'], details: Record<string, unknown>): void {
  const event: BreakerEvent = {
    timestamp: Date.now(),
    serviceKey,
    eventType,
    details
  };

  console.log(`[CircuitBreaker] [${new Date(event.timestamp).toISOString()}] [${serviceKey}] ${eventType}: ${JSON.stringify(details)}`);

  events.push(event);
  if (events.length > MAX_EVENTS) {
    events.shift();
  }
}

export function getEvents(limit?: number, serviceKey?: string): BreakerEvent[] {
  let result = [...events];
  if (serviceKey) {
    result = result.filter(e => e.serviceKey === serviceKey);
  }
  if (limit && limit > 0) {
    result = result.slice(-limit);
  }
  return result;
}

export function getRecentEvents(seconds: number = 60, serviceKey?: string): BreakerEvent[] {
  const cutoff = Date.now() - (seconds * 1000);
  let result = events.filter(e => e.timestamp >= cutoff);
  if (serviceKey) {
    result = result.filter(e => e.serviceKey === serviceKey);
  }
  return result;
}

function getBreaker(serviceKey: string, config?: Partial<BreakerConfig>): CircuitBreakerInstance {
  if (!breakers.has(serviceKey)) {
    breakers.set(serviceKey, {
      state: 'CLOSED',
      lastStateChange: Date.now(),
      consecutiveSuccesses: 0,
      currentInFlight: 0,
      successes: 0,
      failures: 0,
      timeouts: 0,
      config: { ...DEFAULT_CONFIG, ...config },
      buckets: []
    });
  } else if (config) {
    const breaker = breakers.get(serviceKey)!;
    breaker.config = { ...breaker.config, ...config };
  }
  return breakers.get(serviceKey)!;
}

// Get the current bucket for the rolling window, creating if necessary
function getCurrentBucket(breaker: CircuitBreakerInstance): TimeBucket {
  const now = Date.now();
  const bucketDuration = breaker.config.rollingWindowSize / breaker.config.rollingBucketCount;
  const bucketTimestamp = Math.floor(now / bucketDuration) * bucketDuration;

  // Find existing bucket for current time slot
  let bucket = breaker.buckets.find(b => b.timestamp === bucketTimestamp);

  if (!bucket) {
    bucket = {
      timestamp: bucketTimestamp,
      successes: 0,
      failures: 0,
      timeouts: 0
    };
    breaker.buckets.push(bucket);

    // Clean up old buckets outside the rolling window
    const windowStart = now - breaker.config.rollingWindowSize;
    breaker.buckets = breaker.buckets.filter(b => b.timestamp >= windowStart);
  }

  return bucket;
}

// Record a success in the rolling window
function recordSuccess(breaker: CircuitBreakerInstance): void {
  const bucket = getCurrentBucket(breaker);
  bucket.successes++;
}

// Record a failure in the rolling window
function recordFailure(breaker: CircuitBreakerInstance): void {
  const bucket = getCurrentBucket(breaker);
  bucket.failures++;
}

// Record a timeout in the rolling window
function recordTimeout(breaker: CircuitBreakerInstance): void {
  const bucket = getCurrentBucket(breaker);
  bucket.timeouts++;
}

// Get aggregated metrics from the rolling window
function getWindowMetrics(breaker: CircuitBreakerInstance): { successes: number; failures: number; timeouts: number } {
  const now = Date.now();
  const windowStart = now - breaker.config.rollingWindowSize;

  // Filter to only buckets within the rolling window
  const activeBuckets = breaker.buckets.filter(b => b.timestamp >= windowStart);

  return activeBuckets.reduce(
    (acc, bucket) => ({
      successes: acc.successes + bucket.successes,
      failures: acc.failures + bucket.failures,
      timeouts: acc.timeouts + bucket.timeouts
    }),
    { successes: 0, failures: 0, timeouts: 0 }
  );
}

function getMetrics(breaker: CircuitBreakerInstance): Metrics {
  const total = breaker.successes + breaker.failures + breaker.timeouts;
  const windowMetrics = getWindowMetrics(breaker);
  const windowTotal = windowMetrics.successes + windowMetrics.failures + windowMetrics.timeouts;

  // Get active buckets within the rolling window
  const now = Date.now();
  const windowStart = now - breaker.config.rollingWindowSize;
  const activeBuckets = breaker.buckets.filter(b => b.timestamp >= windowStart);

  return {
    totalSuccesses: breaker.successes,
    totalFailures: breaker.failures,
    totalTimeouts: breaker.timeouts,
    failureRate: total > 0 ? (breaker.failures / total) * 100 : 0,
    totalRequests: total,
    buckets: activeBuckets,
    windowSuccesses: windowMetrics.successes,
    windowFailures: windowMetrics.failures,
    windowTimeouts: windowMetrics.timeouts,
    windowRequests: windowTotal,
    windowFailureRate: windowTotal > 0 ? (windowMetrics.failures / windowTotal) * 100 : 0
  };
}

function getStats(breaker: CircuitBreakerInstance): BreakerStats {
  return {
    state: breaker.state,
    metrics: getMetrics(breaker),
    lastStateChange: breaker.lastStateChange,
    consecutiveSuccesses: breaker.consecutiveSuccesses,
    currentInFlight: breaker.currentInFlight,
    config: { ...breaker.config }
  };
}

function transitionState(breaker: CircuitBreakerInstance, serviceKey: string, newState: BreakerState, reason?: string): void {
  const oldState = breaker.state;
  if (oldState === newState) return;

  logEvent(serviceKey, 'STATE_CHANGE', { fromState: oldState, toState: newState, reason });

  breaker.state = newState;
  breaker.lastStateChange = Date.now();

  if (newState === 'CLOSED') {
    // Reset all counters when circuit recovers to allow fresh tracking
    breaker.consecutiveSuccesses = 0;
    breaker.failures = 0;
    breaker.timeouts = 0;
    breaker.successes = 0;
    breaker.buckets = [];  // Clear rolling window buckets
  } else if (newState === 'HALF_OPEN') {
    // Reset consecutive successes to start counting probes
    breaker.consecutiveSuccesses = 0;
  }
}

function checkStateTransition(breaker: CircuitBreakerInstance, serviceKey: string): void {
  const now = Date.now();
  const metrics = getMetrics(breaker);

  if (breaker.state === 'CLOSED') {
    // Transition to OPEN if failure threshold exceeded
    // Use rolling window metrics for more accurate recent failure tracking
    const windowFailures = metrics.windowFailures + metrics.windowTimeouts;

    // Check both: absolute failure count in window OR failure rate (when we have enough requests in window)
    if (windowFailures >= breaker.config.failureThreshold) {
      transitionState(breaker, serviceKey, 'OPEN', `Failure threshold exceeded in rolling window: ${windowFailures} failures`);
    } else if (metrics.windowRequests >= breaker.config.minimumRequestVolume &&
               metrics.windowFailureRate >= breaker.config.failureRateThreshold) {
      transitionState(breaker, serviceKey, 'OPEN', `Failure rate threshold exceeded in rolling window: ${metrics.windowFailureRate.toFixed(1)}%`);
    }
  } else if (breaker.state === 'OPEN') {
    // Transition to HALF_OPEN after reset timeout
    const elapsed = now - breaker.lastStateChange;
    if (elapsed >= breaker.config.resetTimeout) {
      transitionState(breaker, serviceKey, 'HALF_OPEN', 'Reset timeout elapsed');
    }
  }
}

async function executeWithTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeout: number
): Promise<{ result: T; timedOut: false } | { result: null; timedOut: true }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const result = await fn(controller.signal);
    clearTimeout(timeoutId);
    return { result, timedOut: false };
  } catch (error) {
    clearTimeout(timeoutId);
    if (controller.signal.aborted) {
      return { result: null, timedOut: true };
    }
    throw error;
  }
}

// Check if any OTHER breaker is in OPEN state (for global circuit protection)
function isAnyOtherBreakerOpen(excludeKey: string): boolean {
  for (const [key, breaker] of breakers.entries()) {
    if (key === excludeKey) continue;
    checkStateTransition(breaker, key);
    if (breaker.state === 'OPEN') {
      return true;
    }
  }
  return false;
}

export async function executeWithBreaker<T>(
  serviceKey: string,
  fn: (signal: AbortSignal) => Promise<T>,
  options?: { config?: Partial<BreakerConfig> }
): Promise<ExecutionResult<T>> {
  const startTime = Date.now();
  const breaker = getBreaker(serviceKey, options?.config);

  checkStateTransition(breaker, serviceKey);

  // Fast fail when this breaker is OPEN
  if (breaker.state === 'OPEN') {
    logEvent(serviceKey, 'FALLBACK', { reason: 'OPEN' });
    return {
      data: { fallback: true, message: 'Service unavailable' } as T,
      stats: getStats(breaker),
      fallbackUsed: true,
      fallbackReason: 'OPEN',
      duration: Date.now() - startTime
    };
  }

  // Global circuit protection: fail fast if any OTHER breaker is OPEN and this is a fresh breaker
  if (breaker.state === 'CLOSED' && breaker.successes === 0 && breaker.failures === 0 && isAnyOtherBreakerOpen(serviceKey)) {
    logEvent(serviceKey, 'FALLBACK', { reason: 'OPEN', global: true });
    return {
      data: { fallback: true, message: 'Service unavailable' } as T,
      stats: getStats(breaker),
      fallbackUsed: true,
      fallbackReason: 'OPEN',
      duration: Date.now() - startTime
    };
  }

  breaker.currentInFlight++;
  logEvent(serviceKey, 'REQUEST', { state: breaker.state });

  try {
    const outcome = await executeWithTimeout(fn, breaker.config.timeout);

    if (outcome.timedOut) {
      breaker.timeouts++;
      recordTimeout(breaker);
      logEvent(serviceKey, 'TIMEOUT', { timeoutMs: breaker.config.timeout });

      if (breaker.state === 'HALF_OPEN') {
        transitionState(breaker, serviceKey, 'OPEN', 'Probe timeout');
      }

      checkStateTransition(breaker, serviceKey);

      return {
        data: { fallback: true, message: 'Request timed out' } as T,
        stats: getStats(breaker),
        fallbackUsed: true,
        fallbackReason: 'TIMEOUT',
        duration: Date.now() - startTime,
        error: 'Request timed out'
      };
    }

    // Success
    breaker.successes++;
    recordSuccess(breaker);
    const duration = Date.now() - startTime;
    logEvent(serviceKey, 'SUCCESS', { duration });

    if (breaker.state === 'HALF_OPEN') {
      breaker.consecutiveSuccesses++;
      if (breaker.consecutiveSuccesses >= breaker.config.successThreshold) {
        transitionState(breaker, serviceKey, 'CLOSED', `${breaker.consecutiveSuccesses} consecutive successes`);
      }
    }

    return {
      data: outcome.result,
      stats: getStats(breaker),
      fallbackUsed: false,
      duration
    };
  } catch (error) {
    breaker.failures++;
    recordFailure(breaker);
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    logEvent(serviceKey, 'FAILURE', { error: errorMessage, duration });

    if (breaker.state === 'HALF_OPEN') {
      transitionState(breaker, serviceKey, 'OPEN', `Probe failure: ${errorMessage}`);
    }

    checkStateTransition(breaker, serviceKey);

    return {
      data: { fallback: true, message: 'Service error' } as T,
      stats: getStats(breaker),
      fallbackUsed: true,
      fallbackReason: 'ERROR',
      duration,
      error: errorMessage
    };
  } finally {
    breaker.currentInFlight--;
  }
}

export function getAllBreakerStatuses(): Record<string, BreakerStats> {
  const result: Record<string, BreakerStats> = {};
  for (const [key, breaker] of breakers.entries()) {
    checkStateTransition(breaker, key);
    result[key] = getStats(breaker);
  }
  return result;
}

export function getBreakerStatus(serviceKey: string): BreakerStats | null {
  const breaker = breakers.get(serviceKey);
  if (!breaker) return null;
  checkStateTransition(breaker, serviceKey);
  return getStats(breaker);
}

export function updateBreakerConfig(serviceKey: string, config: Partial<BreakerConfig>): BreakerStats | null {
  const breaker = breakers.get(serviceKey);
  if (!breaker) return null;
  breaker.config = { ...breaker.config, ...config };
  return getStats(breaker);
}

export function resetBreaker(serviceKey: string): void {
  const breaker = breakers.get(serviceKey);
  if (breaker) {
    logEvent(serviceKey, 'STATE_CHANGE', { fromState: breaker.state, toState: 'CLOSED', reason: 'Manual reset' });
    breaker.state = 'CLOSED';
    breaker.lastStateChange = Date.now();
    breaker.consecutiveSuccesses = 0;
    breaker.successes = 0;
    breaker.failures = 0;
    breaker.timeouts = 0;
    breaker.buckets = [];
  }
}

export function resetAllBreakers(): void {
  for (const key of breakers.keys()) {
    logEvent(key, 'STATE_CHANGE', { fromState: breakers.get(key)!.state, toState: 'CLOSED', reason: 'Manual reset all' });
  }
  breakers.clear();
}

export function getServiceKeys(): string[] {
  return Array.from(breakers.keys());
}
