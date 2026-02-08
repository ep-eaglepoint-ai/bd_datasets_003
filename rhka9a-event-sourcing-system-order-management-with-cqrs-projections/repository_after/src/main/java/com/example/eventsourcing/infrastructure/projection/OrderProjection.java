package com.example.eventsourcing.infrastructure.projection;

import com.example.eventsourcing.domain.order.*;
import com.example.eventsourcing.infrastructure.DomainEventWrapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * Order projection event handlers (CQRS read model).
 * Updates denormalized views asynchronously after events are persisted.
 */
@Component
public class OrderProjection {
    
    private static final Logger log = LoggerFactory.getLogger(OrderProjection.class);
    
    @Autowired
    private OrderProjectionRepository repository;
    
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onOrderCreated(DomainEventWrapper<OrderCreatedEvent> wrapper) {
        try {
            OrderCreatedEvent event = wrapper.getEvent();
            
            // Idempotency check
            if (repository.existsById(event.getAggregateId())) {
                log.debug("Order projection already exists: {}", event.getAggregateId());
                return;
            }
            
            OrderProjectionEntity projection = new OrderProjectionEntity();
            projection.setOrderId(event.getAggregateId());
            projection.setCustomerId(event.customerId());
            projection.setStatus(OrderStatus.DRAFT);
            projection.setTotalAmount(BigDecimal.ZERO);
            projection.setItemCount(0);
            projection.setCreatedAt(event.occurredAt());
            projection.setUpdatedAt(Instant.now());
            
            repository.save(projection);
            repository.flush(); // Ensure immediate persistence
            log.info("Created order projection: {}", event.getAggregateId());
        } catch (Exception e) {
            log.error("Failed to create order projection: {}", e.getMessage(), e);
            throw e; // Re-throw to see in tests
        }
    }
    
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onItemAdded(DomainEventWrapper<OrderItemAddedEvent> wrapper) {
        try {
            OrderItemAddedEvent event = wrapper.getEvent();
            
            repository.findById(event.getAggregateId()).ifPresent(projection -> {
                projection.setItemCount(projection.getItemCount() + 1);
                BigDecimal itemTotal = event.unitPrice()
                    .multiply(BigDecimal.valueOf(event.quantity()));
                projection.setTotalAmount(projection.getTotalAmount().add(itemTotal));
                projection.setUpdatedAt(Instant.now());
                repository.save(projection);
                repository.flush(); // Ensure immediate persistence
                log.info("Updated order projection after item added: {}", event.getAggregateId());
            });
        } catch (Exception e) {
            log.error("Failed to update order projection after item added: {}", e.getMessage(), e);
            throw e;
        }
    }
    
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onItemRemoved(DomainEventWrapper<OrderItemRemovedEvent> wrapper) {
        try {
            OrderItemRemovedEvent event = wrapper.getEvent();
            
            repository.findById(event.getAggregateId()).ifPresent(projection -> {
                projection.setItemCount(Math.max(0, projection.getItemCount() - 1));
                projection.setUpdatedAt(Instant.now());
                repository.save(projection);
                repository.flush(); // Ensure immediate persistence
                log.info("Updated order projection after item removed: {}", event.getAggregateId());
            });
        } catch (Exception e) {
            log.error("Failed to update order projection after item removed: {}", e.getMessage(), e);
            throw e;
        }
    }
    
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onOrderSubmitted(DomainEventWrapper<OrderSubmittedEvent> wrapper) {
        try {
            OrderSubmittedEvent event = wrapper.getEvent();
            
            repository.findById(event.getAggregateId()).ifPresent(projection -> {
                if (projection.getStatus() == OrderStatus.SUBMITTED) {
                    log.debug("Order already submitted: {}", event.getAggregateId());
                    return; // Idempotent - already submitted
                }
                projection.setStatus(OrderStatus.SUBMITTED);
                projection.setSubmittedAt(event.occurredAt());
                projection.setUpdatedAt(Instant.now());
                repository.save(projection);
                repository.flush(); // Ensure immediate persistence
                log.info("Updated order projection after submission: {}", event.getAggregateId());
            });
        } catch (Exception e) {
            log.error("Failed to update order projection after submission: {}", e.getMessage(), e);
            throw e;
        }
    }
}
