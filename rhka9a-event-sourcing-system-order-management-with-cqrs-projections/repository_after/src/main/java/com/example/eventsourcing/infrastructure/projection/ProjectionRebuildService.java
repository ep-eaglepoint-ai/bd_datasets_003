package com.example.eventsourcing.infrastructure.projection;

import com.example.eventsourcing.config.EventSourcingProperties;
import com.example.eventsourcing.domain.DomainEvent;
import com.example.eventsourcing.infrastructure.DomainEventWrapper;
import com.example.eventsourcing.infrastructure.EventStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Stream;

/**
 * Service for rebuilding projections from event history.
 * Memory-bounded and non-blocking.
 */
@Service
public class ProjectionRebuildService {
    
    private static final Logger log = LoggerFactory.getLogger(ProjectionRebuildService.class);
    
    @Autowired
    private EventStore eventStore;
    
    @Autowired
    private OrderProjectionRepository projectionRepository;
    
    @Autowired
    private ApplicationEventPublisher eventPublisher;
    
    @Autowired
    private EventSourcingProperties properties;
    
    @Autowired
    private PlatformTransactionManager transactionManager;
    
    /**
     * Rebuild all projections from event history.
     * Memory-bounded: processes events in batches.
     * Non-blocking: ongoing operations continue.
     * 
     * Uses separate transactions per batch so @TransactionalEventListener handlers
     * fire after each batch commits, not after the entire rebuild.
     */
    public void rebuildOrderProjections() {
        log.info("Starting order projection rebuild");
        
        // 1. Clear existing projections in a separate transaction
        TransactionTemplate clearTx = new TransactionTemplate(transactionManager);
        clearTx.execute(status -> {
            projectionRepository.deleteAll();
            projectionRepository.flush();
            return null;
        });
        
        // 2. Stream events in batches, processing each batch in its own transaction
        int batchSize = properties.getProjection().getRebuildBatchSize();
        AtomicLong processedCount = new AtomicLong(0);
        
        TransactionTemplate batchTx = new TransactionTemplate(transactionManager);
        batchTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        
        try (Stream<DomainEvent> eventStream = eventStore.streamAllEvents(batchSize)) {
            List<DomainEvent> batch = new ArrayList<>(batchSize);
            
            eventStream.forEach(event -> {
                batch.add(event);
                processedCount.incrementAndGet();
                
                if (batch.size() >= batchSize) {
                    processBatchInTransaction(batch, batchTx);
                    batch.clear();
                }
            });
            
            // Process remaining events
            if (!batch.isEmpty()) {
                processBatchInTransaction(batch, batchTx);
            }
        }
        
        log.info("Order projection rebuild completed. Processed {} events", processedCount.get());
    }
    
    /**
     * Process a batch of events in a separate transaction.
     * This ensures @TransactionalEventListener handlers fire after each batch commits.
     */
    private void processBatchInTransaction(List<DomainEvent> batch, TransactionTemplate transactionTemplate) {
        transactionTemplate.execute(status -> {
            for (DomainEvent event : batch) {
                // Publish event - handlers will fire after this transaction commits
                eventPublisher.publishEvent(new DomainEventWrapper<>(event));
            }
            // Transaction commits here, triggering AFTER_COMMIT handlers
            return null;
        });
    }
}

