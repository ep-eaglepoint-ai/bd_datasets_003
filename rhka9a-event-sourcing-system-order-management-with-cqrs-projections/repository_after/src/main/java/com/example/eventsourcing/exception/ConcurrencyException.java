package com.example.eventsourcing.exception;

/**
 * Exception thrown when a concurrent modification is detected during event persistence.
 */
public class ConcurrencyException extends RuntimeException {
    
    private final String aggregateId;
    private final Long expectedVersion;
    private final Long actualVersion;
    
    public ConcurrencyException(String aggregateId, Long expectedVersion, Long actualVersion) {
        super(String.format("Concurrent modification detected for aggregate %s. " +
                "Expected version %d but found version %d",
                aggregateId, expectedVersion, actualVersion));
        this.aggregateId = aggregateId;
        this.expectedVersion = expectedVersion;
        this.actualVersion = actualVersion;
    }
    
    public ConcurrencyException(String message) {
        super(message);
        this.aggregateId = null;
        this.expectedVersion = null;
        this.actualVersion = null;
    }
    
    public String getAggregateId() {
        return aggregateId;
    }
    
    public Long getExpectedVersion() {
        return expectedVersion;
    }
    
    public Long getActualVersion() {
        return actualVersion;
    }
}
