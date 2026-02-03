package com.example.eventsourcing.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * Base class for all domain events.
 * Events are immutable records of state changes in the system.
 */
public abstract class DomainEvent {
    
    @JsonProperty("eventId")
    private String eventId;
    @JsonProperty("aggregateId")
    private String aggregateId;
    @JsonProperty("version")
    private Long version;
    @JsonProperty("timestamp")
    private Instant timestamp;
    @JsonProperty("eventType")
    private String eventType;
    
    protected DomainEvent() {
        // Default constructor for Jackson
    }
    
    protected DomainEvent(
            @JsonProperty("eventId") String eventId,
            @JsonProperty("aggregateId") String aggregateId,
            @JsonProperty("version") Long version,
            @JsonProperty("timestamp") Instant timestamp,
            @JsonProperty("eventType") String eventType) {
        this.eventId = eventId != null ? eventId : UUID.randomUUID().toString();
        this.aggregateId = Objects.requireNonNull(aggregateId, "Aggregate ID cannot be null");
        this.version = Objects.requireNonNull(version, "Version cannot be null");
        this.timestamp = timestamp != null ? timestamp : Instant.now();
        this.eventType = eventType != null ? eventType : this.getClass().getName();
    }
    
    protected DomainEvent(String eventId, String aggregateId, Long version, Instant timestamp) {
        this.eventId = eventId;
        this.aggregateId = Objects.requireNonNull(aggregateId, "Aggregate ID cannot be null");
        this.version = Objects.requireNonNull(version, "Version cannot be null");
        this.timestamp = Objects.requireNonNull(timestamp, "Timestamp cannot be null");
        this.eventType = this.getClass().getName();
    }
    
    protected DomainEvent(String aggregateId, Long version) {
        this.eventId = UUID.randomUUID().toString();
        this.aggregateId = Objects.requireNonNull(aggregateId, "Aggregate ID cannot be null");
        this.version = Objects.requireNonNull(version, "Version cannot be null");
        this.timestamp = Instant.now();
        this.eventType = this.getClass().getName();
    }
    
    public String getEventId() {
        return eventId;
    }
    
    public String getAggregateId() {
        return aggregateId;
    }
    
    public Long getVersion() {
        return version;
    }
    
    public Instant getTimestamp() {
        return timestamp;
    }
    
    @JsonIgnore
    public String getEventType() {
        return eventType;
    }
    
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        DomainEvent that = (DomainEvent) o;
        return Objects.equals(eventId, that.eventId) &&
               Objects.equals(aggregateId, that.aggregateId) &&
               Objects.equals(version, that.version);
    }
    
    @Override
    public int hashCode() {
        return Objects.hash(eventId, aggregateId, version);
    }
    
    @Override
    public String toString() {
        return "DomainEvent{" +
               "eventId='" + eventId + '\'' +
               ", aggregateId='" + aggregateId + '\'' +
               ", version=" + version +
               ", timestamp=" + timestamp +
               ", eventType='" + eventType + '\'' +
               '}';
    }
}
