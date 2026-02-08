package com.example.eventsourcing.infrastructure.snapshot;

import java.util.Optional;
import java.util.UUID;

/**
 * Interface for snapshot storage operations.
 */
public interface SnapshotStore {
    
    /**
     * Save a snapshot of aggregate state.
     */
    void saveSnapshot(UUID aggregateId, String aggregateType, Long version, Object aggregateState);
    
    /**
     * Get the latest snapshot for an aggregate.
     */
    Optional<SnapshotData> getLatestSnapshot(UUID aggregateId);
    
    /**
     * Delete snapshot for an aggregate.
     */
    void deleteSnapshot(UUID aggregateId);
}

