package com.example.eventsourcing.infrastructure;

import com.example.eventsourcing.domain.DomainEvent;

import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

/**
 * Interface for event store operations.
 */
public interface EventStore {
    
    /**
     * Appends events to the event store with optimistic locking.
     * 
     * @param aggregateId The aggregate identifier
     * @param aggregateType The aggregate type (fully qualified class name)
     * @param expectedVersion The expected current version (for optimistic locking)
     * @param events The events to append
     * @throws com.example.eventsourcing.exception.ConcurrencyException if version mismatch
     */
    void appendEvents(UUID aggregateId, String aggregateType, Long expectedVersion, List<DomainEvent> events);
    
    /**
     * Retrieves all events for an aggregate in order.
     * 
     * @param aggregateId The aggregate identifier
     * @return List of events ordered by version
     */
    List<DomainEvent> getEvents(UUID aggregateId);
    
    /**
     * Retrieves events after a specific version (for snapshot support).
     * 
     * @param aggregateId The aggregate identifier
     * @param afterVersion The version after which to retrieve events
     * @return List of events after the specified version
     */
    List<DomainEvent> getEventsAfterVersion(UUID aggregateId, Long afterVersion);
    
    /**
     * Gets latest version for an aggregate.
     * 
     * @param aggregateId The aggregate identifier
     * @return The latest version, or 0 if aggregate doesn't exist
     */
    Long getLatestVersion(UUID aggregateId);
    
    /**
     * Streams all events in batches (for projection rebuild).
     * 
     * @param batchSize The number of events per batch
     * @return Stream of domain events
     */
    Stream<DomainEvent> streamAllEvents(int batchSize);
}
