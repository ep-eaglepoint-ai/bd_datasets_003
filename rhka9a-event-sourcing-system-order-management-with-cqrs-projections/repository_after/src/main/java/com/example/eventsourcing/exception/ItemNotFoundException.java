package com.example.eventsourcing.exception;

/**
 * Exception thrown when item is not found in order.
 */
public class ItemNotFoundException extends RuntimeException {
    
    public ItemNotFoundException(String message) {
        super(message);
    }
    
    public ItemNotFoundException(String message, Throwable cause) {
        super(message, cause);
    }
}

