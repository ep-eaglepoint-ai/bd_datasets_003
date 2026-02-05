package com.example.eventsourcing.infrastructure;

import com.example.eventsourcing.config.EventSourcingProperties;
import com.example.eventsourcing.domain.Aggregate;
import com.example.eventsourcing.domain.DomainEvent;
import com.example.eventsourcing.exception.AggregateNotFoundException;
import com.example.eventsourcing.infrastructure.persistence.SnapshotEntity;
import com.example.eventsourcing.infrastructure.persistence.SnapshotRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;

/**
 * Repository for loading and saving aggregates with event sourcing and snapshot support.
 * 
 * @param <T> The type of aggregate
 * @param <E> The type of event the aggregate handles
 */
@Service
public class AggregateRepository<T extends Aggregate<E>, E extends DomainEvent> {
    
    private static final Logger logger = LoggerFactory.getLogger(AggregateRepository.class);
    
    private final EventStore eventStore;
    private final SnapshotRepository snapshotRepository;
    private final ObjectMapper objectMapper;
    private final ApplicationEventPublisher eventPublisher;
    private final EventSourcingProperties properties;
    private final Supplier<T> aggregateFactory;
    
    public AggregateRepository(EventStore eventStore, SnapshotRepository snapshotRepository,
                               ObjectMapper objectMapper, ApplicationEventPublisher eventPublisher,
                               EventSourcingProperties properties,
                               Supplier<T> aggregateFactory) {
        this.eventStore = eventStore;
        this.snapshotRepository = snapshotRepository;
        this.objectMapper = objectMapper;
        this.eventPublisher = eventPublisher;
        this.properties = properties;
        this.aggregateFactory = aggregateFactory;
    }
    
    /**
     * Load an aggregate by its ID, using snapshots if available.
     */
    @SuppressWarnings("unchecked")
    @Transactional(readOnly = true)
    public T load(String aggregateId) {
        logger.debug("Loading aggregate {}", aggregateId);
        
        // Try to load from snapshot first
        SnapshotEntity snapshot = snapshotRepository
                .findTopByAggregateIdOrderByVersionDesc(aggregateId)
                .orElse(null);
        Long snapshotVersion = snapshot != null ? snapshot.getVersion() : 0L;
        
        T aggregate = aggregateFactory.get();
        aggregate.setAggregateId(aggregateId);
        
        if (snapshot != null) {
            logger.debug("Found snapshot for aggregate {} at version {}", aggregateId, snapshotVersion);
            // Load aggregate state from snapshot
            restoreFromSnapshot(aggregate, snapshot);
        }
        
        // Load events after snapshot version
        List<DomainEvent> rawEvents = eventStore.loadEventsAfterVersion(aggregateId, snapshotVersion);
        List<E> events = new ArrayList<>(rawEvents.size());
        for (DomainEvent e : rawEvents) {
            @SuppressWarnings("unchecked")
            E casted = (E) e;
            events.add(casted);
        }
        if (!events.isEmpty()) {
            logger.debug("Loading {} events after snapshot for aggregate {}", events.size(), aggregateId);
            aggregate.loadFromHistory(events);
        }
        
        aggregate.setVersion(eventStore.getCurrentVersion(aggregateId));
        return aggregate;
    }
    
    /**
     * Save an aggregate by appending its uncommitted events to the event store.
     */
    @Transactional
    public T save(T aggregate) {
        String aggregateId = aggregate.getAggregateId();
        Long expectedVersion = aggregate.getVersion();
        List<E> events = aggregate.getUncommittedEvents();
        
        if (events.isEmpty()) {
            logger.debug("No uncommitted events for aggregate {}", aggregateId);
            return aggregate;
        }
        
        logger.debug("Saving aggregate {} with {} uncommitted events, expected version {}",
                aggregateId, events.size(), expectedVersion);
        
        // Append events with optimistic locking
        List<DomainEvent> rawSavedEvents = eventStore.appendEvents(aggregateId, expectedVersion, events);
        List<E> savedEvents = new ArrayList<>(rawSavedEvents.size());
        for (DomainEvent e : rawSavedEvents) {
            @SuppressWarnings("unchecked")
            E casted = (E) e;
            savedEvents.add(casted);
        }
        
        // Update aggregate version
        aggregate.setVersion(expectedVersion + savedEvents.size());
        
        // Mark events as committed
        aggregate.markEventsAsCommitted();
        
        // Publish events for projections
        for (E event : savedEvents) {
            eventStore.publishEvent(event);
        }
        
        logger.info("Saved aggregate {} with {} events, new version {}",
                aggregateId, savedEvents.size(), aggregate.getVersion());
        
        // Check if we need to create a snapshot (async, in separate transaction)
        checkAndCreateSnapshot(aggregate);
        
        return aggregate;
    }
    
    /**
     * Save a new aggregate with its first event.
     * Ensures the initial event is marked as committed so it won't be re-appended on subsequent saves.
     */
    @Transactional
    public T saveNew(T aggregate, E initialEvent) {
        String aggregateId = aggregate.getAggregateId();
        
        logger.debug("Saving new aggregate {}", aggregateId);
        
        // Append the initial event (with optimistic locking check)
        DomainEvent persistedEvent = eventStore.appendInitialEvent(aggregateId, initialEvent);
        
        // Apply the event to the aggregate using the persisted version
        @SuppressWarnings("unchecked")
        E appliedEvent = (E) persistedEvent;
        aggregate.apply(appliedEvent);
        aggregate.setVersion(appliedEvent.getVersion());
        
        // Mark the initial event as committed so it is not re-appended on the next save()
        aggregate.markEventsAsCommitted();
        
        // Publish event for projections
        eventStore.publishEvent(persistedEvent);
        
        logger.info("Saved new aggregate {} with version {}", aggregateId, aggregate.getVersion());
        return aggregate;
    }
    
    /**
     * Check if a snapshot should be created and create it if needed.
     * This method is called after save() to potentially trigger async snapshot creation.
     */
    private void checkAndCreateSnapshot(T aggregate) {
        int snapshotThreshold = properties.getSnapshot().getThreshold();
        
        // Check if we've reached the snapshot threshold
        if (snapshotThreshold > 0 && aggregate.getVersion() > 0
                && aggregate.getVersion() % snapshotThreshold == 0) {
            // Create snapshot in a separate transaction (async, non-blocking)
            createSnapshotAsync(aggregate);
        }
    }
    
    /**
     * Create a snapshot asynchronously in a separate transaction.
     * This ensures snapshot creation doesn't block command processing.
     */
    @Async("eventTaskExecutor")
    public void createSnapshotAsync(T aggregate) {
        String aggregateId = aggregate.getAggregateId();
        
        logger.debug("Async snapshot creation for aggregate {} at version {}", aggregateId, aggregate.getVersion());
        
        try {
            createSnapshot(aggregate);
        } catch (Exception e) {
            logger.error("Failed to create snapshot for aggregate {}: {}", aggregateId, e.getMessage(), e);
        }
    }
    
    /**
     * Create a snapshot of the aggregate state.
     * This method runs in a separate transaction to avoid blocking command processing.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void createSnapshot(T aggregate) {
        String aggregateId = aggregate.getAggregateId();
        
        logger.debug("Creating snapshot for aggregate {} at version {}", aggregateId, aggregate.getVersion());
        
        try {
            String state = objectMapper.writeValueAsString(aggregate);
            SnapshotEntity snapshot = new SnapshotEntity(
                    aggregateId,
                    aggregate.getVersion(),
                    Instant.now(),
                    aggregate.getAggregateType(),
                    state
            );
            snapshotRepository.save(snapshot);
            
            logger.info("Created snapshot for aggregate {} at version {}", aggregateId, aggregate.getVersion());
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize aggregate state for snapshot", e);
        }
    }
    
    /**
     * Restore aggregate state from a snapshot.
     */
    @SuppressWarnings("unchecked")
    private void restoreFromSnapshot(T aggregate, SnapshotEntity snapshot) {
        try {
            T snapshotAggregate = objectMapper.readValue(snapshot.getState(), (Class<T>) aggregate.getClass());
            // Copy relevant state from snapshot to current aggregate
            aggregate.setAggregateId(snapshotAggregate.getAggregateId());
            aggregate.setVersion(snapshotAggregate.getVersion());
            copyStateFromSnapshot(aggregate, snapshotAggregate);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to deserialize aggregate state from snapshot", e);
        }
    }
    
    /**
     * Copy state from a snapshot aggregate to the current aggregate.
     * Subclasses should override this if they have additional state to restore.
     */
    protected void copyStateFromSnapshot(T aggregate, T snapshotAggregate) {
        // Default implementation does nothing - subclasses can override
    }
    
    /**
     * Check if an aggregate exists.
     */
    @Transactional(readOnly = true)
    public boolean exists(String aggregateId) {
        return eventStore.getCurrentVersion(aggregateId) > 0L;
    }
}
