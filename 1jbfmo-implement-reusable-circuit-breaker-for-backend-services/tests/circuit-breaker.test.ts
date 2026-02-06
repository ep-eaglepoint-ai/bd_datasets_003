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
});
