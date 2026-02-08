package com.example.eventsourcing.exception;

/**
 * Exception thrown when unknown event type is encountered.
 */
public class UnknownEventTypeException extends RuntimeException {
    
    public UnknownEventTypeException(String message) {
        super(message);
    }
    
    public UnknownEventTypeException(String message, Throwable cause) {
        super(message, cause);
    }
}

