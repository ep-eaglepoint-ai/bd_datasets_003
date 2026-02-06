package com.example.eventsourcing.infrastructure;

import com.example.eventsourcing.config.EventSourcingProperties;
import com.example.eventsourcing.domain.DomainEvent;
import com.example.eventsourcing.domain.order.OrderAggregate;
import com.example.eventsourcing.domain.order.OrderItem;
import com.example.eventsourcing.infrastructure.persistence.SnapshotRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.ApplicationEventPublisher;

import java.util.HashMap;
import java.util.function.Supplier;

/**
 * Specialized repository for OrderAggregate that properly restores state from snapshots.
 * This extends AggregateRepository and overrides copyStateFromSnapshot() to restore
 * all OrderAggregate-specific fields (items, customerId, status, totalAmount, etc.).
 * 
 * This repository is configured as a bean in AggregateConfig.
 */
public class OrderAggregateRepository extends AggregateRepository<OrderAggregate, DomainEvent> {
    
    public OrderAggregateRepository(
            EventStore eventStore,
            SnapshotRepository snapshotRepository,
            ObjectMapper objectMapper,
            ApplicationEventPublisher eventPublisher,
            EventSourcingProperties properties,
            Supplier<OrderAggregate> orderAggregateSupplier) {
        super(eventStore, snapshotRepository, objectMapper, eventPublisher, properties, orderAggregateSupplier);
    }
    
    /**
     * Copy state from a snapshot aggregate to the current aggregate.
     * This method restores all OrderAggregate-specific fields from the snapshot.
     */
    @Override
    protected void copyStateFromSnapshot(OrderAggregate aggregate, OrderAggregate snapshotAggregate) {
        // Use the public restoreFromSnapshot method in OrderAggregate
        // This maintains encapsulation while allowing snapshot restoration
        aggregate.restoreFromSnapshot(snapshotAggregate);
    }
}

