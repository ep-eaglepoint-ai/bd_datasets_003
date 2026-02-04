class PromisePool {
  /**
   * Create a new PromisePool
   * @param {number} concurrency - Maximum number of concurrent tasks (must be >= 1)
   * @throws {Error} If concurrency is not a positive integer
   */
  constructor(concurrency) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error("Concurrency must be a positive integer (>= 1)");
    }

    this.concurrency = concurrency;
    this.metrics = {
      completed: 0,
      failed: 0,
      running: 0,
      total: 0,
    };
  }

  /**
   * Execute an array of async task functions with controlled concurrency
   * @param {Array<Function>} tasks - Array of functions that return Promises
   * @param {Object} options - Execution options
   * @param {Function} options.onProgress - Called after each task: (index, total, success) => void
   * @param {Function} options.onTaskComplete - Called with result/error: (index, resultOrError) => void
   * @param {AbortSignal} options.signal - AbortSignal for cancellation support
   * @returns {Promise<Array>} Results array matching input order (values or error objects)
   */
  async execute(tasks, options = {}) {
    const { onProgress, onTaskComplete, signal } = options;

    // Handle edge case: empty array
    if (!tasks || tasks.length === 0) {
      return [];
    }

    // Reset metrics for this execution
    this.metrics = {
      completed: 0,
      failed: 0,
      running: 0,
      total: tasks.length,
    };

    // Results array to maintain input order
    const results = new Array(tasks.length);

    // Track which tasks have been started
    let nextTaskIndex = 0;

    // Flag for abort state
    let aborted = false;

    // Set up abort handling
    if (signal) {
      if (signal.aborted) {
        throw new DOMException("The operation was aborted", "AbortError");
      }

      signal.addEventListener("abort", () => {
        aborted = true;
      });
    }

    // Promise that will resolve when all tasks complete or reject on abort
    return new Promise((resolve, reject) => {
      // Function to start the next task
      const startNextTask = () => {
        // Check if we should stop starting new tasks
        if (aborted) {
          return;
        }

        // Check if all tasks have been started
        if (nextTaskIndex >= tasks.length) {
          return;
        }

        // Get the current task index and increment for next time
        const taskIndex = nextTaskIndex++;
        const task = tasks[taskIndex];

        // Increment running count
        this.metrics.running++;

        // Execute the task and handle its completion
        const taskPromise = Promise.resolve()
          .then(() => task())
          .then(
            (result) => {
              // Task succeeded
              results[taskIndex] = result;
              return { success: true, result };
            },
            (error) => {
              // Task failed - wrap error for tracking
              const errorWrapper = {
                error,
                message: error.message || String(error),
                taskIndex,
              };
              results[taskIndex] = errorWrapper;
              this.metrics.failed++;
              return { success: false, error: errorWrapper };
            },
          )
          .then(({ success, result, error }) => {
            // Update metrics
            this.metrics.running--;
            this.metrics.completed++;

            // Call onTaskComplete callback if provided
            if (onTaskComplete) {
              try {
                onTaskComplete(taskIndex, success ? result : error);
              } catch (callbackError) {
                // Ignore callback errors to prevent disruption
                console.error("onTaskComplete callback error:", callbackError);
              }
            }

            // Call onProgress callback if provided
            if (onProgress) {
              try {
                onProgress(taskIndex, tasks.length, success);
              } catch (callbackError) {
                // Ignore callback errors to prevent disruption
                console.error("onProgress callback error:", callbackError);
              }
            }

            // Check if we should reject due to abort
            if (aborted && this.metrics.running === 0) {
              reject(
                new DOMException("The operation was aborted", "AbortError"),
              );
              return;
            }

            // Start the next task to maintain concurrency
            startNextTask();

            // Check if all tasks are complete
            if (this.metrics.completed === tasks.length) {
              resolve(results);
            }
          });
      };

      // Start initial batch of tasks up to concurrency limit
      const initialBatchSize = Math.min(this.concurrency, tasks.length);
      for (let i = 0; i < initialBatchSize; i++) {
        startNextTask();
      }
    });
  }

  /**
   * Get current pool status and metrics
   * @returns {Object} Current metrics
   */
  status() {
    return { ...this.metrics };
  }

  /**
   * Static map method - like Array.map but with controlled concurrency
   * @param {Array} items - Array of items to process
   * @param {Function} mapper - Async function to apply to each item: (item, index) => Promise
   * @param {number} concurrency - Maximum concurrent operations
   * @param {Object} options - Optional execution options (onProgress, onTaskComplete, signal)
   * @returns {Promise<Array>} Results in original order
   */
  static async map(items, mapper, concurrency, options = {}) {
    if (!Array.isArray(items)) {
      throw new Error("First argument must be an array");
    }

    if (typeof mapper !== "function") {
      throw new Error("Mapper must be a function");
    }

    const pool = new PromisePool(concurrency);

    // Create task functions that apply the mapper to each item
    const tasks = items.map((item, index) => {
      return () => mapper(item, index);
    });

    return pool.execute(tasks, options);
  }
}

// Export for ES modules
export { PromisePool };
export default PromisePool;
