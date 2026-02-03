package com.example.eventsourcing.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Repository for persisting and retrieving domain events.
 */
@Repository
public interface EventRepository extends JpaRepository<EventEntity, String> {
    
    /**
     * Find all events for an aggregate ordered by version.
     */
    List<EventEntity> findByAggregateIdOrderByVersionAsc(String aggregateId);
    
    /**
     * Find events for an aggregate after a specific version.
     */
    List<EventEntity> findByAggregateIdAndVersionGreaterThanOrderByVersionAsc(
            String aggregateId, Long version);
    
    /**
     * Find events for an aggregate in a version range.
     */
    @Query("SELECT e FROM EventEntity e WHERE e.aggregateId = :aggregateId " +
           "AND e.version > :fromVersion AND e.version <= :toVersion " +
           "ORDER BY e.version ASC")
    List<EventEntity> findEventsInRange(
            @Param("aggregateId") String aggregateId,
            @Param("fromVersion") Long fromVersion,
            @Param("toVersion") Long toVersion);
    
    /**
     * Find the latest event for an aggregate.
     */
    Optional<EventEntity> findFirstByAggregateIdOrderByVersionDesc(String aggregateId);
    
    /**
     * Find events after a timestamp for projection rebuilds.
     */
    List<EventEntity> findByTimestampGreaterThanOrderByTimestampAsc(Instant timestamp);
    
    /**
     * Find events within a timestamp range for projection rebuilds.
     */
    @Query("SELECT e FROM EventEntity e WHERE e.timestamp >= :fromTimestamp " +
           "AND e.timestamp <= :toTimestamp ORDER BY e.timestamp ASC")
    List<EventEntity> findEventsInTimestampRange(
            @Param("fromTimestamp") Instant fromTimestamp,
            @Param("toTimestamp") Instant toTimestamp);
    
    /**
     * Check if an event with the given ID exists (for idempotency).
     */
    boolean existsByEventId(String eventId);
    
    /**
     * Get the current version of an aggregate (0 if no events exist).
     */
    @Query("SELECT COALESCE(MAX(e.version), 0) FROM EventEntity e WHERE e.aggregateId = :aggregateId")
    Long getCurrentVersion(@Param("aggregateId") String aggregateId);
}
