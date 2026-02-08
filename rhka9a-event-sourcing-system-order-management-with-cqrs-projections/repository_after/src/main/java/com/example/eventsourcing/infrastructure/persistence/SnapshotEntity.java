package com.example.eventsourcing.infrastructure.persistence;

import io.hypersistence.utils.hibernate.type.json.JsonBinaryType;
import jakarta.persistence.*;
import org.hibernate.annotations.Type;

import java.time.Instant;
import java.util.UUID;

/**
 * JPA Entity for aggregate snapshots.
 */
@Entity
@Table(name = "aggregate_snapshots",
       indexes = {
           @Index(name = "idx_snapshot_aggregate_id", columnList = "aggregate_id"),
           @Index(name = "idx_snapshot_created_at", columnList = "created_at")
       })
public class SnapshotEntity {
    
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(columnDefinition = "UUID")
    private UUID snapshotId;
    
    @Column(nullable = false, unique = true, columnDefinition = "UUID")
    private UUID aggregateId;
    
    @Column(nullable = false, length = 500)
    private String aggregateType;
    
    @Column(nullable = false)
    private Long snapshotVersion;
    
    @Type(JsonBinaryType.class)
    @Column(columnDefinition = "jsonb", nullable = false)
    private String snapshotData;
    
    @Column(nullable = false)
    private Instant createdAt;
    
    // Constructors
    public SnapshotEntity() {
    }
    
    // Getters and Setters
    public UUID getSnapshotId() {
        return snapshotId;
    }
    
    public void setSnapshotId(UUID snapshotId) {
        this.snapshotId = snapshotId;
    }
    
    public UUID getAggregateId() {
        return aggregateId;
    }
    
    public void setAggregateId(UUID aggregateId) {
        this.aggregateId = aggregateId;
    }
    
    public String getAggregateType() {
        return aggregateType;
    }
    
    public void setAggregateType(String aggregateType) {
        this.aggregateType = aggregateType;
    }
    
    public Long getSnapshotVersion() {
        return snapshotVersion;
    }
    
    public void setSnapshotVersion(Long snapshotVersion) {
        this.snapshotVersion = snapshotVersion;
    }
    
    public String getSnapshotData() {
        return snapshotData;
    }
    
    public void setSnapshotData(String snapshotData) {
        this.snapshotData = snapshotData;
    }
    
    public Instant getCreatedAt() {
        return createdAt;
    }
    
    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}

