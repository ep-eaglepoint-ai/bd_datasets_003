

type JobId = string | number;
type JobState = 'pending' | 'executing' | 'completed' | 'failed';

interface JobEntry<T = any> {
  id: JobId;
  task: () => Promise<T>;
  state: JobState;
  result?: T;
  error?: any;
  startedAt?: number;
  finishedAt?: number;
}

type StateChangeListener<T> = (job: JobEntry<T>) => void;

export class QueueManager<T = any> {
  private readonly maxConcurrency: number;
  private queue: JobEntry<T>[] = [];                    
  private inFlight = new Map<JobId, JobEntry<T>>();     
  private completed = new Map<JobId, JobEntry<T>>();    

  private paused = false;
  private nextId = 0;

  private onStateChangeListeners = new Set<StateChangeListener<T>>();

  constructor(maxConcurrency: number = 4) {
    if (maxConcurrency < 1) {
      throw new Error("maxConcurrency must be >= 1");
    }
    this.maxConcurrency = maxConcurrency;
  }

  
  addJob(task: () => Promise<T>, customId?: JobId): JobId {
    const id = customId ?? `job-${this.nextId++}`;

    const entry: JobEntry<T> = {
      id,
      task,
      state: "pending",
    };

    this.queue.push(entry);
    this.notifyChange(entry);

    
    this.tryStartNext();

    return id;
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    
    while (this.inFlight.size < this.maxConcurrency && this.queue.length > 0) {
      this.startNextJob();
    }
  }

  getStatus(): {
    pending: number;
    executing: number;
    completed: number;
    failed: number;
    total: number;
  } {
    const failed = Array.from(this.completed.values()).filter(j => j.state === "failed").length;

    return {
      pending: this.queue.length,
      executing: this.inFlight.size,
      completed: this.completed.size - failed,
      failed,
      total: this.queue.length + this.inFlight.size + this.completed.size,
    };
  }

  getJob(id: JobId): JobEntry<T> | undefined {
   
    let job = this.queue.find(j => j.id === id);
    if (job) return { ...job };

    job = this.inFlight.get(id);
    if (job) return { ...job };

    job = this.completed.get(id);
    if (job) return { ...job };

    return undefined;
  }

  onStateChange(listener: StateChangeListener<T>): () => void {
    this.onStateChangeListeners.add(listener);
    return () => this.onStateChangeListeners.delete(listener);
  }

  
  private tryStartNext(): void {
    if (this.paused) return;
    if (this.inFlight.size >= this.maxConcurrency) return;
    if (this.queue.length === 0) return;

    this.startNextJob();
  }

  private startNextJob(): void {
    const job = this.queue.shift();
    if (!job) return;

    job.state = "executing";
    job.startedAt = Date.now();
    this.inFlight.set(job.id, job);
    this.notifyChange(job);

   
    job.task()
      .then(result => {
        this.completeJob(job, "completed", result);
      })
      .catch(error => {
        this.completeJob(job, "failed", undefined, error);
      })
      .finally(() => {
        
        this.inFlight.delete(job.id);
        this.completed.set(job.id, job); 
        this.notifyChange(job);

        
        this.tryStartNext();
      });
  }

  private completeJob(
    job: JobEntry<T>,
    finalState: "completed" | "failed",
    result?: T,
    error?: any
  ): void {
    job.state = finalState;
    job.finishedAt = Date.now();
    if (finalState === "completed") {
      job.result = result;
    } else {
      job.error = error;
    }
  }

  private notifyChange(job: JobEntry<T>): void {
    
    const snapshot = { ...job };
    for (const listener of this.onStateChangeListeners) {
      try {
        listener(snapshot);
      } catch (err) {
        console.error("State change listener threw:", err);
      }
    }
  }

  
  clearCompleted(): void {
    this.completed.clear();
  }
}