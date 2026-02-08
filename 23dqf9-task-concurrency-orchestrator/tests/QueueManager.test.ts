import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueueManager } from '../repository_after/src/QueueManager';

describe('QueueManager', () => {
  let q: QueueManager;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    q = new QueueManager(3);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('respects maxConcurrency limit — never more than 3 active', async () => {
    const activeAt: number[] = [];

    for (let i = 0; i < 12; i++) {
      q.addJob(async () => {
        
        activeAt.push(q.getStatus().executing);
        await new Promise(res => setTimeout(res, 1000));
      });
    }

    
    await vi.advanceTimersByTimeAsync(0);
    expect(q.getStatus().executing).toBe(3);

    
    await vi.advanceTimersByTimeAsync(1500);
    expect(q.getStatus().executing).toBe(3);

    
    await vi.runAllTimersAsync();
    
    expect(q.getStatus().executing).toBe(0);
    expect(q.getStatus().pending).toBe(0);
    expect(activeAt.every(n => n <= 3)).toBe(true);
  });

  it('starts next job immediately when a slot frees up (no stutter gap)', async () => {
    const startOrder: number[] = [];

    q.addJob(async () => { startOrder.push(1); await new Promise(res => setTimeout(res, 100)); });
    q.addJob(async () => { startOrder.push(2); await new Promise(res => setTimeout(res, 500)); });
    q.addJob(async () => { startOrder.push(3); await new Promise(res => setTimeout(res, 100)); });
    q.addJob(async () => { startOrder.push(4); await new Promise(res => setTimeout(res, 200)); });

    await vi.advanceTimersByTimeAsync(0);
    expect(q.getStatus().executing).toBe(3);

    
    await vi.advanceTimersByTimeAsync(150);
    expect(q.getStatus().executing).toBe(2);
    expect(startOrder).toEqual([1, 2, 3, 4]);
  });

  it('pause prevents new jobs but lets in-flight finish', async () => {
    const completed: string[] = [];

    for (let i = 1; i <= 6; i++) {
      const id = `job-${i}`;
      q.addJob(async () => {
        await new Promise(res => setTimeout(res, 100));
        completed.push(id);
      }, id);
    }

    await vi.advanceTimersByTimeAsync(0);
    expect(q.getStatus().executing).toBe(3);
    expect(q.getStatus().pending).toBe(3);

    q.pause();

    await vi.advanceTimersByTimeAsync(200);
    expect(q.getStatus().executing).toBe(0);
    expect(q.getStatus().pending).toBe(3);
    expect(completed.length).toBe(3);

    q.resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(q.getStatus().executing).toBe(3);
  });

  it('handles microtasks / Promise.resolve() without concurrency under/overflow', async () => {
    const q2 = new QueueManager(2);
    const started = vi.fn();

    for (let i = 0; i < 8; i++) {
      q2.addJob(async () => {
        started();
       
        await new Promise(res => setTimeout(res, 1)); 
      });
    }

    await vi.advanceTimersByTimeAsync(0);
    expect(started).toHaveBeenCalledTimes(2);

    await vi.runAllTimersAsync();
    expect(started).toHaveBeenCalledTimes(8);
    expect(q2.getStatus().executing).toBe(0);
  });
});