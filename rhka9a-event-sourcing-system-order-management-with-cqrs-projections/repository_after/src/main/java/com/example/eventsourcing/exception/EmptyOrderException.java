package com.example.eventsourcing.exception;

/**
 * Exception thrown when trying to submit an empty order.
 */
public class EmptyOrderException extends RuntimeException {
    
    public EmptyOrderException(String message) {
        super(message);
    }
    
    public EmptyOrderException(String message, Throwable cause) {
        super(message, cause);
    }
}

