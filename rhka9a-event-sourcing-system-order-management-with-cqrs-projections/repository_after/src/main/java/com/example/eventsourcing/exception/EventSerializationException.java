package com.example.eventsourcing.exception;

/**
 * Exception thrown when event serialization fails.
 */
public class EventSerializationException extends RuntimeException {
    
    public EventSerializationException(String message) {
        super(message);
    }
    
    public EventSerializationException(String message, Throwable cause) {
        super(message, cause);
    }
}

