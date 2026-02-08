package com.example.eventsourcing.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

/**
 * Spring Data JPA repository for snapshots.
 */
@Repository
public interface SnapshotRepository extends JpaRepository<SnapshotEntity, UUID> {
    
    /**
     * Find latest snapshot for an aggregate.
     */
    Optional<SnapshotEntity> findByAggregateId(UUID aggregateId);
    
    /**
     * Delete snapshot for an aggregate.
     */
    void deleteByAggregateId(UUID aggregateId);
}

