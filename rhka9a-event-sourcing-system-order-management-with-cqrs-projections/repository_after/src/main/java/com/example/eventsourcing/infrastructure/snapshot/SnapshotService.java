package com.example.eventsourcing.infrastructure.snapshot;

import com.example.eventsourcing.domain.Aggregate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;
import java.util.concurrent.CompletableFuture;

/**
 * Service for asynchronous snapshot creation.
 */
@Service
public class SnapshotService {
    
    private static final Logger log = LoggerFactory.getLogger(SnapshotService.class);
    
    @Autowired
    private SnapshotStore snapshotStore;
    
    @Autowired
    private SnapshotStrategy snapshotStrategy;
    
    /**
     * Creates snapshot asynchronously in separate transaction.
     */
    @Async("snapshotExecutor")
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public CompletableFuture<Void> createSnapshotAsync(
        UUID aggregateId,
        String aggregateType,
        Long version,
        Aggregate aggregate
    ) {
        try {
            if (snapshotStrategy.shouldCreateSnapshot(version)) {
                snapshotStore.saveSnapshot(aggregateId, aggregateType, version, aggregate);
                log.debug("Snapshot created for aggregate {} at version {}", aggregateId, version);
            }
        } catch (Exception e) {
            log.error("Failed to create snapshot for aggregate {}: {}", aggregateId, e.getMessage());
            // Don't throw - snapshot failure shouldn't affect command
        }
        return CompletableFuture.completedFuture(null);
    }
}

