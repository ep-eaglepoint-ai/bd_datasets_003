package com.example.eventsourcing.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * Repository for persisting and retrieving aggregate snapshots.
 */
@Repository
public interface SnapshotRepository extends JpaRepository<SnapshotEntity, String> {
    
    /**
     * Find the latest snapshot for an aggregate.
     */
    Optional<SnapshotEntity> findByAggregateId(String aggregateId);
    
    /**
     * Find the snapshot with the highest version for an aggregate.
     */
    @Query("SELECT s FROM SnapshotEntity s WHERE s.aggregateId = :aggregateId " +
           "ORDER BY s.version DESC LIMIT 1")
    Optional<SnapshotEntity> findLatestSnapshot(@Param("aggregateId") String aggregateId);
    
    /**
     * Delete all snapshots for an aggregate.
     */
    void deleteByAggregateId(String aggregateId);
    
    /**
     * Check if a snapshot exists for an aggregate.
     */
    boolean existsByAggregateId(String aggregateId);
}
