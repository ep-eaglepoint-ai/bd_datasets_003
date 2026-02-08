import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueManager } from '../repository_after/QueueManager';   // ← adjust path if src/ is flattened

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('QueueManager', () => {
  let q: QueueManager;

  beforeEach(() => {
    q = new QueueManager(3);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('respects maxConcurrency limit — never more than 3 active', async () => {
    const activeAt: number[] = [];

    for (let i = 0; i < 12; i++) {
      q.addJob(async () => {
        activeAt.push(q.getStatus().executing);
        await delay(100);
      });
    }

    // Fast-forward and sample multiple points
    await vi.advanceTimersByTimeAsync(10);
    expect(q.getStatus().executing).toBe(3);

    await vi.advanceTimersByTimeAsync(150);
    expect(q.getStatus().executing).toBe(3);

    await vi.advanceTimersByTimeAsync(400);
    expect(q.getStatus().executing).toBe(3);

    await vi.runAllTimersAsync();
    expect(q.getStatus().executing).toBe(0);
    expect(activeAt.every(n => n <= 3)).toBe(true);
  });

  it('starts next job immediately when a slot frees up (no stutter gap)', async () => {
    const startOrder: number[] = [];

    q.addJob(async () => { await delay(0);   startOrder.push(1); });
    q.addJob(async () => { await delay(80);  startOrder.push(2); });
    q.addJob(async () => { await delay(0);   startOrder.push(3); });
    q.addJob(async () => { await delay(40);  startOrder.push(4); });

    await vi.advanceTimersByTimeAsync(5);
    expect(q.getStatus().executing).toBe(3);   // 1,3 started instantly + 2

    await vi.advanceTimersByTimeAsync(85);
    expect(q.getStatus().executing).toBe(2);   // 4 should have started right after 2 finished
    expect(startOrder).toEqual([1, 3, 2, 4]);
  });

  it('pause prevents new jobs but lets in-flight finish', async () => {
    const completed: string[] = [];

    for (let i = 1; i <= 6; i++) {
      const id = `job-${i}`;
      q.addJob(async () => {
        await delay(120);
        completed.push(id);
      }, id);
    }

    await vi.advanceTimersByTimeAsync(50);
    expect(q.getStatus().executing).toBe(3);
    expect(q.getStatus().pending).toBe(3);

    q.pause();

    await vi.advanceTimersByTimeAsync(200);
    expect(q.getStatus().executing).toBe(0);
    expect(q.getStatus().pending).toBe(3);     // still 3 waiting
    expect(completed.length).toBe(3);          // first batch finished

    q.resume();

    await vi.advanceTimersByTimeAsync(50);
    expect(q.getStatus().executing).toBe(3);

    await vi.runAllTimersAsync();
    expect(completed.length).toBe(6);
  });

  it('handles microtasks / Promise.resolve() without concurrency under/overflow', async () => {
    const q2 = new QueueManager(2);
    const started = vi.fn();

    for (let i = 0; i < 8; i++) {
      q2.addJob(async () => {
        started();
        await Promise.resolve(); // microtask / 0ms
      });
    }

    await vi.advanceTimersByTimeAsync(1); // just one tick
    expect(started).toHaveBeenCalledTimes(2);

    await vi.runAllMicrotasks(); // flush remaining microtasks
    expect(q2.getStatus().executing).toBe(0);
    expect(started).toHaveBeenCalledTimes(8);
  });
});