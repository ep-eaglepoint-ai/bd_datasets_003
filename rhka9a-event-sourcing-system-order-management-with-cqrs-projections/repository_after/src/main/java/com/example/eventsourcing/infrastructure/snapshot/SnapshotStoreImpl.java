package com.example.eventsourcing.infrastructure.snapshot;

import com.example.eventsourcing.infrastructure.persistence.SnapshotEntity;
import com.example.eventsourcing.infrastructure.persistence.SnapshotRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * Implementation of snapshot store.
 */
@Service
@Transactional
public class SnapshotStoreImpl implements SnapshotStore {
    
    private static final Logger log = LoggerFactory.getLogger(SnapshotStoreImpl.class);
    
    @Autowired
    private SnapshotRepository snapshotRepository;
    
    @Autowired
    private ObjectMapper objectMapper;
    
    @Override
    public void saveSnapshot(UUID aggregateId, String aggregateType, Long version, Object aggregateState) {
        try {
            // Delete existing snapshot first
            snapshotRepository.deleteByAggregateId(aggregateId);
            
            // Create new snapshot
            SnapshotEntity entity = new SnapshotEntity();
            entity.setSnapshotId(UUID.randomUUID());
            entity.setAggregateId(aggregateId);
            entity.setAggregateType(aggregateType);
            entity.setSnapshotVersion(version);
            entity.setSnapshotData(objectMapper.writeValueAsString(aggregateState));
            entity.setCreatedAt(Instant.now());
            
            snapshotRepository.save(entity);
            
            log.debug("Snapshot created for aggregate {} at version {}", aggregateId, version);
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize snapshot for aggregate {}: {}", aggregateId, e.getMessage());
            throw new RuntimeException("Snapshot serialization failed", e);
        }
    }
    
    @Override
    @Transactional(readOnly = true)
    public Optional<SnapshotData> getLatestSnapshot(UUID aggregateId) {
        return snapshotRepository.findByAggregateId(aggregateId)
            .map(entity -> new SnapshotData(
                entity.getAggregateId(),
                entity.getAggregateType(),
                entity.getSnapshotVersion(),
                entity.getSnapshotData(),
                entity.getCreatedAt()
            ));
    }
    
    @Override
    public void deleteSnapshot(UUID aggregateId) {
        snapshotRepository.deleteByAggregateId(aggregateId);
        log.debug("Snapshot deleted for aggregate {}", aggregateId);
    }
}

