import type { WorkerQueue } from "./types";

export class PromiseWorkerQueue implements WorkerQueue {
  readonly concurrency: number;
  private active = 0;
  private queue: Array<() => void> = [];
  private idleResolvers: Array<() => void> = [];

  constructor(concurrency: number) {
    if (!Number.isFinite(concurrency) || concurrency <= 0)
      throw new Error("invalid_concurrency");
    this.concurrency = concurrency;
  }

  add<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        this.active++;
        task()
          .then(resolve, reject)
          .finally(() => {
            this.active--;
            this.pump();
            this.checkIdle();
          });
      };

      this.queue.push(run);
      this.pump();
    });
  }

  async onIdle(): Promise<void> {
    if (this.active === 0 && this.queue.length === 0) return;
    await new Promise<void>((resolve) => this.idleResolvers.push(resolve));
  }

  private pump() {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    }
  }

  private checkIdle() {
    if (this.active === 0 && this.queue.length === 0) {
      const resolvers = this.idleResolvers;
      this.idleResolvers = [];
      resolvers.forEach((r) => r());
    }
  }
}
