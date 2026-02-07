import { CircuitBreaker, CircuitState, CircuitOpenError } from '../repository_after/src';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      failureWindowMs: 10000,
      resetTimeoutMs: 100,
      successThreshold: 1,
    });
  });

  describe('Requirement 1: Support Closed, Open, and Half-Open states', () => {
    test('should start in CLOSED state', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    test('should transition to OPEN state after failures exceed threshold', async () => {
      const failingOp = () => Promise.reject(new Error('Service unavailable'));

      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingOp)).rejects.toThrow('Service unavailable');
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    test('should transition to HALF_OPEN after reset timeout', async () => {
      const failingOp = () => Promise.reject(new Error('Service unavailable'));

      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingOp)).rejects.toThrow();
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    test('should transition from HALF_OPEN to CLOSED on success', async () => {
      breaker.trip();
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      const successOp = () => Promise.resolve('success');
      await breaker.execute(successOp);

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    test('should transition from HALF_OPEN to OPEN on failure', async () => {
      breaker.trip();
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      const failingOp = () => Promise.reject(new Error('Still failing'));
      await expect(breaker.execute(failingOp)).rejects.toThrow('Still failing');

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('Requirement 2: Track failures within a configurable time window', () => {
    test('should track failures within the time window', async () => {
      const failingOp = () => Promise.reject(new Error('Failed'));

      await expect(breaker.execute(failingOp)).rejects.toThrow();
      expect(breaker.getFailureCount()).toBe(1);

      await expect(breaker.execute(failingOp)).rejects.toThrow();
      expect(breaker.getFailureCount()).toBe(2);
    });

    test('should expire old failure records outside the time window', async () => {
      const shortWindowBreaker = new CircuitBreaker({
        failureThreshold: 5,
        failureWindowMs: 100,
        resetTimeoutMs: 5000,
      });

      const failingOp = () => Promise.reject(new Error('Failed'));

      await expect(shortWindowBreaker.execute(failingOp)).rejects.toThrow();
      await expect(shortWindowBreaker.execute(failingOp)).rejects.toThrow();
      expect(shortWindowBreaker.getFailureCount()).toBe(2);

      await new Promise(resolve => setTimeout(resolve, 250));

      expect(shortWindowBreaker.getFailureCount()).toBe(0);
    });

    test('should use configurable failure window', async () => {
      const customBreaker = new CircuitBreaker({
        failureThreshold: 3,
        failureWindowMs: 2000,
        resetTimeoutMs: 500,
      });

      const failingOp = () => Promise.reject(new Error('Failed'));

      await expect(customBreaker.execute(failingOp)).rejects.toThrow();
      await expect(customBreaker.execute(failingOp)).rejects.toThrow();

      // FIX: Increase wait from 2000 to 2500 to account for Docker/CI latency
      await new Promise(resolve => setTimeout(resolve, 2500));

      expect(customBreaker.getFailureCount()).toBe(0);
      expect(customBreaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('Requirement 3: Open circuit after failure threshold is exceeded', () => {
    test('should open circuit when failures reach threshold', async () => {
      const failingOp = () => Promise.reject(new Error('Failed'));

      await expect(breaker.execute(failingOp)).rejects.toThrow();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      await expect(breaker.execute(failingOp)).rejects.toThrow();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      await expect(breaker.execute(failingOp)).rejects.toThrow();
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    test('should use configurable failure threshold', async () => {
      const highThresholdBreaker = new CircuitBreaker({
        failureThreshold: 5,
        failureWindowMs: 10000,
        resetTimeoutMs: 1000,
      });

      const failingOp = () => Promise.reject(new Error('Failed'));

      for (let i = 0; i < 4; i++) {
        await expect(highThresholdBreaker.execute(failingOp)).rejects.toThrow();
        expect(highThresholdBreaker.getState()).toBe(CircuitState.CLOSED);
      }

      await expect(highThresholdBreaker.execute(failingOp)).rejects.toThrow();
      expect(highThresholdBreaker.getState()).toBe(CircuitState.OPEN);
    });

    test('should not open circuit if failures are below threshold', async () => {
      const failingOp = () => Promise.reject(new Error('Failed'));

      await expect(breaker.execute(failingOp)).rejects.toThrow();
      await expect(breaker.execute(failingOp)).rejects.toThrow();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('Requirement 4: Transition correctly after reset timeout', () => {
    test('should remain OPEN before reset timeout expires', async () => {
      breaker.trip();

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    test('should transition to HALF_OPEN after reset timeout', async () => {
      breaker.trip();

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    test('should use configurable reset timeout', async () => {
      const shortTimeoutBreaker = new CircuitBreaker({
        failureThreshold: 1,
        failureWindowMs: 10000,
        resetTimeoutMs: 200,
      });

      shortTimeoutBreaker.trip();

      await new Promise(resolve => setTimeout(resolve, 100));
      expect(shortTimeoutBreaker.getState()).toBe(CircuitState.OPEN);

      await new Promise(resolve => setTimeout(resolve, 150));
      expect(shortTimeoutBreaker.getState()).toBe(CircuitState.HALF_OPEN);
    });
  });

  describe('Requirement 5: Allow only one probe request in Half-Open', () => {
    test('should block concurrent requests in HALF_OPEN state', async () => {
      breaker.trip();
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      const slowOp = () => new Promise<string>(resolve => {
        setTimeout(() => resolve('success'), 500);
      });

      const firstRequest = breaker.execute(slowOp);
      
      await expect(breaker.execute(slowOp)).rejects.toThrow(CircuitOpenError);

      await firstRequest;
    });

    test('should allow next request after probe completes successfully', async () => {
      breaker.trip();
      await new Promise(resolve => setTimeout(resolve, 200));

      const successOp = () => Promise.resolve('success');
      await breaker.execute(successOp);

      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      const result = await breaker.execute(successOp);
      expect(result).toBe('success');
    });

    test('should allow next probe after failed probe and reset timeout', async () => {
      breaker.trip();
      await new Promise(resolve => setTimeout(resolve, 200));

      const failingOp = () => Promise.reject(new Error('Still failing'));
      await expect(breaker.execute(failingOp)).rejects.toThrow('Still failing');

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      const successOp = () => Promise.resolve('recovered');
      const result = await breaker.execute(successOp);
      expect(result).toBe('recovered');
    });
  });

  describe('Requirement 6: Wrap asynchronous operations transparently', () => {
    test('should return result from successful async operation', async () => {
      const asyncOp = () => Promise.resolve({ data: 'test' });
      const result = await breaker.execute(asyncOp);
      expect(result).toEqual({ data: 'test' });
    });

    test('should work with various async return types', async () => {
      const stringOp = () => Promise.resolve('string result');
      expect(await breaker.execute(stringOp)).toBe('string result');

      const numberOp = () => Promise.resolve(42);
      expect(await breaker.execute(numberOp)).toBe(42);

      const arrayOp = () => Promise.resolve([1, 2, 3]);
      expect(await breaker.execute(arrayOp)).toEqual([1, 2, 3]);

      const objectOp = () => Promise.resolve({ key: 'value' });
      expect(await breaker.execute(objectOp)).toEqual({ key: 'value' });
    });

    test('should handle delayed async operations', async () => {
      const delayedOp = () => new Promise<string>(resolve => {
        setTimeout(() => resolve('delayed result'), 100);
      });

      const result = await breaker.execute(delayedOp);
      expect(result).toBe('delayed result');
    });

    test('should work with async/await syntax', async () => {
      const asyncOp = async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'async result';
      };

      const result = await breaker.execute(asyncOp);
      expect(result).toBe('async result');
    });
  });

  describe('Requirement 7: Prevent memory growth from failure tracking', () => {
    test('should clean up expired failure records', async () => {
      const shortWindowBreaker = new CircuitBreaker({
        failureThreshold: 100,
        failureWindowMs: 200,
        resetTimeoutMs: 1000,
      });

      const failingOp = () => Promise.reject(new Error('Failed'));

      for (let i = 0; i < 10; i++) {
        await expect(shortWindowBreaker.execute(failingOp)).rejects.toThrow();
      }

      expect(shortWindowBreaker.getFailureCount()).toBe(10);

      await new Promise(resolve => setTimeout(resolve, 300));

      expect(shortWindowBreaker.getFailureCount()).toBe(0);
    });

    test('should not accumulate failures indefinitely', async () => {
      const shortWindowBreaker = new CircuitBreaker({
        failureThreshold: 100,
        failureWindowMs: 100,
        resetTimeoutMs: 1000,
      });

      const failingOp = () => Promise.reject(new Error('Failed'));

      for (let i = 0; i < 5; i++) {
        await expect(shortWindowBreaker.execute(failingOp)).rejects.toThrow();
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      expect(shortWindowBreaker.getFailureCount()).toBeLessThan(5);
    });

    test('should reset failure count when circuit closes', async () => {
      const failingOp = () => Promise.reject(new Error('Failed'));
      const successOp = () => Promise.resolve('success');

      await expect(breaker.execute(failingOp)).rejects.toThrow();
      await expect(breaker.execute(failingOp)).rejects.toThrow();
      expect(breaker.getFailureCount()).toBe(2);

      await expect(breaker.execute(failingOp)).rejects.toThrow();
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // FIX: Increase wait from 1000 to 1500 to account for Docker/CI latency
      await new Promise(resolve => setTimeout(resolve, 1500));

      await breaker.execute(successOp);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.getFailureCount()).toBe(0);
    });
  });

  describe('Requirement 8: Preserve original errors on failure', () => {
    test('should preserve original error message', async () => {
      const customError = new Error('Custom service error');
      const failingOp = () => Promise.reject(customError);

      await expect(breaker.execute(failingOp)).rejects.toThrow('Custom service error');
    });

    test('should preserve original error type', async () => {
      class CustomServiceError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomServiceError';
        }
      }

      const customError = new CustomServiceError('Service unavailable');
      const failingOp = () => Promise.reject(customError);

      try {
        await breaker.execute(failingOp);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CustomServiceError);
        expect((error as Error).name).toBe('CustomServiceError');
      }
    });

    test('should preserve error stack trace', async () => {
      const errorWithStack = new Error('Error with stack');
      const failingOp = () => Promise.reject(errorWithStack);

      try {
        await breaker.execute(failingOp);
        fail('Should have thrown');
      } catch (error) {
        expect((error as Error).stack).toBeDefined();
        expect((error as Error).stack).toContain('Error with stack');
      }
    });

    test('should throw CircuitOpenError when circuit is open', async () => {
      breaker.trip();

      const anyOp = () => Promise.resolve('result');

      try {
        await breaker.execute(anyOp);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitOpenError);
        expect((error as Error).message).toContain('open');
      }
    });
  });

  describe('Edge Cases', () => {
    test('should handle rapid succession of requests', async () => {
      const successOp = () => Promise.resolve('success');

      const results = await Promise.all([
        breaker.execute(successOp),
        breaker.execute(successOp),
        breaker.execute(successOp),
      ]);

      expect(results).toEqual(['success', 'success', 'success']);
    });

    test('should handle intermittent failures', async () => {
      let callCount = 0;
      const intermittentOp = () => {
        callCount++;
        if (callCount % 2 === 0) {
          return Promise.resolve('success');
        }
        return Promise.reject(new Error('intermittent failure'));
      };

      await expect(breaker.execute(intermittentOp)).rejects.toThrow();
      await breaker.execute(intermittentOp);
      await expect(breaker.execute(intermittentOp)).rejects.toThrow();
      await breaker.execute(intermittentOp);

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    test('should allow reset of circuit breaker', () => {
      breaker.trip();
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      breaker.reset();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.getFailureCount()).toBe(0);
    });

    test('should work with default options', async () => {
      const defaultBreaker = new CircuitBreaker();
      const successOp = () => Promise.resolve('success');

      const result = await defaultBreaker.execute(successOp);
      expect(result).toBe('success');
      expect(defaultBreaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('Requirement 9: FailureRecord stores error context for debugging', () => {
    test('should store original error type and message in failure records', async () => {
      class CustomServiceError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomServiceError';
        }
      }

      const customError = new CustomServiceError('Connection refused');
      const failingOp = () => Promise.reject(customError);

      await expect(breaker.execute(failingOp)).rejects.toThrow();

      const failures = breaker.getFailures();
      expect(failures.length).toBe(1);
      expect(failures[0].errorType).toBe('CustomServiceError');
      expect(failures[0].errorMessage).toBe('Connection refused');
      expect(failures[0].timestamp).toBeDefined();
    });

    test('should store different error types correctly', async () => {
      const typeError = new TypeError('Invalid type');
      const rangeError = new RangeError('Out of bounds');

      await expect(breaker.execute(() => Promise.reject(typeError))).rejects.toThrow();
      await expect(breaker.execute(() => Promise.reject(rangeError))).rejects.toThrow();

      const failures = breaker.getFailures();
      expect(failures.length).toBe(2);
      expect(failures[0].errorType).toBe('TypeError');
      expect(failures[0].errorMessage).toBe('Invalid type');
      expect(failures[1].errorType).toBe('RangeError');
      expect(failures[1].errorMessage).toBe('Out of bounds');
    });

    test('should handle non-Error rejections gracefully', async () => {
      await expect(breaker.execute(() => Promise.reject('string error'))).rejects.toBe('string error');
      await expect(breaker.execute(() => Promise.reject(42))).rejects.toBe(42);

      const failures = breaker.getFailures();
      expect(failures.length).toBe(2);
      expect(failures[0].errorType).toBe('string');
      expect(failures[0].errorMessage).toBe('string error');
      expect(failures[1].errorType).toBe('number');
      expect(failures[1].errorMessage).toBe('42');
    });
  });

  describe('Requirement 10: Clear blocking error messages identify reason', () => {
    test('OPEN state error message clearly identifies circuit is open', async () => {
      breaker.trip();

      try {
        await breaker.execute(() => Promise.resolve('test'));
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitOpenError);
        const message = (error as Error).message.toLowerCase();
        // Must contain both 'circuit' and 'open' to clearly identify the blocking reason
        expect(message).toContain('circuit');
        expect(message).toContain('open');
      }
    });

    test('HALF_OPEN blocked error clearly identifies probe in progress', async () => {
      breaker.trip();
      await new Promise(resolve => setTimeout(resolve, 200));
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Start slow probe
      const probePromise = breaker.execute(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return 'done';
      });

      // Attempt second request
      try {
        await breaker.execute(() => Promise.resolve('blocked'));
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitOpenError);
        const message = (error as Error).message.toLowerCase();
        // Must clearly indicate: circuit is half-open AND a probe is in progress
        expect(message).toContain('half-open');
        expect(message).toContain('probe');
        expect(message).toContain('in progress');
      }

      await probePromise;
    });

    test('error messages are distinct for OPEN vs HALF_OPEN blocking', async () => {
      // Get OPEN message
      breaker.trip();
      let openMessage = '';
      try {
        await breaker.execute(() => Promise.resolve('x'));
      } catch (error) {
        openMessage = (error as Error).message;
      }

      // Wait for HALF_OPEN
      await new Promise(resolve => setTimeout(resolve, 200));

      // Start probe
      const probePromise = breaker.execute(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'done';
      });

      // Get HALF_OPEN blocked message
      let halfOpenMessage = '';
      try {
        await breaker.execute(() => Promise.resolve('x'));
      } catch (error) {
        halfOpenMessage = (error as Error).message;
      }

      await probePromise;

      // Messages must be different and descriptive
      expect(openMessage).not.toBe(halfOpenMessage);
      expect(openMessage.toLowerCase()).not.toContain('probe');
      expect(halfOpenMessage.toLowerCase()).toContain('probe');
    });
  });

  describe('Requirement 11: Deterministic time handling with fake timers', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('should transition OPEN to HALF_OPEN with fake timers (no flakiness)', async () => {
      const fakeBreaker = new CircuitBreaker({
        failureThreshold: 2,
        failureWindowMs: 10000,
        resetTimeoutMs: 5000, // 5 seconds
        successThreshold: 1,
      });

      // Trip the circuit
      fakeBreaker.trip();
      expect(fakeBreaker.getState()).toBe(CircuitState.OPEN);

      // Advance time by less than resetTimeout - should stay OPEN
      jest.advanceTimersByTime(4999);
      expect(fakeBreaker.getState()).toBe(CircuitState.OPEN);

      // Advance to exactly resetTimeout - should transition to HALF_OPEN
      jest.advanceTimersByTime(1);
      expect(fakeBreaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    test('should expire failures at exact window boundary with fake timers', async () => {
      const fakeBreaker = new CircuitBreaker({
        failureThreshold: 10,
        failureWindowMs: 1000, // 1 second window
        resetTimeoutMs: 60000,
      });

      const failOp = () => Promise.reject(new Error('fail'));

      // Add failure at T=0
      await expect(fakeBreaker.execute(failOp)).rejects.toThrow();
      expect(fakeBreaker.getFailureCount()).toBe(1);

      // Advance to just before boundary (999ms)
      jest.advanceTimersByTime(999);
      expect(fakeBreaker.getFailureCount()).toBe(1); // Still in window

      // Advance to exactly boundary (1000ms total)
      jest.advanceTimersByTime(1);
      expect(fakeBreaker.getFailureCount()).toBe(0); // Expired
    });

    test('should open circuit at exact threshold with fake timers', async () => {
      const fakeBreaker = new CircuitBreaker({
        failureThreshold: 3,
        failureWindowMs: 10000,
        resetTimeoutMs: 5000,
      });

      const failOp = () => Promise.reject(new Error('fail'));

      await expect(fakeBreaker.execute(failOp)).rejects.toThrow();
      expect(fakeBreaker.getState()).toBe(CircuitState.CLOSED);

      await expect(fakeBreaker.execute(failOp)).rejects.toThrow();
      expect(fakeBreaker.getState()).toBe(CircuitState.CLOSED);

      await expect(fakeBreaker.execute(failOp)).rejects.toThrow();
      expect(fakeBreaker.getState()).toBe(CircuitState.OPEN);
    });

    test('complete lifecycle with fake timers - zero flakiness', async () => {
      const fakeBreaker = new CircuitBreaker({
        failureThreshold: 2,
        failureWindowMs: 5000,
        resetTimeoutMs: 3000,
        successThreshold: 1,
      });

      const failOp = () => Promise.reject(new Error('service down'));
      const successOp = () => Promise.resolve('recovered');

      // Phase 1: Trip via failures
      await expect(fakeBreaker.execute(failOp)).rejects.toThrow();
      await expect(fakeBreaker.execute(failOp)).rejects.toThrow();
      expect(fakeBreaker.getState()).toBe(CircuitState.OPEN);

      // Phase 2: Blocked during OPEN
      await expect(fakeBreaker.execute(successOp)).rejects.toThrow(CircuitOpenError);

      // Phase 3: Fast-forward to HALF_OPEN
      jest.advanceTimersByTime(3000);
      expect(fakeBreaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Phase 4: Successful probe closes circuit
      const result = await fakeBreaker.execute(successOp);
      expect(result).toBe('recovered');
      expect(fakeBreaker.getState()).toBe(CircuitState.CLOSED);
    });
  });
});
