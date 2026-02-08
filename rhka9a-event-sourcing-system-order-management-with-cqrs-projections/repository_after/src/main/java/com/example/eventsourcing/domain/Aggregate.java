package com.example.eventsourcing.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Base class for all event-sourced aggregates.
 * Manages uncommitted events, version tracking, and state rebuild from history.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public abstract class Aggregate {
    
    protected UUID aggregateId;
    protected Long version;
    private transient List<DomainEvent> uncommittedEvents = new ArrayList<>();
    
    protected Aggregate() {
        this.version = 0L;
        this.uncommittedEvents = new ArrayList<>();
    }
    
    /**
     * Apply new event during command execution.
     * Adds event to uncommitted list and increments version.
     */
    protected void applyNewEvent(DomainEvent event) {
        applyEvent(event);
        uncommittedEvents.add(event);
        version++;
    }
    
    /**
     * Apply historical event during replay (no uncommitted tracking).
     */
    protected void applyHistoricalEvent(DomainEvent event) {
        applyEvent(event);
        version = event.getVersion();
    }
    
    /**
     * Subclasses must implement event dispatch logic.
     */
    protected abstract void applyEvent(DomainEvent event);
    
    /**
     * Load aggregate from event history.
     */
    public void loadFromHistory(List<DomainEvent> events) {
        events.forEach(this::applyHistoricalEvent);
    }
    
    /**
     * Get aggregate ID.
     */
    public UUID getAggregateId() {
        return aggregateId;
    }
    
    /**
     * Get current version.
     */
    public Long getVersion() {
        return version;
    }
    
    /**
     * Get uncommitted events (defensive copy).
     */
    @JsonIgnore
    public List<DomainEvent> getUncommittedEvents() {
        return new ArrayList<>(uncommittedEvents);
    }
    
    /**
     * Mark events as committed (clear uncommitted list).
     */
    public void markEventsAsCommitted() {
        uncommittedEvents.clear();
    }
    
    /**
     * Ensure aggregate ID is set.
     */
    protected void ensureAggregateId() {
        if (aggregateId == null) {
            throw new IllegalStateException("Aggregate ID must be set");
        }
    }
}

