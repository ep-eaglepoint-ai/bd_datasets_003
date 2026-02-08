package com.example.eventsourcing.infrastructure.snapshot;

import java.time.Instant;
import java.util.UUID;

/**
 * Snapshot data transfer object.
 */
public class SnapshotData {
    
    private final UUID aggregateId;
    private final String aggregateType;
    private final Long version;
    private final String data;
    private final Instant createdAt;
    
    public SnapshotData(UUID aggregateId, String aggregateType, Long version, String data, Instant createdAt) {
        this.aggregateId = aggregateId;
        this.aggregateType = aggregateType;
        this.version = version;
        this.data = data;
        this.createdAt = createdAt;
    }
    
    public UUID getAggregateId() {
        return aggregateId;
    }
    
    public String getAggregateType() {
        return aggregateType;
    }
    
    public Long getVersion() {
        return version;
    }
    
    public String getData() {
        return data;
    }
    
    public Instant getCreatedAt() {
        return createdAt;
    }
}

