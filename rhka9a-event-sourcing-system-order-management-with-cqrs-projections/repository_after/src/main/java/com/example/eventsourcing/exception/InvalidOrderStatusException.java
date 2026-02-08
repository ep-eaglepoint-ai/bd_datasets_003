package com.example.eventsourcing.exception;

/**
 * Exception thrown when operation is invalid for current order status.
 */
public class InvalidOrderStatusException extends RuntimeException {
    
    public InvalidOrderStatusException(String message) {
        super(message);
    }
    
    public InvalidOrderStatusException(String message, Throwable cause) {
        super(message, cause);
    }
}

