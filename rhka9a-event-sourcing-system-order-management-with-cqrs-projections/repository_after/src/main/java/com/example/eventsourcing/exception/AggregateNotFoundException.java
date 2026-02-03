package com.example.eventsourcing.exception;

/**
 * Exception thrown when an aggregate is not found in the event store.
 */
public class AggregateNotFoundException extends RuntimeException {
    
    private final String aggregateId;
    private final String aggregateType;
    
    public AggregateNotFoundException(String aggregateId, String aggregateType) {
        super(String.format("Aggregate not found: %s (type: %s)", aggregateId, aggregateType));
        this.aggregateId = aggregateId;
        this.aggregateType = aggregateType;
    }
    
    public AggregateNotFoundException(String message) {
        super(message);
        this.aggregateId = null;
        this.aggregateType = null;
    }
    
    public String getAggregateId() {
        return aggregateId;
    }
    
    public String getAggregateType() {
        return aggregateType;
    }
}
