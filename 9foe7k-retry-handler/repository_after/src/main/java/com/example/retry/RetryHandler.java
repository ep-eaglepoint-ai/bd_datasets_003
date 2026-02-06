package com.example.retry;

import java.util.concurrent.Callable;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Predicate;

public class RetryHandler {
    private final long initialDelayMs;
    private final long maxDelayMs;
    private final int maxRetries;
    private final Predicate<Exception> retryPredicate;

    // Internal state for metrics
    private final ThreadLocal<Integer> lastAttemptCount = ThreadLocal.withInitial(() -> 0);

    // Package-private for testing
    RetryHandler(Builder builder) {
        this.initialDelayMs = builder.initialDelayMs;
        this.maxDelayMs = builder.maxDelayMs;
        this.maxRetries = builder.maxRetries;
        this.retryPredicate = builder.retryPredicate;
    }

    public static Builder defaultBuilder() {
        return new Builder()
                .withInitialDelay(100)
                .withMaxDelay(30000)
                .withMaxRetries(3)
                .withRetryPredicate(e -> true);
    }

    public <T> T execute(Callable<T> task) throws Exception {
        int attempt = 0;
        lastAttemptCount.set(0);
        
        while (true) {
            try {
                // Increment attempt count before execution to track every attempt
                lastAttemptCount.set(lastAttemptCount.get() + 1);
                
                // Attempt indices for calculation: 0 = initial try
                // The prompt says "attempt count should start at 0 for the first retry not the initial attempt". 
                // So:
                // Try 1 (initial): attempt = 0. Exception?
                // Retry 1: attempt = 0 calculation?
                // Let's re-read: "delay = min(initialDelay * 2^attempt, maxDelay) ... attempt count should start at 0 for the first retry not the initial attempt"
                // This means when we are ABOUT TO DO the first retry, attempt should be 0 for the formula.
                
                T result = task.call();
                return result;
            } catch (Exception e) {
                // Check if we should retry
                // 1. Is it retryable?
                if (!retryPredicate.test(e)) {
                    throw e;
                }
                
                // 2. Have we exhausted retries?
                // maxRetries is "maximum retry attempts after the initial try".
                // So if maxRetries is 3, we can have 1 initial + 3 retries = 4 total attempts.
                // current 'attempt' variable in loop? 
                
                // Let's use a counter for retries executed so far.
                int retriesSoFar = attempt; 
                
                if (retriesSoFar >= maxRetries) {
                    throw new RetryExhaustedException("Retry attempts exhausted after " + (retriesSoFar + 1) + " attempts", e, retriesSoFar + 1);
                }

                // Calculate delay for the NEXT retry (which will be retry index 'retriesSoFar')
                // Prompt: "attempt count should start at 0 for the first retry"
                // So for first retry: calculate with shift 0.
                
                long delay = calculateDelay(retriesSoFar);
                
                // Add jitter
                long jitter = ThreadLocalRandom.current().nextLong(delay + 1);
                long finalDelay = delay + jitter;
                
                try {
                    sleep(finalDelay);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("Retry interrupted", ie);
                }
                
                attempt++;
            }
        }
    }
    
    // Protected for testing
    protected void sleep(long millis) throws InterruptedException {
        Thread.sleep(millis);
    }
    
    public void execute(Runnable task) throws Exception {
        execute(() -> {
            task.run();
            return null;
        });
    }

    public int getLastAttemptCount() {
        return lastAttemptCount.get();
    }

    private long calculateDelay(int retryAttemptIndex) {
        // "initialDelayMs * (1L << attemptNumber)"
        // "prevent overflow by using Math.min(attemptNumber, 30) "
        // "capping at maxDelayMs"
        
        long shift = Math.min(retryAttemptIndex, 30);
        
        // Use 1L to ensure long arithmetic
        // Check for potential overflow before multiplication if needed?
        // Since maxDelay is long, 100 * 2^30 is approx 100 * 10^9 = 10^11, fits in long (2^63-1 approx 9*10^18).
        // Even 2^60 fits. Math.min(..., 30) is safe from overflow of the shift itself logic.
        
        long multiplier = 1L << shift;
        long calculatedDelay = initialDelayMs * multiplier;
        
        // Cap at maxDelay
        return Math.min(calculatedDelay, maxDelayMs);
    }

    public static class Builder {
        private long initialDelayMs = 100;
        private long maxDelayMs = 30000;
        private int maxRetries = 3;
        private Predicate<Exception> retryPredicate = e -> true;

        public Builder withInitialDelay(long initialDelayMs) {
            if (initialDelayMs < 0) throw new IllegalArgumentException("Initial delay must be non-negative");
            this.initialDelayMs = initialDelayMs;
            return this;
        }

        public Builder withMaxDelay(long maxDelayMs) {
            if (maxDelayMs < 0) throw new IllegalArgumentException("Max delay must be non-negative");
            this.maxDelayMs = maxDelayMs;
            return this;
        }

        public Builder withMaxRetries(int maxRetries) {
            if (maxRetries < 0) throw new IllegalArgumentException("Max retries must be non-negative");
            this.maxRetries = maxRetries;
            return this;
        }

        public Builder withRetryPredicate(Predicate<Exception> retryPredicate) {
            if (retryPredicate == null) throw new IllegalArgumentException("Retry predicate cannot be null");
            this.retryPredicate = retryPredicate;
            return this;
        }

        public RetryHandler build() {
            return new RetryHandler(this);
        }
    }
}
