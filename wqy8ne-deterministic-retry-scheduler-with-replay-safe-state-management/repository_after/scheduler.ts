/**
 * Deterministic Retry Scheduler with Replay-Safe State Management
 * 
 * A scheduler that accepts tasks, emits due attempts when time advances,
 * and accepts attempt results. Supports snapshot/restore for auditability.
 */

const MAX_SAFE_MS = Number.MAX_SAFE_INTEGER;

export type TaskId = string;

export type TaskSpec = {
  taskId: TaskId;
  maxAttempts: number;          // >= 1
  baseBackoffMs: number;        // >= 0
  kind: "email" | "sync" | "report" | "other";
};

export type AttemptResult =
  | { type: "ok" }
  | { type: "fail"; code: string };

export type Attempt = {
  taskId: TaskId;
  attemptNo: number;            // 1..maxAttempts
  scheduledAtMs: number;        // logical time (input-driven)
};

export type SchedulerSnapshot = {
  version: number;
  tasks: TaskData[];
};

type TaskData = {
  taskId: string;
  maxAttempts: number;
  baseBackoffMs: number;
  kind: "email" | "sync" | "report" | "other";
  currentAttempt: number;
  nextScheduledAtMs: number;
  lastEmittedAtMs: number;
  state: TaskStateType;
  emittedAttempts: number[];
};

export type Scheduler = {
  submit(spec: TaskSpec): { accepted: boolean; reason?: string };
  tick(nowMs: number, budget: number): Attempt[];
  reportResult(taskId: TaskId, attemptNo: number, result: AttemptResult): void;
  snapshot(): SchedulerSnapshot;
  restore(s: SchedulerSnapshot): void;
  stats(): {
    queued: number;
    inFlight: number;
    completed: number;
    dead: number;
  };
};

/**
 * Task states
 */
enum TaskState {
  QUEUED = 'queued',
  IN_FLIGHT = 'in_flight',
  COMPLETED = 'completed',
  DEAD = 'dead'
}

type TaskStateType = 'queued' | 'in_flight' | 'completed' | 'dead';

/**
 * Internal task representation
 */
class Task {
  taskId: string;
  maxAttempts: number;
  baseBackoffMs: number;
  kind: "email" | "sync" | "report" | "other";
  currentAttempt: number;
  nextScheduledAtMs: number;
  lastEmittedAtMs: number;
  state: TaskStateType;
  emittedAttempts: Set<number>;

  constructor(spec: TaskSpec, initialScheduledAtMs: number) {
    this.taskId = spec.taskId;
    this.maxAttempts = spec.maxAttempts;
    this.baseBackoffMs = spec.baseBackoffMs;
    this.kind = spec.kind;
    this.currentAttempt = 1;
    this.nextScheduledAtMs = initialScheduledAtMs;
    this.lastEmittedAtMs = initialScheduledAtMs;
    this.state = TaskState.QUEUED;
    this.emittedAttempts = new Set<number>();
  }

  toJSON(): TaskData {
    return {
      taskId: this.taskId,
      maxAttempts: this.maxAttempts,
      baseBackoffMs: this.baseBackoffMs,
      kind: this.kind,
      currentAttempt: this.currentAttempt,
      nextScheduledAtMs: this.nextScheduledAtMs,
      lastEmittedAtMs: this.lastEmittedAtMs,
      state: this.state,
      emittedAttempts: Array.from(this.emittedAttempts)
    };
  }

  static fromJSON(data: TaskData): Task {
    const spec: TaskSpec = {
      taskId: data.taskId,
      maxAttempts: data.maxAttempts,
      baseBackoffMs: data.baseBackoffMs,
      kind: data.kind
    };
    const task = new Task(spec, data.nextScheduledAtMs);
    task.currentAttempt = data.currentAttempt;
    task.lastEmittedAtMs = data.lastEmittedAtMs;
    task.state = data.state;
    task.emittedAttempts = new Set(data.emittedAttempts);
    return task;
  }
}

/**
 * Calculate next retry delay with exponential backoff
 * @param baseBackoffMs - base delay
 * @param retryCount - number of retries so far (0 for first retry, 1 for second retry, etc.)
 */
function calculateBackoff(baseBackoffMs: number, retryCount: number): number {
  if (baseBackoffMs === 0) return 0;
  if (retryCount === 0) return baseBackoffMs;
  
  // Prevent overflow: check if doubling would exceed MAX_SAFE_MS
  let delay = baseBackoffMs;
  for (let i = 0; i < retryCount; i++) {
    if (delay > MAX_SAFE_MS / 2) {
      return MAX_SAFE_MS;
    }
    delay *= 2;
  }
  
  return Math.min(delay, MAX_SAFE_MS);
}

/**
 * Deterministic comparison for attempt ordering
 */
function compareAttempts(a: Attempt & { kind: string }, b: Attempt & { kind: string }): number {
  // 1. scheduledAtMs ascending
  if (a.scheduledAtMs !== b.scheduledAtMs) {
    return a.scheduledAtMs - b.scheduledAtMs;
  }
  
  // 2. kind lexicographic ascending
  if (a.kind !== b.kind) {
    return a.kind < b.kind ? -1 : 1;
  }
  
  // 3. taskId lexicographic ascending
  if (a.taskId !== b.taskId) {
    return a.taskId < b.taskId ? -1 : 1;
  }
  
  // 4. attemptNo ascending
  return a.attemptNo - b.attemptNo;
}

/**
 * Create a deterministic retry scheduler
 */
export function createScheduler(): Scheduler {
  const tasks = new Map<string, Task>();
  // Index of queued tasks by scheduled time for efficient tick() lookup
  const queuedByTime = new Map<number, Set<string>>();
  let logicalClock = 0; // Track submission time for new tasks
  
  function addToTimeIndex(task: Task): void {
    if (task.state === TaskState.QUEUED) {
      let bucket = queuedByTime.get(task.nextScheduledAtMs);
      if (!bucket) {
        bucket = new Set();
        queuedByTime.set(task.nextScheduledAtMs, bucket);
      }
      bucket.add(task.taskId);
    }
  }
  
  function removeFromTimeIndex(task: Task, scheduledAtMs: number): void {
    const bucket = queuedByTime.get(scheduledAtMs);
    if (bucket) {
      bucket.delete(task.taskId);
      if (bucket.size === 0) {
        queuedByTime.delete(scheduledAtMs);
      }
    }
  }
  
  return {
    submit(spec: TaskSpec): { accepted: boolean; reason?: string } {
      if (tasks.has(spec.taskId)) {
        return { 
          accepted: false, 
          reason: 'Task with this taskId already exists' 
        };
      }
      
      if (spec.maxAttempts < 1) {
        return { 
          accepted: false, 
          reason: 'maxAttempts must be >= 1' 
        };
      }
      
      if (spec.baseBackoffMs < 0) {
        return { 
          accepted: false, 
          reason: 'baseBackoffMs must be >= 0' 
        };
      }
      
      // Use logical clock for submission time
      const task = new Task(spec, logicalClock);
      tasks.set(spec.taskId, task);
      addToTimeIndex(task);
      
      return { accepted: true };
    },

    tick(nowMs: number, budget: number): Attempt[] {
      // Update logical clock
      logicalClock = Math.max(logicalClock, nowMs);
      
      const dueAttempts: (Attempt & { kind: string })[] = [];
      
      // Only scan time buckets that are due (scheduled time <= nowMs)
      const dueTimes = Array.from(queuedByTime.keys())
        .filter(t => t <= nowMs)
        .sort((a, b) => a - b);
      
      for (const scheduledTime of dueTimes) {
        const bucket = queuedByTime.get(scheduledTime);
        if (!bucket) continue;
        
        for (const taskId of bucket) {
          const task = tasks.get(taskId);
          if (task && task.state === TaskState.QUEUED) {
            dueAttempts.push({
              taskId: task.taskId,
              attemptNo: task.currentAttempt,
              scheduledAtMs: task.nextScheduledAtMs,
              kind: task.kind
            });
          }
        }
      }
      
      // Sort deterministically
      dueAttempts.sort(compareAttempts);
      
      // Apply budget and emit
      const toEmit = dueAttempts.slice(0, budget);
      
      for (const attempt of toEmit) {
        const task = tasks.get(attempt.taskId);
        if (task) {
          removeFromTimeIndex(task, task.nextScheduledAtMs);
          task.state = TaskState.IN_FLIGHT;
          task.lastEmittedAtMs = attempt.scheduledAtMs;
          task.emittedAttempts.add(attempt.attemptNo);
        }
      }
      
      // Return without kind (not in Attempt type)
      return toEmit.map(({ taskId, attemptNo, scheduledAtMs }) => ({
        taskId,
        attemptNo,
        scheduledAtMs
      }));
    },

    reportResult(taskId: TaskId, attemptNo: number, result: AttemptResult): void {
      const task = tasks.get(taskId);
      
      // Safe handling: unknown taskId
      if (!task) return;
      
      // Safe handling: invalid attemptNo
      if (attemptNo < 1 || attemptNo > task.maxAttempts) return;
      
      // Safe handling: attempt not emitted
      if (!task.emittedAttempts.has(attemptNo)) return;
      
      // Safe handling: already in final state
      if (task.state === TaskState.COMPLETED || task.state === TaskState.DEAD) {
        return;
      }
      
      // Safe handling: result for old attempt when newer attempt emitted
      if (attemptNo < task.currentAttempt) return;
      
      if (result.type === 'ok') {
        task.state = TaskState.COMPLETED;
      } else if (result.type === 'fail') {
        if (attemptNo >= task.maxAttempts) {
          task.state = TaskState.DEAD;
        } else {
          // Schedule next retry
          // retryCount is the number of failures so far (attemptNo - 1 for first failure = 0)
          const retryCount = attemptNo - 1;
          const backoff = calculateBackoff(task.baseBackoffMs, retryCount);
          
          // Calculate absolute time for next attempt based on last emitted time
          let nextScheduledAtMs = task.lastEmittedAtMs + backoff;
          
          // Prevent overflow and ensure integer
          if (nextScheduledAtMs > MAX_SAFE_MS || nextScheduledAtMs < task.lastEmittedAtMs || !Number.isSafeInteger(nextScheduledAtMs)) {
            nextScheduledAtMs = MAX_SAFE_MS;
          }
          
          task.nextScheduledAtMs = Math.floor(nextScheduledAtMs);
          task.currentAttempt = attemptNo + 1;
          task.state = TaskState.QUEUED;
          addToTimeIndex(task);
        }
      }
    },

    snapshot(): SchedulerSnapshot {
      const taskArray = Array.from(tasks.values()).map(task => task.toJSON());
      return {
        version: 1,
        tasks: taskArray
      };
    },

    restore(snapshot: SchedulerSnapshot): void {
      tasks.clear();
      queuedByTime.clear();
      
      if (snapshot.version === 1) {
        for (const taskData of snapshot.tasks) {
          const task = Task.fromJSON(taskData);
          tasks.set(task.taskId, task);
          addToTimeIndex(task);
        }
      }
    },

    stats(): { queued: number; inFlight: number; completed: number; dead: number } {
      let queued = 0;
      let inFlight = 0;
      let completed = 0;
      let dead = 0;
      
      for (const task of tasks.values()) {
        switch (task.state) {
          case TaskState.QUEUED:
            queued++;
            break;
          case TaskState.IN_FLIGHT:
            inFlight++;
            break;
          case TaskState.COMPLETED:
            completed++;
            break;
          case TaskState.DEAD:
            dead++;
            break;
        }
      }
      
      return { queued, inFlight, completed, dead };
    }
  };
}
