/**
 * Comprehensive Jest tests for Deterministic Retry Scheduler
 */

import { createScheduler, TaskSpec, AttemptResult } from '../repository_after/scheduler';

describe('Deterministic Retry Scheduler', () => {
  
  describe('Task Submission', () => {
    test('submit() accepts valid task', () => {
      const scheduler = createScheduler();
      const result = scheduler.submit({
        taskId: 'task-1',
        maxAttempts: 3,
        baseBackoffMs: 100,
        kind: 'email'
      });
      expect(result).toEqual({ accepted: true });
    });

    test('submit() rejects duplicate taskId', () => {
      const scheduler = createScheduler();
      scheduler.submit({
        taskId: 'task-1',
        maxAttempts: 3,
        baseBackoffMs: 100,
        kind: 'email'
      });
      const result = scheduler.submit({
        taskId: 'task-1',
        maxAttempts: 2,
        baseBackoffMs: 50,
        kind: 'sync'
      });
      expect(result.accepted).toBe(false);
      expect(result.reason).toBeDefined();
    });

    test('submit() rejects invalid maxAttempts', () => {
      const scheduler = createScheduler();
      const result = scheduler.submit({
        taskId: 'task-1',
        maxAttempts: 0,
        baseBackoffMs: 100,
        kind: 'email'
      });
      expect(result.accepted).toBe(false);
      expect(result.reason).toContain('maxAttempts');
    });

    test('submit() rejects negative baseBackoffMs', () => {
      const scheduler = createScheduler();
      const result = scheduler.submit({
        taskId: 'task-1',
        maxAttempts: 2,
        baseBackoffMs: -1,
        kind: 'email'
      });
      expect(result.accepted).toBe(false);
      expect(result.reason).toContain('baseBackoffMs');
    });
  });

  describe('Statistics', () => {
    test('stats() returns correct initial counts', () => {
      const scheduler = createScheduler();
      scheduler.submit({ taskId: 't1', maxAttempts: 2, baseBackoffMs: 100, kind: 'email' });
      scheduler.submit({ taskId: 't2', maxAttempts: 3, baseBackoffMs: 50, kind: 'sync' });
      
      const stats = scheduler.stats();
      expect(stats).toEqual({ queued: 2, inFlight: 0, completed: 0, dead: 0 });
    });

    test('stats() tracks state transitions correctly', () => {
      const scheduler = createScheduler();
      scheduler.submit({ taskId: 't1', maxAttempts: 2, baseBackoffMs: 100, kind: 'email' });
      
      expect(scheduler.stats()).toEqual({ queued: 1, inFlight: 0, completed: 0, dead: 0 });
      
      scheduler.tick(0, 1);
      expect(scheduler.stats()).toEqual({ queued: 0, inFlight: 1, completed: 0, dead: 0 });
      
      scheduler.reportResult('t1', 1, { type: 'ok' });
      expect(scheduler.stats()).toEqual({ queued: 0, inFlight: 0, completed: 1, dead: 0 });
    });
  });

  describe('Tick Behavior', () => {
    test('tick() returns attempts due at or before nowMs', () => {
      const scheduler = createScheduler();
      scheduler.submit({ taskId: 't1', maxAttempts: 2, baseBackoffMs: 100, kind: 'email' });
      scheduler.submit({ taskId: 't2', maxAttempts: 2, baseBackoffMs: 100, kind: 'sync' });
      
      const attempts = scheduler.tick(0, 10);
      expect(attempts).toHaveLength(2);
      expect(attempts.every(a => a.scheduledAtMs === 0)).toBe(true);
    });

    test('tick() respects budget parameter', () => {
      const scheduler = createScheduler();
      scheduler.submit({ taskId: 't1', maxAttempts: 2, baseBackoffMs: 100, kind: 'email' });
      scheduler.submit({ taskId: 't2', maxAttempts: 2, baseBackoffMs: 100, kind: 'sync' });
      scheduler.submit({ taskId: 't3', maxAttempts: 2, baseBackoffMs: 100, kind: 'report' });
      
      const attempts = scheduler.tick(0, 2);
      expect(attempts).toHaveLength(2);
    });

    test('tick() does not return future attempts', () => {
      const scheduler = createScheduler();
      scheduler.submit({ taskId: 't1', maxAttempts: 2, baseBackoffMs: 100, kind: 'email' });
      
      scheduler.tick(0, 1);
      scheduler.reportResult('t1', 1, { type: 'fail', code: 'ERR' });
      
      // Retry scheduled at 100, but we tick at 50
      const attempts = scheduler.tick(50, 10);
      expect(attempts).toHaveLength(0);
    });
  });

  describe('Deterministic Ordering', () => {
    test('tick() orders by scheduledAtMs ascending', () => {
      const scheduler = createScheduler();
      scheduler.submit({ taskId: 't1', maxAttempts: 2, baseBackoffMs: 100, kind: 'email' });
      
      scheduler.tick(0, 1);
      scheduler.reportResult('t1', 1, { type: 'fail', code: 'ERR' });
      
      scheduler.submit({ taskId: 't2', maxAttempts: 2, baseBackoffMs: 50, kind: 'email' });
      
      const attempts = scheduler.tick(150, 10);
      expect(attempts[0].taskId).toBe('t2');
      expect(attempts[1].taskId).toBe('t1');
    });

    test('tick() orders by kind lexicographically when scheduledAtMs equal', () => {
      const scheduler = createScheduler();
      scheduler.submit({ taskId: 't1', maxAttempts: 2, baseBackoffMs: 100, kind: 'sync' });
      scheduler.submit({ taskId: 't2', maxAttempts: 2, baseBackoffMs: 100, kind: 'email' });
      scheduler.submit({ taskId: 't3', maxAttempts: 2, baseBackoffMs: 100, kind: 'report' });
      
      const attempts = scheduler.tick(0, 10);
      expect(attempts[0].taskId).toBe('t2'); // email
      expect(attempts[1].taskId).toBe('t3'); // report
      expect(attempts[2].taskId).toBe('t1'); // sync
    });

    test('tick() orders by taskId lexicographically when kind equal', () => {
      const scheduler = createScheduler();
      scheduler.submit({ taskId: 'task-c', maxAttempts: 2, baseBackoffMs: 100, kind: 'email' });
      scheduler.submit({ taskId: 'task-a', maxAttempts: 2, baseBackoffMs: 100, kind: 'email' });
      scheduler.submit({ taskId: 'task-b', maxAttempts: 2, baseBackoffMs: 100, kind: 'email' });
      
      const attempts = scheduler.tick(0, 10);
      expect(attempts[0].taskId).toBe('task-a');
      expect(attempts[1].taskId).toBe('task-b');
      expect(attempts[2].taskId).toBe('task-c');
    });
  });

  describe('Result Reporting', () => {
    test('reportResult() with success marks task completed', () => {
      const scheduler = createScheduler();
      scheduler.submit({ taskId: 't1', maxAttempts: 3, baseBackoffMs: 100, kind: 'email' });
      
      scheduler.tick(0, 1);
      scheduler.reportResult('t1', 1, { type: 'ok' });
      
      const stats = scheduler.stats();
      expect(stats).toEqual({ queued: 0, inFlight: 0, completed: 1, dead: 0 });
    });

    test('reportResult() with final failure marks task dead', () => {
      const scheduler = createScheduler();
      scheduler.submit({ taskId: 't1', maxAttempts: 2, baseBackoffMs: 100, kind: 'email' });
      
      scheduler.tick(0, 1);
      scheduler.reportResult('t1', 1, { type: 'fail', code: 'ERR' });
      
      scheduler.tick(100, 1);
      scheduler.reportResult('t1', 2, { type: 'fail', code: 'ERR' });
      
      const stats = scheduler.stats();
      expect(stats).toEqual({ queued: 0, inFlight: 0, completed: 0, dead: 1 });
    });

    test('reportResult() safely handles unknown taskId', () => {
      const scheduler = createScheduler();
      expect(() => {
        scheduler.reportResult('unknown', 1, { type: 'ok' });
      }).not.toThrow();
      
      const stats = scheduler.stats();
      expect(stats).toEqual({ queued: 0, inFlight: 0, completed: 0, dead: 0 });
    });

    test('reportResult() safely handles invalid attemptNo', () => {
      const scheduler = createScheduler();
      scheduler.submit({ taskId: 't1', maxAttempts: 2, baseBackoffMs: 100, kind: 'email' });
      
      scheduler.tick(0, 1);
      expect(() => {
        scheduler.reportResult('t1', 5, { type: 'ok' });
      }).not.toThrow();
      
      const stats = scheduler.stats();
      expect(stats.inFlight).toBe(1);
    });

    test('reportResult() safely handles duplicate reports', () => {
      const scheduler = createScheduler();
      scheduler.submit({ taskId: 't1', maxAttempts: 2, baseBackoffMs: 100, kind: 'email' });
      
      scheduler.tick(0, 1);
      scheduler.reportResult('t1', 1, { type: 'ok' });
      scheduler.reportResult('t1', 1, { type: 'ok' });
      scheduler.reportResult('t1', 1, { type: 'fail', code: 'ERR' });
      
      const stats = scheduler.stats();
      expect(stats).toEqual({ queued: 0, inFlight: 0, completed: 1, dead: 0 });
    });

    test('reportResult() handles late results correctly', () => {
      const scheduler = createScheduler();
      scheduler.submit({ taskId: 't1', maxAttempts: 3, baseBackoffMs: 100, kind: 'email' });
      
      scheduler.tick(0, 1);
      scheduler.reportResult('t1', 1, { type: 'fail', code: 'ERR' });
      
      scheduler.tick(100, 1);
      scheduler.reportResult('t1', 2, { type: 'fail', code: 'ERR' });
      
      // Late result for attempt 1 should be ignored
      scheduler.reportResult('t1', 1, { type: 'ok' });
      
      const stats = scheduler.stats();
      expect(stats.queued).toBe(1);
    });

    test('reportResult() handles out-of-order results', () => {
      const scheduler = createScheduler();
      scheduler.submit({ taskId: 't1', maxAttempts: 3, baseBackoffMs: 100, kind: 'email' });
      
      scheduler.tick(0, 1);
      
      // Report result before attempt is emitted (should be ignored)
      expect(() => {
        scheduler.reportResult('t1', 2, { type: 'ok' });
      }).not.toThrow();
      
      const stats = scheduler.stats();
      expect(stats.inFlight).toBe(1);
    });
  });

  describe('Retry Backoff', () => {
    test('Retry uses exponential backoff', () => {
      const scheduler = createScheduler();
      scheduler.submit({ taskId: 't1', maxAttempts: 4, baseBackoffMs: 100, kind: 'email' });
      
      const a1 = scheduler.tick(0, 1);
      expect(a1[0].scheduledAtMs).toBe(0);
      scheduler.reportResult('t1', 1, { type: 'fail', code: 'ERR' });
      
      const a2 = scheduler.tick(100, 1);
      expect(a2[0].scheduledAtMs).toBe(100);
      scheduler.reportResult('t1', 2, { type: 'fail', code: 'ERR' });
      
      const a3 = scheduler.tick(300, 1);
      expect(a3[0].scheduledAtMs).toBe(300);
      scheduler.reportResult('t1', 3, { type: 'fail', code: 'ERR' });
      
      const a4 = scheduler.tick(700, 1);
      expect(a4[0].scheduledAtMs).toBe(700);
    });

    test('Zero baseBackoffMs schedules immediate retry', () => {
      const scheduler = createScheduler();
      scheduler.submit({ taskId: 't1', maxAttempts: 3, baseBackoffMs: 0, kind: 'email' });
      
      scheduler.tick(0, 1);
      scheduler.reportResult('t1', 1, { type: 'fail', code: 'ERR' });
      
      const attempts = scheduler.tick(0, 1);
      expect(attempts).toHaveLength(1);
      expect(attempts[0].attemptNo).toBe(2);
    });

    test('Backoff calculation prevents overflow', () => {
      const scheduler = createScheduler();
      scheduler.submit({ 
        taskId: 't1', 
        maxAttempts: 100, 
        baseBackoffMs: Number.MAX_SAFE_INTEGER / 2, 
        kind: 'email' 
      });
      
      scheduler.tick(0, 1);
      scheduler.reportResult('t1', 1, { type: 'fail', code: 'ERR' });
      
      const attempts = scheduler.tick(Number.MAX_SAFE_INTEGER, 1);
      expect(attempts).toHaveLength(1);
      expect(Number.isSafeInteger(attempts[0].scheduledAtMs)).toBe(true);
    });
  });

  describe('Task Lifecycle', () => {
    test('tick() does not emit attempts for completed tasks', () => {
      const scheduler = createScheduler();
      scheduler.submit({ taskId: 't1', maxAttempts: 3, baseBackoffMs: 100, kind: 'email' });
      
      scheduler.tick(0, 1);
      scheduler.reportResult('t1', 1, { type: 'ok' });
      
      const attempts = scheduler.tick(1000, 10);
      expect(attempts).toHaveLength(0);
    });

    test('tick() does not emit attempts for dead tasks', () => {
      const scheduler = createScheduler();
      scheduler.submit({ taskId: 't1', maxAttempts: 1, baseBackoffMs: 100, kind: 'email' });
      
      scheduler.tick(0, 1);
      scheduler.reportResult('t1', 1, { type: 'fail', code: 'ERR' });
      
      const attempts = scheduler.tick(1000, 10);
      expect(attempts).toHaveLength(0);
    });

    test('Task never exceeds maxAttempts', () => {
      const scheduler = createScheduler();
      scheduler.submit({ taskId: 't1', maxAttempts: 2, baseBackoffMs: 100, kind: 'email' });
      
      scheduler.tick(0, 1);
      scheduler.reportResult('t1', 1, { type: 'fail', code: 'ERR' });
      
      scheduler.tick(100, 1);
      scheduler.reportResult('t1', 2, { type: 'fail', code: 'ERR' });
      
      const attempts = scheduler.tick(1000, 10);
      expect(attempts).toHaveLength(0);
      
      const stats = scheduler.stats();
      expect(stats.dead).toBe(1);
    });
  });

  describe('Snapshot and Restore', () => {
    test('snapshot() returns JSON-serializable object', () => {
      const scheduler = createScheduler();
      scheduler.submit({ taskId: 't1', maxAttempts: 3, baseBackoffMs: 100, kind: 'email' });
      
      const snapshot = scheduler.snapshot();
      const json = JSON.stringify(snapshot);
      const parsed = JSON.parse(json);
      
      expect(parsed).toBeDefined();
      expect(parsed.tasks).toBeDefined();
    });

    test('snapshot() and restore() preserve state', () => {
      const scheduler1 = createScheduler();
      scheduler1.submit({ taskId: 't1', maxAttempts: 3, baseBackoffMs: 100, kind: 'email' });
      scheduler1.submit({ taskId: 't2', maxAttempts: 2, baseBackoffMs: 50, kind: 'sync' });
      
      scheduler1.tick(0, 1);
      scheduler1.reportResult('t1', 1, { type: 'fail', code: 'ERR' });
      
      const snapshot = scheduler1.snapshot();
      
      const scheduler2 = createScheduler();
      scheduler2.restore(snapshot);
      
      const stats1 = scheduler1.stats();
      const stats2 = scheduler2.stats();
      expect(stats2).toEqual(stats1);
    });

    test('Restored scheduler produces identical attempts', () => {
      const scheduler1 = createScheduler();
      scheduler1.submit({ taskId: 't1', maxAttempts: 3, baseBackoffMs: 100, kind: 'email' });
      scheduler1.submit({ taskId: 't2', maxAttempts: 2, baseBackoffMs: 50, kind: 'sync' });
      
      scheduler1.tick(0, 1);
      scheduler1.reportResult('t1', 1, { type: 'fail', code: 'ERR' });
      
      const snapshot = scheduler1.snapshot();
      
      const attempts1 = scheduler1.tick(100, 10);
      
      const scheduler2 = createScheduler();
      scheduler2.restore(snapshot);
      const attempts2 = scheduler2.tick(100, 10);
      
      expect(attempts2).toEqual(attempts1);
    });

    test('Snapshot/restore maintains determinism across complex scenarios', () => {
      const scheduler1 = createScheduler();
      
      // Submit multiple tasks
      scheduler1.submit({ taskId: 'email-1', maxAttempts: 3, baseBackoffMs: 100, kind: 'email' });
      scheduler1.submit({ taskId: 'sync-1', maxAttempts: 2, baseBackoffMs: 200, kind: 'sync' });
      scheduler1.submit({ taskId: 'report-1', maxAttempts: 4, baseBackoffMs: 50, kind: 'report' });
      
      // Process some attempts
      scheduler1.tick(0, 2);
      scheduler1.reportResult('email-1', 1, { type: 'fail', code: 'ERR' });
      scheduler1.reportResult('report-1', 1, { type: 'ok' });
      
      // Take snapshot
      const snapshot = scheduler1.snapshot();
      
      // Continue with scheduler1
      scheduler1.tick(0, 5);
      scheduler1.reportResult('sync-1', 1, { type: 'fail', code: 'ERR' });
      const attempts1 = scheduler1.tick(200, 10);
      
      // Restore and replay with scheduler2
      const scheduler2 = createScheduler();
      scheduler2.restore(snapshot);
      scheduler2.tick(0, 5);
      scheduler2.reportResult('sync-1', 1, { type: 'fail', code: 'ERR' });
      const attempts2 = scheduler2.tick(200, 10);
      
      // Should produce identical results
      expect(attempts2).toEqual(attempts1);
    });
  });
});
