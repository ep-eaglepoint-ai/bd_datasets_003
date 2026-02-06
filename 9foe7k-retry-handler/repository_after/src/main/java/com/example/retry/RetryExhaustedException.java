package com.example.retry;

/**
 * Exception thrown when all retry attempts have been exhausted.
 */
public class RetryExhaustedException extends Exception {
    private final int attempts;

    public RetryExhaustedException(String message, Throwable cause, int attempts) {
        super(message, cause);
        this.attempts = attempts;
    }

    public int getAttempts() {
        return attempts;
    }
}
