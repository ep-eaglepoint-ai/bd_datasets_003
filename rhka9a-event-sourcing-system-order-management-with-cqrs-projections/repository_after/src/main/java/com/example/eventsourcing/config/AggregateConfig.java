package com.example.eventsourcing.config;

import com.example.eventsourcing.domain.order.OrderAggregate;
import com.example.eventsourcing.infrastructure.EventStore;
import com.example.eventsourcing.infrastructure.OrderAggregateRepository;
import com.example.eventsourcing.infrastructure.persistence.SnapshotRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Configuration for aggregate repositories.
 * Provides Supplier beans for creating aggregates.
 */
@Configuration
public class AggregateConfig {
    
    /**
     * Supplier bean for creating OrderAggregate instances.
     * This fixes the wiring issue where AggregateRepository requires a Supplier.
     */
    @Bean
    public java.util.function.Supplier<OrderAggregate> orderAggregateSupplier() {
        return () -> new OrderAggregate();
    }
    
    /**
     * Configure the OrderAggregateRepository for OrderAggregate.
     * Uses the specialized repository that properly restores state from snapshots.
     */
    @Bean
    public OrderAggregateRepository orderAggregateRepository(
            EventStore eventStore,
            SnapshotRepository snapshotRepository,
            ObjectMapper objectMapper,
            ApplicationEventPublisher eventPublisher,
            EventSourcingProperties properties,
            java.util.function.Supplier<OrderAggregate> orderAggregateSupplier) {
        
        return new OrderAggregateRepository(
                eventStore,
                snapshotRepository,
                objectMapper,
                eventPublisher,
                properties,
                orderAggregateSupplier
        );
    }
}
