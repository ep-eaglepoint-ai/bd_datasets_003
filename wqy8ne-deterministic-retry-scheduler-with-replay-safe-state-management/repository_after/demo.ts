/**
 * Demo: Deterministic Retry Scheduler with Snapshot/Restore
 */

import { createScheduler } from './scheduler';

console.log('=== Deterministic Retry Scheduler Demo ===\n');

// Create first scheduler instance
const scheduler1 = createScheduler();

// Submit 3 tasks with different kinds
console.log('--- Submitting Tasks ---');
const task1 = scheduler1.submit({
  taskId: 'email-001',
  maxAttempts: 3,
  baseBackoffMs: 100,
  kind: 'email'
});
console.log('Task email-001:', task1);

const task2 = scheduler1.submit({
  taskId: 'sync-001',
  maxAttempts: 2,
  baseBackoffMs: 200,
  kind: 'sync'
});
console.log('Task sync-001:', task2);

const task3 = scheduler1.submit({
  taskId: 'report-001',
  maxAttempts: 4,
  baseBackoffMs: 50,
  kind: 'report'
});
console.log('Task report-001:', task3);

console.log('\nStats after submit:', scheduler1.stats());

// First tick at time 0
console.log('\n--- Tick 1: nowMs=0, budget=2 ---');
const attempts1 = scheduler1.tick(0, 2);
console.log('Emitted attempts:', attempts1);
console.log('Stats:', scheduler1.stats());

// Report failure for first attempt
console.log('\n--- Reporting Results ---');
scheduler1.reportResult('email-001', 1, { type: 'fail', code: 'TIMEOUT' });
console.log('Reported email-001 attempt 1 as failed');

// Note: sync-001 attempt 1 was not emitted yet, so this report will be ignored
scheduler1.reportResult('sync-001', 1, { type: 'fail', code: 'CONNECTION_ERROR' });
console.log('Attempted to report sync-001 attempt 1 as failed (not emitted yet, will be ignored)');

console.log('Stats:', scheduler1.stats());

// Second tick to get remaining task
console.log('\n--- Tick 2: nowMs=0, budget=5 ---');
const attempts2 = scheduler1.tick(0, 5);
console.log('Emitted attempts:', attempts2);
console.log('Stats:', scheduler1.stats());

// Now report sync-001 attempt 1 as failed
scheduler1.reportResult('sync-001', 1, { type: 'fail', code: 'CONNECTION_ERROR' });
console.log('\nReported sync-001 attempt 1 as failed');

// Report success for report-001
scheduler1.reportResult('report-001', 1, { type: 'ok' });
console.log('Reported report-001 attempt 1 as success');
console.log('Stats:', scheduler1.stats());

// Third tick at time 150 (email retry should be due at 100, sync at 200)
console.log('\n--- Tick 3: nowMs=150, budget=5 ---');
const attempts3 = scheduler1.tick(150, 5);
console.log('Emitted attempts:', attempts3);
console.log('Stats:', scheduler1.stats());

// Take snapshot mid-way
console.log('\n--- Taking Snapshot ---');
const snapshot = scheduler1.snapshot();
console.log('Snapshot taken (tasks count):', snapshot.tasks.length);

// Report email-001 attempt 2 as failed
scheduler1.reportResult('email-001', 2, { type: 'fail', code: 'RETRY_FAILED' });
console.log('\nReported email-001 attempt 2 as failed');

// Continue with scheduler1
console.log('\n--- Tick 4 (scheduler1): nowMs=350, budget=5 ---');
const attempts4a = scheduler1.tick(350, 5);
console.log('Emitted attempts:', attempts4a);
console.log('Stats:', scheduler1.stats());

// Report final results
scheduler1.reportResult('sync-001', 2, { type: 'fail', code: 'PERMANENT_ERROR' });
scheduler1.reportResult('email-001', 3, { type: 'ok' });
console.log('\nReported sync-001 attempt 2 as failed (final - task is now dead)');
console.log('Reported email-001 attempt 3 as success');
console.log('Final stats (scheduler1):', scheduler1.stats());

// Now restore snapshot into new scheduler
console.log('\n\n=== Restoring Snapshot into New Scheduler ===\n');
const scheduler2 = createScheduler();
scheduler2.restore(snapshot);
console.log('Stats after restore:', scheduler2.stats());

// Report same result as before
scheduler2.reportResult('email-001', 2, { type: 'fail', code: 'RETRY_FAILED' });
console.log('Reported email-001 attempt 2 as failed');

// Same tick as scheduler1
console.log('\n--- Tick 4 (scheduler2): nowMs=350, budget=5 ---');
const attempts4b = scheduler2.tick(350, 5);
console.log('Emitted attempts:', attempts4b);
console.log('Stats:', scheduler2.stats());

// Verify determinism
console.log('\n--- Verifying Determinism ---');
console.log('Scheduler1 tick 4 attempts:', JSON.stringify(attempts4a));
console.log('Scheduler2 tick 4 attempts:', JSON.stringify(attempts4b));
console.log('Attempts match:', JSON.stringify(attempts4a) === JSON.stringify(attempts4b));

// Complete the restored scheduler
scheduler2.reportResult('sync-001', 2, { type: 'fail', code: 'PERMANENT_ERROR' });
scheduler2.reportResult('email-001', 3, { type: 'ok' });
console.log('\nFinal stats (scheduler2):', scheduler2.stats());

console.log('\n=== Demo Complete ===');
console.log('Both schedulers produced identical attempt sequences after restore!');
