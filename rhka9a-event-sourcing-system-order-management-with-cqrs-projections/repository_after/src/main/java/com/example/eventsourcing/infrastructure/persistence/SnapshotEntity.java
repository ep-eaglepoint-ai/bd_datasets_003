package com.example.eventsourcing.infrastructure.persistence;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * JPA Entity representing a snapshot of an aggregate's state.
 */
@Entity
@Table(name = "aggregate_snapshots", indexes = {
    @Index(name = "idx_snapshot_aggregate_id", columnList = "aggregate_id")
})
public class SnapshotEntity {
    
    @Id
    @Column(name = "aggregate_id", length = 36)
    private String aggregateId;
    
    @Column(name = "version", nullable = false)
    private Long version;
    
    @Column(name = "timestamp", nullable = false)
    private Instant timestamp;
    
    @Column(name = "aggregate_type", nullable = false, length = 255)
    private String aggregateType;
    
    @Column(name = "state", nullable = false, columnDefinition = "TEXT")
    private String state;
    
    public SnapshotEntity() {
    }
    
    public SnapshotEntity(String aggregateId, Long version, Instant timestamp,
                          String aggregateType, String state) {
        this.aggregateId = aggregateId;
        this.version = version;
        this.timestamp = timestamp;
        this.aggregateType = aggregateType;
        this.state = state;
    }
    
    public String getAggregateId() {
        return aggregateId;
    }
    
    public void setAggregateId(String aggregateId) {
        this.aggregateId = aggregateId;
    }
    
    public Long getVersion() {
        return version;
    }
    
    public void setVersion(Long version) {
        this.version = version;
    }
    
    public Instant getTimestamp() {
        return timestamp;
    }
    
    public void setTimestamp(Instant timestamp) {
        this.timestamp = timestamp;
    }
    
    public String getAggregateType() {
        return aggregateType;
    }
    
    public void setAggregateType(String aggregateType) {
        this.aggregateType = aggregateType;
    }
    
    public String getState() {
        return state;
    }
    
    public void setState(String state) {
        this.state = state;
    }
}
