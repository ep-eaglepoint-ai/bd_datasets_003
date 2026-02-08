package com.example.eventsourcing.exception;

/**
 * Exception thrown when event deserialization fails.
 */
public class EventDeserializationException extends RuntimeException {
    
    public EventDeserializationException(String message) {
        super(message);
    }
    
    public EventDeserializationException(String message, Throwable cause) {
        super(message, cause);
    }
}

