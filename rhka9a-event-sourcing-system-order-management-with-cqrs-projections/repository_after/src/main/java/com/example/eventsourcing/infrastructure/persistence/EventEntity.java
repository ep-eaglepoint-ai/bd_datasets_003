package com.example.eventsourcing.infrastructure.persistence;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * JPA Entity representing a persisted domain event.
 */
@Entity
@Table(name = "domain_events", 
    indexes = {
        @Index(name = "idx_aggregate_id", columnList = "aggregate_id"),
        @Index(name = "idx_aggregate_version", columnList = "aggregate_id, version")
    },
    uniqueConstraints = {
        @UniqueConstraint(name = "uk_aggregate_version", columnNames = {"aggregate_id", "version"})
    }
)
public class EventEntity {
    
    @Id
    @Column(name = "event_id", length = 36)
    private String eventId;
    
    @Column(name = "aggregate_id", nullable = false, length = 36)
    private String aggregateId;
    
    @Column(name = "version", nullable = false)
    private Long version;
    
    @Column(name = "timestamp", nullable = false)
    private Instant timestamp;
    
    @Column(name = "event_type", nullable = false, length = 255)
    private String eventType;
    
    @Column(name = "payload", nullable = false, columnDefinition = "TEXT")
    private String payload;
    
    public EventEntity() {
    }
    
    public EventEntity(String eventId, String aggregateId, Long version, 
                       Instant timestamp, String eventType, String payload) {
        this.eventId = eventId;
        this.aggregateId = aggregateId;
        this.version = version;
        this.timestamp = timestamp;
        this.eventType = eventType;
        this.payload = payload;
    }
    
    public String getEventId() {
        return eventId;
    }
    
    public void setEventId(String eventId) {
        this.eventId = eventId;
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
    
    public String getEventType() {
        return eventType;
    }
    
    public void setEventType(String eventType) {
        this.eventType = eventType;
    }
    
    public String getPayload() {
        return payload;
    }
    
    public void setPayload(String payload) {
        this.payload = payload;
    }
}
