package com.example.eventsourcing.exception;

/**
 * Exception thrown when aggregate instantiation fails.
 */
public class AggregateInstantiationException extends RuntimeException {
    
    public AggregateInstantiationException(String message) {
        super(message);
    }
    
    public AggregateInstantiationException(String message, Throwable cause) {
        super(message, cause);
    }
}

