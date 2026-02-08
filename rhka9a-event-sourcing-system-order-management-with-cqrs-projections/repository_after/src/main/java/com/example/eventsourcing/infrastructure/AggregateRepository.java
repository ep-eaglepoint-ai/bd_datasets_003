package com.example.eventsourcing.infrastructure;

import com.example.eventsourcing.domain.Aggregate;
import com.example.eventsourcing.domain.DomainEvent;
import com.example.eventsourcing.exception.AggregateInstantiationException;
import com.example.eventsourcing.infrastructure.snapshot.SnapshotData;
import com.example.eventsourcing.infrastructure.snapshot.SnapshotService;
import com.example.eventsourcing.infrastructure.snapshot.SnapshotStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Generic repository for loading and saving aggregates with event sourcing.
 * Supports snapshot optimization.
 */
@Repository
public class AggregateRepository<T extends Aggregate> {
    
    private static final Logger log = LoggerFactory.getLogger(AggregateRepository.class);
    
    @Autowired
    private EventStore eventStore;
    
    @Autowired
    private SnapshotStore snapshotStore;
    
    @Autowired
    private SnapshotService snapshotService;
    
    @Autowired
    private ObjectMapper objectMapper;
    
    /**
     * Load an aggregate by ID, using snapshot if available.
     */
    @Transactional(readOnly = true)
    public Optional<T> load(UUID aggregateId, Class<T> aggregateClass) {
        // 1. Try to load from snapshot
        Optional<SnapshotData> snapshotOpt = snapshotStore.getLatestSnapshot(aggregateId);
        T aggregate;
        Long fromVersion = 0L;
        
        if (snapshotOpt.isPresent()) {
            // Deserialize aggregate from snapshot
            SnapshotData snapshot = snapshotOpt.get();
            aggregate = deserializeSnapshot(snapshot.getData(), aggregateClass);
            fromVersion = snapshot.getVersion();
            log.debug("Loaded aggregate {} from snapshot at version {}", aggregateId, fromVersion);
        } else {
            // No snapshot, create new instance
            try {
                aggregate = aggregateClass.getDeclaredConstructor(UUID.class)
                    .newInstance(aggregateId);
            } catch (Exception e) {
                throw new AggregateInstantiationException(
                    "Failed to instantiate aggregate: " + aggregateClass.getName(), e);
            }
        }
        
        // 2. Load and apply events after snapshot
        List<DomainEvent> events = eventStore.getEventsAfterVersion(aggregateId, fromVersion);
        
        if (events.isEmpty() && fromVersion == 0L) {
            return Optional.empty(); // Aggregate doesn't exist
        }
        
        aggregate.loadFromHistory(events);
        
        log.debug("Loaded aggregate {} with {} events after snapshot", aggregateId, events.size());
        
        return Optional.of(aggregate);
    }
    
    /**
     * Save an aggregate by persisting uncommitted events.
     */
    @Transactional
    public void save(T aggregate) {
        List<DomainEvent> events = aggregate.getUncommittedEvents();
        
        if (events.isEmpty()) {
            return; // Nothing to save
        }
        
        // Calculate expected version (before new events)
        Long expectedVersion = aggregate.getVersion() - events.size();
        
        // Save events with optimistic locking
        eventStore.appendEvents(
            aggregate.getAggregateId(),
            aggregate.getClass().getName(),
            expectedVersion,
            events
        );
        
        // Clear uncommitted events
        aggregate.markEventsAsCommitted();
        
        // Schedule snapshot creation (async, separate transaction)
        snapshotService.createSnapshotAsync(
            aggregate.getAggregateId(),
            aggregate.getClass().getName(),
            aggregate.getVersion(),
            aggregate
        );
        
        log.debug("Saved {} events for aggregate {}", events.size(), aggregate.getAggregateId());
    }
    
    /**
     * Deserialize snapshot data to aggregate instance.
     */
    private T deserializeSnapshot(String data, Class<T> aggregateClass) {
        try {
            return objectMapper.readValue(data, aggregateClass);
        } catch (Exception e) {
            log.error("Failed to deserialize snapshot for {}: {}", aggregateClass.getName(), e.getMessage());
            throw new RuntimeException("Snapshot deserialization failed", e);
        }
    }
}

