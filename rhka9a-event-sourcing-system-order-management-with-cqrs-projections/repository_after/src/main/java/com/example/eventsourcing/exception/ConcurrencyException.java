package com.example.eventsourcing.exception;

/**
 * Exception thrown when concurrent modification is detected (optimistic locking).
 */
public class ConcurrencyException extends RuntimeException {
    
    public ConcurrencyException(String message) {
        super(message);
    }
    
    public ConcurrencyException(String message, Throwable cause) {
        super(message, cause);
    }
}
