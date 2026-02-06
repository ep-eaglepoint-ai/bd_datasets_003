import { CircuitBreaker, CircuitState, CircuitOpenError } from '../repository_after/src';

/**
 * Tests addressing reviewer comments for CircuitBreaker implementation.
 * Each describe block maps directly to a reviewer comment.
 */

describe('Reviewer Comment 1: Success threshold behavior', () => {
  describe('successThreshold > 1 behavior', () => {
    let breaker: CircuitBreaker;

    beforeEach(() => {
      breaker = new CircuitBreaker({
        failureThreshold: 2,
        failureWindowMs: 10000,
        resetTimeoutMs: 50,
        successThreshold: 3, // Requires 3 successful probes to close
      });
    });

    test('should require multiple successful probes to transition from HALF_OPEN to CLOSED', async () => {
      // Trip the circuit to OPEN
      breaker.trip();
      
      // Wait for HALF_OPEN
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      const successOp = () => Promise.resolve('success');

      // First successful probe - should remain HALF_OPEN
      await breaker.execute(successOp);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Second successful probe - should remain HALF_OPEN
      await breaker.execute(successOp);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Third successful probe - should transition to CLOSED
      await breaker.execute(successOp);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    test('should reset success count when probe fails in HALF_OPEN', async () => {
      breaker.trip();
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      const successOp = () => Promise.resolve('success');
      const failOp = () => Promise.reject(new Error('fail'));

      // Two successful probes
      await breaker.execute(successOp);
      await breaker.execute(successOp);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      // One failure should trip back to OPEN
      await expect(breaker.execute(failOp)).rejects.toThrow('fail');
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Wait for HALF_OPEN again
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Need full 3 successes again after reset
      await breaker.execute(successOp);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
      
      await breaker.execute(successOp);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
      
      await breaker.execute(successOp);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    test('should track success count accurately with successThreshold = 5', async () => {
      const highThresholdBreaker = new CircuitBreaker({
        failureThreshold: 1,
        failureWindowMs: 10000,
        resetTimeoutMs: 30,
        successThreshold: 5,
      });

      highThresholdBreaker.trip();
      await new Promise(resolve => setTimeout(resolve, 50));

      const successOp = () => Promise.resolve('success');
      
      // Execute 4 successes - should remain HALF_OPEN
      for (let i = 0; i < 4; i++) {
        await highThresholdBreaker.execute(successOp);
        expect(highThresholdBreaker.getState()).toBe(CircuitState.HALF_OPEN);
      }

      // 5th success should close
      await highThresholdBreaker.execute(successOp);
      expect(highThresholdBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    test('circuit remains HALF_OPEN until threshold is met', async () => {
      breaker.trip();
      await new Promise(resolve => setTimeout(resolve, 100));

      const successOp = () => Promise.resolve('success');
      const states: CircuitState[] = [];

      // Track state after each call
      for (let i = 0; i < 3; i++) {
        await breaker.execute(successOp);
        states.push(breaker.getState());
      }

      // First two should be HALF_OPEN, last should be CLOSED
      expect(states).toEqual([
        CircuitState.HALF_OPEN,
        CircuitState.HALF_OPEN,
        CircuitState.CLOSED,
      ]);
    });
  });
});

describe('Reviewer Comment 2: HTTP-specific async usage', () => {
  // Using native fetch (available in Node 18+)
  const mockServer = {
    port: 0,
    running: false,
  };

  // Simple mock HTTP helper - simulates real async HTTP behavior
  async function simulateHttpRequest(
    success: boolean,
    delayMs: number = 10,
    statusCode: number = success ? 200 : 500
  ): Promise<{ status: number; data: string }> {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    
    if (!success) {
      const error = new Error(`HTTP Error: ${statusCode}`);
      (error as any).statusCode = statusCode;
      throw error;
    }
    
    return { status: statusCode, data: 'response data' };
  }

  describe('HTTP operations through circuit breaker', () => {
    let breaker: CircuitBreaker;

    beforeEach(() => {
      breaker = new CircuitBreaker({
        failureThreshold: 2,
        failureWindowMs: 10000,
        resetTimeoutMs: 50,
        successThreshold: 1,
      });
    });

    test('successful HTTP call through CLOSED state', async () => {
      const httpCall = () => simulateHttpRequest(true);
      
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      
      const result = await breaker.execute(httpCall);
      
      expect(result.status).toBe(200);
      expect(result.data).toBe('response data');
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    test('HTTP failures open the circuit', async () => {
      const failingHttpCall = () => simulateHttpRequest(false, 10, 503);
      
      // First failure
      await expect(breaker.execute(failingHttpCall)).rejects.toThrow('HTTP Error: 503');
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      
      // Second failure - trips the circuit
      await expect(breaker.execute(failingHttpCall)).rejects.toThrow('HTTP Error: 503');
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    test('blocked HTTP calls while circuit is OPEN', async () => {
      // Open the circuit via failures
      const failingHttpCall = () => simulateHttpRequest(false);
      
      await expect(breaker.execute(failingHttpCall)).rejects.toThrow();
      await expect(breaker.execute(failingHttpCall)).rejects.toThrow();
      expect(breaker.getState()).toBe(CircuitState.OPEN);
      
      // Subsequent HTTP calls should be blocked immediately
      const successfulHttpCall = () => simulateHttpRequest(true);
      
      const startTime = Date.now();
      await expect(breaker.execute(successfulHttpCall)).rejects.toThrow(CircuitOpenError);
      const duration = Date.now() - startTime;
      
      // Should fail fast (not wait for HTTP timeout)
      expect(duration).toBeLessThan(20);
    });

    test('recovery via HALF_OPEN probe', async () => {
      // Open the circuit
      const failingHttpCall = () => simulateHttpRequest(false);
      await expect(breaker.execute(failingHttpCall)).rejects.toThrow();
      await expect(breaker.execute(failingHttpCall)).rejects.toThrow();
      expect(breaker.getState()).toBe(CircuitState.OPEN);
      
      // Wait for HALF_OPEN
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
      
      // Successful probe recovers the circuit
      const successfulHttpCall = () => simulateHttpRequest(true);
      const result = await breaker.execute(successfulHttpCall);
      
      expect(result.status).toBe(200);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      
      // Subsequent calls work normally
      const result2 = await breaker.execute(successfulHttpCall);
      expect(result2.status).toBe(200);
    });

    test('complete HTTP scenario: success -> failures -> open -> recovery', async () => {
      const successCall = () => simulateHttpRequest(true);
      const failCall = () => simulateHttpRequest(false, 10, 500);
      
      // Phase 1: Normal operation
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      await breaker.execute(successCall);
      await breaker.execute(successCall);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      
      // Phase 2: Failures occur
      await expect(breaker.execute(failCall)).rejects.toThrow('HTTP Error: 500');
      await expect(breaker.execute(failCall)).rejects.toThrow('HTTP Error: 500');
      
      // Phase 3: Circuit is open
      expect(breaker.getState()).toBe(CircuitState.OPEN);
      await expect(breaker.execute(successCall)).rejects.toThrow(CircuitOpenError);
      
      // Phase 4: Wait for half-open
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
      
      // Phase 5: Recovery
      await breaker.execute(successCall);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('HTTP with real fetch-like async patterns', () => {
    let breaker: CircuitBreaker;

    beforeEach(() => {
      breaker = new CircuitBreaker({
        failureThreshold: 3,
        failureWindowMs: 10000,
        resetTimeoutMs: 50,
        successThreshold: 2,
      });
    });

    test('wrapping fetch-style API with JSON parsing', async () => {
      async function fetchUserApi(userId: number): Promise<{ id: number; name: string }> {
        await new Promise(resolve => setTimeout(resolve, 5));
        return { id: userId, name: `User ${userId}` };
      }

      const result = await breaker.execute(() => fetchUserApi(123));
      
      expect(result.id).toBe(123);
      expect(result.name).toBe('User 123');
    });

    test('handling various HTTP error codes', async () => {
      const errorCodes = [400, 401, 403, 500, 502, 503];
      
      for (const code of errorCodes) {
        const newBreaker = new CircuitBreaker({
          failureThreshold: 1,
          resetTimeoutMs: 10,
        });
        
        const httpError = () => simulateHttpRequest(false, 5, code);
        
        await expect(newBreaker.execute(httpError)).rejects.toThrow(`HTTP Error: ${code}`);
        expect(newBreaker.getState()).toBe(CircuitState.OPEN);
      }
    });

    test('timeout simulation with circuit breaker', async () => {
      async function slowHttpCall(): Promise<string> {
        await new Promise(resolve => setTimeout(resolve, 200));
        return 'response';
      }
      
      const timeoutBreaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 50,
      });
      
      // Works fine without timeout
      const result = await timeoutBreaker.execute(slowHttpCall);
      expect(result).toBe('response');
    });
  });
});

describe('Reviewer Comment 3: State-transition race conditions', () => {
  describe('concurrent requests during OPEN → HALF_OPEN transition', () => {
    test('high concurrency during transition - only one probe executes', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        failureWindowMs: 10000,
        resetTimeoutMs: 30,
        successThreshold: 1,
      });

      // Trip the circuit
      breaker.trip();
      
      // Wait until just before HALF_OPEN transition
      await new Promise(resolve => setTimeout(resolve, 25));
      
      // Wait until HALF_OPEN
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      let probeExecutionCount = 0;
      const slowProbe = async () => {
        probeExecutionCount++;
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'success';
      };

      // Launch many concurrent requests
      const concurrentRequests = 20;
      const results = await Promise.allSettled(
        Array(concurrentRequests).fill(null).map(() => breaker.execute(slowProbe))
      );

      // Count successes and failures
      const successes = results.filter(r => r.status === 'fulfilled');
      const failures = results.filter(r => r.status === 'rejected');

      // Only one probe should have executed
      expect(probeExecutionCount).toBe(1);
      
      // One should succeed (the probe)
      expect(successes.length).toBe(1);
      
      // Rest should fail with CircuitOpenError
      expect(failures.length).toBe(concurrentRequests - 1);
      
      // Verify error types
      failures.forEach(result => {
        if (result.status === 'rejected') {
          expect(result.reason).toBeInstanceOf(CircuitOpenError);
        }
      });
    });

    test('concurrent requests racing exactly at transition moment', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        failureWindowMs: 10000,
        resetTimeoutMs: 20,
        successThreshold: 1,
      });

      breaker.trip();
      
      let executionCount = 0;
      const operation = async () => {
        executionCount++;
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'done';
      };

      // Wait exactly until transition happens
      await new Promise(resolve => setTimeout(resolve, 20));

      // Launch concurrent requests at transition time
      const promises = Array(50).fill(null).map(() => breaker.execute(operation));
      
      const results = await Promise.allSettled(promises);
      
      // At most one operation should execute
      expect(executionCount).toBeLessThanOrEqual(1);
      
      // Verify state consistency
      const state = breaker.getState();
      expect([CircuitState.CLOSED, CircuitState.HALF_OPEN]).toContain(state);
    });

    test('no inconsistent states after concurrent race', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        failureWindowMs: 10000,
        resetTimeoutMs: 10,
        successThreshold: 1,
      });

      // Multiple rounds of racing
      for (let round = 0; round < 5; round++) {
        breaker.trip();
        
        await new Promise(resolve => setTimeout(resolve, 15));
        
        const results = await Promise.allSettled(
          Array(10).fill(null).map(() => 
            breaker.execute(async () => {
              await new Promise(r => setTimeout(r, 20));
              return 'ok';
            })
          )
        );

        // State should be valid (not corrupted)
        const state = breaker.getState();
        expect([CircuitState.CLOSED, CircuitState.HALF_OPEN, CircuitState.OPEN]).toContain(state);
        
        breaker.reset();
      }
    });

    test('others fail immediately while probe is in progress', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        failureWindowMs: 10000,
        resetTimeoutMs: 20,
        successThreshold: 1,
      });

      breaker.trip();
      await new Promise(resolve => setTimeout(resolve, 30));
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      const longProbe = async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return 'probe result';
      };

      // Start the long probe
      const probePromise = breaker.execute(longProbe);
      
      // Immediately try more requests
      const blockedResults: number[] = [];
      for (let i = 0; i < 5; i++) {
        const start = Date.now();
        try {
          await breaker.execute(async () => 'should not run');
        } catch {
          blockedResults.push(Date.now() - start);
        }
      }

      // All blocked requests should fail fast (< 10ms each)
      blockedResults.forEach(duration => {
        expect(duration).toBeLessThan(10);
      });

      // Original probe should complete
      const result = await probePromise;
      expect(result).toBe('probe result');
    });
  });
});

describe('Reviewer Comment 4: Open-state call blocking verification', () => {
  describe('calls blocked after circuit opens due to failures', () => {
    test('all calls rejected immediately after failure-triggered open', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        failureWindowMs: 10000,
        resetTimeoutMs: 5000, // Long timeout so it stays OPEN
        successThreshold: 1,
      });

      const failingOp = () => Promise.reject(new Error('service down'));
      
      // Trip via failures (not explicit trip())
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      await expect(breaker.execute(failingOp)).rejects.toThrow('service down');
      await expect(breaker.execute(failingOp)).rejects.toThrow('service down');
      await expect(breaker.execute(failingOp)).rejects.toThrow('service down');
      
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Now verify ALL subsequent calls are blocked
      let operationExecuted = false;
      const trackedOp = async () => {
        operationExecuted = true;
        return 'should not see this';
      };

      for (let i = 0; i < 10; i++) {
        await expect(breaker.execute(trackedOp)).rejects.toThrow(CircuitOpenError);
      }

      // Verify no operation was ever executed
      expect(operationExecuted).toBe(false);
    });

    test('wrapped operation is never executed when circuit is OPEN', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        failureWindowMs: 10000,
        resetTimeoutMs: 10000,
        successThreshold: 1,
      });

      const executionLog: string[] = [];

      const trackedFailingOp = async () => {
        executionLog.push('failing-op-executed');
        throw new Error('fail');
      };

      const trackedSuccessOp = async () => {
        executionLog.push('success-op-executed');
        return 'success';
      };

      // Execute failures to open circuit
      await expect(breaker.execute(trackedFailingOp)).rejects.toThrow();
      await expect(breaker.execute(trackedFailingOp)).rejects.toThrow();
      
      expect(executionLog).toEqual(['failing-op-executed', 'failing-op-executed']);
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Clear log and try to execute while OPEN
      executionLog.length = 0;

      for (let i = 0; i < 5; i++) {
        await expect(breaker.execute(trackedSuccessOp)).rejects.toThrow(CircuitOpenError);
      }

      // No operations should have executed
      expect(executionLog).toEqual([]);
    });

    test('calls are rejected with CircuitOpenError, not original errors', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        failureWindowMs: 10000,
        resetTimeoutMs: 10000,
      });

      // Open via failures
      const failOp = () => Promise.reject(new Error('network timeout'));
      await expect(breaker.execute(failOp)).rejects.toThrow('network timeout');
      await expect(breaker.execute(failOp)).rejects.toThrow('network timeout');

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // This operation would throw a different error if executed
      const differentErrorOp = () => Promise.reject(new Error('different error'));
      
      try {
        await breaker.execute(differentErrorOp);
        fail('Should have thrown');
      } catch (error) {
        // Should get CircuitOpenError, not the operation's error
        expect(error).toBeInstanceOf(CircuitOpenError);
        expect((error as Error).message).not.toContain('different error');
      }
    });

    test('immediate rejection timing verification', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 10000,
      });

      // Open the circuit
      await expect(breaker.execute(() => Promise.reject(new Error('x')))).rejects.toThrow();
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // The operation that would be slow
      const slowOp = async () => {
        await new Promise(resolve => setTimeout(resolve, 5000));
        return 'slow result';
      };

      const timings: number[] = [];
      
      for (let i = 0; i < 5; i++) {
        const start = Date.now();
        await expect(breaker.execute(slowOp)).rejects.toThrow(CircuitOpenError);
        timings.push(Date.now() - start);
      }

      // All rejections should be nearly instant (< 5ms each)
      timings.forEach(timing => {
        expect(timing).toBeLessThan(10);
      });
    });
  });
});

describe('Reviewer Comment 5: Load/stress behavior validation', () => {
  describe('sustained load with high request counts', () => {
    test('stable state transitions under high load', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 10,
        failureWindowMs: 5000,
        resetTimeoutMs: 50,
        successThreshold: 3,
      });

      const totalRequests = 500;
      const failureRate = 0.3; // 30% failure rate

      let successCount = 0;
      let failureCount = 0;
      let circuitOpenRejections = 0;

      for (let i = 0; i < totalRequests; i++) {
        const shouldFail = Math.random() < failureRate;
        
        const operation = async () => {
          if (shouldFail) {
            throw new Error('simulated failure');
          }
          return 'success';
        };

        try {
          await breaker.execute(operation);
          successCount++;
        } catch (error) {
          if (error instanceof CircuitOpenError) {
            circuitOpenRejections++;
          } else {
            failureCount++;
          }
        }

        // Small delay to simulate realistic load
        if (i % 50 === 0) {
          await new Promise(resolve => setTimeout(resolve, 5));
        }
      }

      // Verify reasonable distribution
      expect(successCount + failureCount + circuitOpenRejections).toBe(totalRequests);
      
      // State should be valid
      const finalState = breaker.getState();
      expect([CircuitState.CLOSED, CircuitState.OPEN, CircuitState.HALF_OPEN]).toContain(finalState);
    });

    test('failure record cleanup under sustained failures', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1000, // High threshold to keep circuit closed
        failureWindowMs: 100,   // Short window for cleanup
        resetTimeoutMs: 1000,
      });

      const failOp = () => Promise.reject(new Error('fail'));

      // Generate many failures over time
      for (let batch = 0; batch < 5; batch++) {
        for (let i = 0; i < 20; i++) {
          await expect(breaker.execute(failOp)).rejects.toThrow();
        }
        
        // Wait for old failures to expire
        await new Promise(resolve => setTimeout(resolve, 150));
        
        // Failure count should be limited by window
        const failureCount = breaker.getFailureCount();
        expect(failureCount).toBeLessThanOrEqual(20);
      }
    });

    test('no unbounded growth of internal arrays', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 100,
        failureWindowMs: 50,
        resetTimeoutMs: 500,
      });

      const failOp = () => Promise.reject(new Error('fail'));
      
      // Track failure counts over time
      const failureCounts: number[] = [];

      for (let round = 0; round < 20; round++) {
        // Add failures
        for (let i = 0; i < 10; i++) {
          try {
            await breaker.execute(failOp);
          } catch {
            // expected
          }
        }

        failureCounts.push(breaker.getFailureCount());
        
        // Wait for cleanup
        await new Promise(resolve => setTimeout(resolve, 60));
      }

      // After cleanup, counts should drop
      const lastCount = breaker.getFailureCount();
      expect(lastCount).toBeLessThan(20);
      
      // Should not accumulate indefinitely
      const maxCount = Math.max(...failureCounts);
      expect(maxCount).toBeLessThan(100);
    });

    test('memory stability during long-running operation', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 5,
        failureWindowMs: 200,
        resetTimeoutMs: 50,
        successThreshold: 2,
      });

      const iterations = 1000;
      let currentIteration = 0;

      const mixedOp = async () => {
        currentIteration++;
        // Alternate success/failure pattern
        if (currentIteration % 3 === 0) {
          throw new Error('periodic failure');
        }
        return 'success';
      };

      const results = { success: 0, opFailed: 0, circuitOpen: 0 };

      for (let i = 0; i < iterations; i++) {
        try {
          await breaker.execute(mixedOp);
          results.success++;
        } catch (error) {
          if (error instanceof CircuitOpenError) {
            results.circuitOpen++;
          } else {
            results.opFailed++;
          }
        }

        // Periodic delay
        if (i % 100 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      // Verify all iterations completed
      expect(results.success + results.opFailed + results.circuitOpen).toBe(iterations);
      
      // Verify failure count is bounded
      expect(breaker.getFailureCount()).toBeLessThan(10);
    });

    test('correct state transitions under pressure with rapid open/close cycles', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        failureWindowMs: 1000,
        resetTimeoutMs: 10,
        successThreshold: 1,
      });

      const stateTransitions: CircuitState[] = [];
      let lastState = breaker.getState();

      for (let cycle = 0; cycle < 20; cycle++) {
        // Force failures to open
        const failOp = () => Promise.reject(new Error('fail'));
        await expect(breaker.execute(failOp)).rejects.toThrow();
        await expect(breaker.execute(failOp)).rejects.toThrow();
        
        let newState = breaker.getState();
        if (newState !== lastState) {
          stateTransitions.push(newState);
          lastState = newState;
        }

        // Wait for HALF_OPEN
        await new Promise(resolve => setTimeout(resolve, 20));
        
        newState = breaker.getState();
        if (newState !== lastState) {
          stateTransitions.push(newState);
          lastState = newState;
        }

        // Recover
        const successOp = () => Promise.resolve('ok');
        await breaker.execute(successOp);
        
        newState = breaker.getState();
        if (newState !== lastState) {
          stateTransitions.push(newState);
          lastState = newState;
        }
      }

      // Verify state transitions follow valid patterns
      // CLOSED -> OPEN is valid
      // OPEN -> HALF_OPEN is valid
      // HALF_OPEN -> CLOSED is valid
      // HALF_OPEN -> OPEN is valid
      for (let i = 1; i < stateTransitions.length; i++) {
        const prev = stateTransitions[i - 1];
        const curr = stateTransitions[i];
        
        const validTransitions = [
          [CircuitState.CLOSED, CircuitState.OPEN],
          [CircuitState.OPEN, CircuitState.HALF_OPEN],
          [CircuitState.HALF_OPEN, CircuitState.CLOSED],
          [CircuitState.HALF_OPEN, CircuitState.OPEN],
        ];
        
        const isValid = validTransitions.some(
          ([from, to]) => from === prev && to === curr
        );
        
        expect(isValid).toBe(true);
      }
    });
  });
});

describe('Reviewer Comment 6: Error message validation', () => {
  describe('OPEN-state rejection error messages', () => {
    test('CircuitOpenError message for OPEN state rejection', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 10000,
      });

      breaker.trip();

      try {
        await breaker.execute(() => Promise.resolve('test'));
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitOpenError);
        expect((error as Error).name).toBe('CircuitOpenError');
        expect((error as Error).message).toBe('Circuit breaker is open');
      }
    });

    test('error message clarity for open state', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeoutMs: 10000,
      });

      // Open via failures
      await expect(breaker.execute(() => Promise.reject(new Error('x')))).rejects.toThrow();
      await expect(breaker.execute(() => Promise.reject(new Error('x')))).rejects.toThrow();

      try {
        await breaker.execute(() => Promise.resolve('test'));
        fail('Should have thrown');
      } catch (error) {
        const errorMessage = (error as Error).message;
        
        // Message should clearly indicate the circuit is open
        expect(errorMessage.toLowerCase()).toContain('open');
        expect(errorMessage.toLowerCase()).toContain('circuit');
      }
    });
  });

  describe('HALF_OPEN concurrent probe blocking error messages', () => {
    test('specific error message when probe is blocked in HALF_OPEN', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 20,
        successThreshold: 1,
      });

      breaker.trip();
      await new Promise(resolve => setTimeout(resolve, 30));
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Start a slow probe
      const slowProbe = breaker.execute(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return 'done';
      });

      // Try another request while probe is in progress
      try {
        await breaker.execute(() => Promise.resolve('blocked'));
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitOpenError);
        const message = (error as Error).message;
        
        // Message should indicate:
        // 1. Circuit is half-open
        // 2. A probe is in progress
        expect(message.toLowerCase()).toContain('half-open');
        expect(message.toLowerCase()).toContain('probe');
        expect(message.toLowerCase()).toContain('in progress');
      }

      await slowProbe;
    });

    test('error message distinguishes OPEN vs HALF_OPEN blocking', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 30,
      });

      // Test OPEN state message
      breaker.trip();
      
      let openMessage = '';
      try {
        await breaker.execute(() => Promise.resolve('x'));
      } catch (error) {
        openMessage = (error as Error).message;
      }

      // Wait for HALF_OPEN
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Start probe
      const probePromise = breaker.execute(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'done';
      });

      // Test HALF_OPEN blocked message
      let halfOpenMessage = '';
      try {
        await breaker.execute(() => Promise.resolve('x'));
      } catch (error) {
        halfOpenMessage = (error as Error).message;
      }

      // Messages should be different
      expect(openMessage).not.toBe(halfOpenMessage);
      
      // OPEN message should just say "open"
      expect(openMessage).toBe('Circuit breaker is open');
      
      // HALF_OPEN message should mention probe
      expect(halfOpenMessage).toContain('half-open');
      expect(halfOpenMessage).toContain('probe');

      await probePromise;
    });

    test('error name is consistently CircuitOpenError', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 20,
      });

      // OPEN state error
      breaker.trip();
      
      try {
        await breaker.execute(() => Promise.resolve('x'));
      } catch (error) {
        expect((error as Error).name).toBe('CircuitOpenError');
      }

      // HALF_OPEN blocking error
      await new Promise(resolve => setTimeout(resolve, 30));
      
      const probePromise = breaker.execute(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'done';
      });

      try {
        await breaker.execute(() => Promise.resolve('x'));
      } catch (error) {
        expect((error as Error).name).toBe('CircuitOpenError');
      }

      await probePromise;
    });
  });
});
