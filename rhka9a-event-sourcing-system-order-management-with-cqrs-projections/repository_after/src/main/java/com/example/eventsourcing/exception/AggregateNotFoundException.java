package com.example.eventsourcing.exception;

/**
 * Exception thrown when aggregate is not found.
 */
public class AggregateNotFoundException extends RuntimeException {
    
    public AggregateNotFoundException(String message) {
        super(message);
    }
    
    public AggregateNotFoundException(String message, Throwable cause) {
        super(message, cause);
    }
}

