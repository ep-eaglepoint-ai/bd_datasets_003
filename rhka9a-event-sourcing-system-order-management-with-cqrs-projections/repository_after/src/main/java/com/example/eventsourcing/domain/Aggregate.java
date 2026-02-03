package com.example.eventsourcing.domain;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;

/**
 * Base class for all domain aggregates.
 * Aggregates manage uncommitted events, version tracking, and state rebuild from history.
 * 
 * @param <T> The type of event this aggregate handles
 */
public abstract class Aggregate<T extends DomainEvent> {
    
    private String aggregateId;
    private Long version;
    private final List<T> uncommittedEvents;
    
    protected Aggregate() {
        this.aggregateId = null;
        this.version = 0L;
        this.uncommittedEvents = new ArrayList<>();
    }
    
    protected Aggregate(String aggregateId, Long version) {
        this.aggregateId = aggregateId;
        this.version = version;
        this.uncommittedEvents = new ArrayList<>();
    }
    
    /**
     * Get the aggregate ID.
     */
    public final String getAggregateId() {
        return aggregateId;
    }
    
    /**
     * Set the aggregate ID (for internal use by subclasses during reconstruction).
     */
    public final void setAggregateId(String aggregateId) {
        this.aggregateId = aggregateId;
    }
    
    /**
     * Get the current version of the aggregate.
     */
    public final Long getVersion() {
        return version;
    }
    
    /**
     * Set the aggregate version (for internal use by subclasses during reconstruction).
     */
    public final void setVersion(Long version) {
        this.version = version;
    }
    
    /**
     * Get the list of uncommitted events (read-only view).
     */
    public final List<T> getUncommittedEvents() {
        return Collections.unmodifiableList(uncommittedEvents);
    }
    
    /**
     * Get the number of uncommitted events.
     */
    public final int getUncommittedEventCount() {
        return uncommittedEvents.size();
    }
    
    /**
     * Check if the aggregate has uncommitted changes.
     */
    public final boolean hasUncommittedChanges() {
        return !uncommittedEvents.isEmpty();
    }
    
    /**
     * Mark all uncommitted events as committed.
     */
    public final void markEventsAsCommitted() {
        uncommittedEvents.clear();
    }
    
    /**
     * Apply an event to the aggregate state.
     * Subclasses must implement this to update their state based on events.
     */
    public abstract void apply(T event);
    
    /**
     * Load the aggregate state from a list of historical events.
     */
    public final void loadFromHistory(List<T> events) {
        for (T event : events) {
            apply(event);
            setVersion(event.getVersion());
        }
    }
    
    /**
     * Register a new event that will be committed when the aggregate is saved.
     * The event is also applied immediately to update the aggregate state.
     */
    protected final void registerEvent(T event) {
        Objects.requireNonNull(event, "Event cannot be null");
        uncommittedEvents.add(event);
        apply(event);
    }
    
    /**
     * Get the next version number for a new event.
     */
    protected final Long getNextVersion() {
        return version + 1;
    }
    
    /**
     * Get the type name of this aggregate for persistence purposes.
     */
    public abstract String getAggregateType();
    
    @Override
    public final boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Aggregate<?> aggregate = (Aggregate<?>) o;
        return Objects.equals(aggregateId, aggregate.aggregateId);
    }
    
    @Override
    public final int hashCode() {
        return Objects.hash(aggregateId);
    }
    
    @Override
    public final String toString() {
        return getClass().getSimpleName() + "{" +
               "aggregateId='" + aggregateId + '\'' +
               ", version=" + version +
               '}';
    }
}
