export interface RetryOptions {
  maxRetries: number;
  initialDelay: number;
  multiplier: number;
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = { maxRetries: 3, initialDelay: 1000, multiplier: 2 },
): Promise<T> {
  let lastError: any;
  let delay = options.initialDelay;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < options.maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= options.multiplier;
      }
    }
  }

  throw lastError;
}
