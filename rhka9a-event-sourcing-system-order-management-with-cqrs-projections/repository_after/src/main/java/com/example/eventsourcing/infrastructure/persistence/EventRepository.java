package com.example.eventsourcing.infrastructure.persistence;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Spring Data JPA repository for event storage.
 */
@Repository
public interface EventRepository extends JpaRepository<EventEntity, UUID> {
    
    /**
     * Find all events for an aggregate ordered by version.
     */
    List<EventEntity> findByAggregateIdOrderByEventVersionAsc(UUID aggregateId);
    
    /**
     * Find events for an aggregate after a specific version.
     */
    List<EventEntity> findByAggregateIdAndEventVersionGreaterThanOrderByEventVersionAsc(
        UUID aggregateId, Long afterVersion);
    
    /**
     * Find maximum version for an aggregate.
     */
    @Query("SELECT MAX(e.eventVersion) FROM EventEntity e WHERE e.aggregateId = :aggregateId")
    Optional<Long> findMaxVersionByAggregateId(@Param("aggregateId") UUID aggregateId);
    
    /**
     * Find all events ordered by created timestamp (for projection rebuild).
     */
    Page<EventEntity> findAllByOrderByCreatedAtAsc(Pageable pageable);
    
    /**
     * Check if aggregate exists.
     */
    boolean existsByAggregateId(UUID aggregateId);
}
