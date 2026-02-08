package com.example.eventsourcing.infrastructure.persistence;

import jakarta.persistence.*;
import org.hibernate.annotations.Type;
import io.hypersistence.utils.hibernate.type.json.JsonBinaryType;

import java.time.Instant;
import java.util.UUID;

/**
 * JPA Entity for event storage.
 */
@Entity
@Table(name = "event_store",
       uniqueConstraints = @UniqueConstraint(columnNames = {"aggregate_id", "event_version"}),
       indexes = {
           @Index(name = "idx_aggregate_id", columnList = "aggregate_id"),
           @Index(name = "idx_created_at", columnList = "created_at"),
           @Index(name = "idx_event_type", columnList = "event_type")
       })
public class EventEntity {
    
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(columnDefinition = "UUID")
    private UUID eventId;
    
    @Column(nullable = false, columnDefinition = "UUID")
    private UUID aggregateId;
    
    @Column(nullable = false, length = 500)
    private String aggregateType;
    
    @Column(nullable = false)
    private Long eventVersion;
    
    @Column(nullable = false, length = 500)
    private String eventType;
    
    @Type(JsonBinaryType.class)
    @Column(columnDefinition = "jsonb", nullable = false)
    private String eventPayload;
    
    @Column(nullable = false)
    private Instant createdAt;
    
    @Type(JsonBinaryType.class)
    @Column(columnDefinition = "jsonb")
    private String metadata;
    
    // Constructors
    public EventEntity() {
    }
    
    // Getters and Setters
    public UUID getEventId() {
        return eventId;
    }
    
    public void setEventId(UUID eventId) {
        this.eventId = eventId;
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
    
    public Long getEventVersion() {
        return eventVersion;
    }
    
    public void setEventVersion(Long eventVersion) {
        this.eventVersion = eventVersion;
    }
    
    public String getEventType() {
        return eventType;
    }
    
    public void setEventType(String eventType) {
        this.eventType = eventType;
    }
    
    public String getEventPayload() {
        return eventPayload;
    }
    
    public void setEventPayload(String eventPayload) {
        this.eventPayload = eventPayload;
    }
    
    public Instant getCreatedAt() {
        return createdAt;
    }
    
    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
    
    public String getMetadata() {
        return metadata;
    }
    
    public void setMetadata(String metadata) {
        this.metadata = metadata;
    }
}

