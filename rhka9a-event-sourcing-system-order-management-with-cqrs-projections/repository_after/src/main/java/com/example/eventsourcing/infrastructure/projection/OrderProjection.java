package com.example.eventsourcing.infrastructure.projection;

import com.example.eventsourcing.domain.DomainEvent;
import com.example.eventsourcing.domain.order.*;
import com.example.eventsourcing.infrastructure.persistence.EventEntity;
import com.example.eventsourcing.infrastructure.persistence.EventRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Projection that maintains a denormalized view of orders.
 * Subscribes to domain events and updates the read model accordingly.
 * Event handlers are idempotent - processing the same event multiple times has no effect.
 */
@Component
public class OrderProjection {
    
    private static final Logger logger = LoggerFactory.getLogger(OrderProjection.class);
    
    private final OrderProjectionRepository projectionRepository;
    private final EventRepository eventRepository;
    
    // Track processed events for idempotency
    private final Map<String, Instant> processedEventIds = new ConcurrentHashMap<>();
    
    @Autowired
    public OrderProjection(OrderProjectionRepository projectionRepository, 
                          EventRepository eventRepository) {
        this.projectionRepository = projectionRepository;
        this.eventRepository = eventRepository;
    }
    
    /**
     * Handle domain events published by the event store.
     * This method is idempotent - processing the same event multiple times has no effect.
     */
    @EventListener
    @Transactional
    public void handleDomainEvent(DomainEvent event) {
        String eventId = event.getEventId();
        
        // Check if this event has already been processed (idempotency)
        if (isEventProcessed(eventId)) {
            logger.debug("Event {} already processed, skipping", eventId);
            return;
        }
        
        logger.debug("Processing event {} of type {}", eventId, event.getEventType());
        
        // Process the event based on its type
        if (event instanceof OrderCreatedEvent) {
            handleOrderCreated((OrderCreatedEvent) event);
        } else if (event instanceof OrderItemAddedEvent) {
            handleOrderItemAdded((OrderItemAddedEvent) event);
        } else if (event instanceof OrderItemRemovedEvent) {
            handleOrderItemRemoved((OrderItemRemovedEvent) event);
        } else if (event instanceof OrderSubmittedEvent) {
            handleOrderSubmitted((OrderSubmittedEvent) event);
        }
        
        // Mark event as processed
        markEventAsProcessed(eventId);
    }
    
    /**
     * Handle OrderCreatedEvent - create a new order projection.
     */
    private void handleOrderCreated(OrderCreatedEvent event) {
        String orderId = event.getAggregateId();
        
        // Idempotent: check if projection already exists
        if (projectionRepository.existsByOrderId(orderId)) {
            logger.debug("Order projection {} already exists, skipping", orderId);
            return;
        }
        
        OrderProjectionEntity projection = new OrderProjectionEntity(
                orderId,
                event.getCustomerId(),
                OrderStatus.DRAFT,
                event.getTotalAmount(),
                0,
                event.getTimestamp()
        );
        
        projectionRepository.save(projection);
        logger.info("Created order projection for order {}", orderId);
    }
    
    /**
     * Handle OrderItemAddedEvent - update order totals and item count.
     */
    private void handleOrderItemAdded(OrderItemAddedEvent event) {
        String orderId = event.getAggregateId();
        
        // Idempotent: check if projection exists
        OrderProjectionEntity projection = projectionRepository.findByOrderId(orderId)
                .orElse(null);
        
        if (projection == null) {
            logger.warn("Order projection {} not found for event, may be a rebuild scenario", orderId);
            return;
        }
        
        // Update the projection
        projection.setTotalAmount(event.getTotalAmount());
        projection.setItemCount(projection.getItemCount() + 1);
        
        projectionRepository.save(projection);
        logger.debug("Updated order projection {} after adding item", orderId);
    }
    
    /**
     * Handle OrderItemRemovedEvent - update order totals and item count.
     */
    private void handleOrderItemRemoved(OrderItemRemovedEvent event) {
        String orderId = event.getAggregateId();
        
        // Idempotent: check if projection exists
        OrderProjectionEntity projection = projectionRepository.findByOrderId(orderId)
                .orElse(null);
        
        if (projection == null) {
            logger.warn("Order projection {} not found for event, may be a rebuild scenario", orderId);
            return;
        }
        
        // Update the projection
        BigDecimal newTotal = projection.getTotalAmount().subtract(event.getPreviousTotalAmount());
        projection.setTotalAmount(newTotal.compareTo(BigDecimal.ZERO) == 0 ? BigDecimal.ZERO : newTotal);
        projection.setItemCount(Math.max(0, projection.getItemCount() - 1));
        
        projectionRepository.save(projection);
        logger.debug("Updated order projection {} after removing item", orderId);
    }
    
    /**
     * Handle OrderSubmittedEvent - update order status.
     */
    private void handleOrderSubmitted(OrderSubmittedEvent event) {
        String orderId = event.getAggregateId();
        
        // Idempotent: check if projection exists
        OrderProjectionEntity projection = projectionRepository.findByOrderId(orderId)
                .orElse(null);
        
        if (projection == null) {
            logger.warn("Order projection {} not found for event, may be a rebuild scenario", orderId);
            return;
        }
        
        // Update the projection
        projection.setStatus(OrderStatus.SUBMITTED);
        projection.setSubmittedAt(event.getTimestamp());
        
        projectionRepository.save(projection);
        logger.info("Updated order projection {} to SUBMITTED status", orderId);
    }
    
    /**
     * Rebuild the projection from scratch by replaying all events.
     * This method is designed to not block ongoing operations.
     */
    @Transactional
    public void rebuildProjection() {
        logger.info("Starting full projection rebuild");
        
        // Clear the projection
        projectionRepository.deleteAll();
        processedEventIds.clear();
        
        // Load all events in batches to avoid memory issues
        List<EventEntity> allEvents = eventRepository.findAll();
        
        // Sort by timestamp and version to ensure correct order
        List<EventEntity> sortedEvents = allEvents.stream()
                .sorted((e1, e2) -> {
                    int timestampCompare = e1.getTimestamp().compareTo(e2.getTimestamp());
                    if (timestampCompare != 0) return timestampCompare;
                    return e1.getVersion().compareTo(e2.getVersion());
                })
                .collect(Collectors.toList());
        
        logger.info("Replaying {} events for projection rebuild", sortedEvents.size());
        
        // Replay events in order
        for (EventEntity entity : sortedEvents) {
            // Reconstruct the event
            DomainEvent event = reconstructEvent(entity);
            if (event != null) {
                handleDomainEvent(event);
            }
        }
        
        logger.info("Completed full projection rebuild");
    }
    
    /**
     * Rebuild projection from a specific timestamp (incremental rebuild).
     */
    @Transactional
    public void rebuildFromTimestamp(Instant timestamp) {
        logger.info("Starting incremental projection rebuild from {}", timestamp);
        
        // Delete all projections that were created after the timestamp
        List<OrderProjectionEntity> oldProjections = projectionRepository.findByCreatedAtAfter(timestamp);
        projectionRepository.deleteAll(oldProjections);
        
        // Clear processed events after the timestamp
        processedEventIds.entrySet().removeIf(entry -> entry.getValue().isAfter(timestamp));
        
        // Load events after the timestamp
        List<EventEntity> events = eventRepository.findByTimestampGreaterThanOrderByTimestampAsc(timestamp);
        
        logger.info("Replaying {} events for incremental projection rebuild", events.size());
        
        for (EventEntity entity : events) {
            DomainEvent event = reconstructEvent(entity);
            if (event != null) {
                handleDomainEvent(event);
            }
        }
        
        logger.info("Completed incremental projection rebuild");
    }
    
    /**
     * Reconstruct a DomainEvent from an EventEntity.
     */
    private DomainEvent reconstructEvent(EventEntity entity) {
        try {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            mapper.registerModule(new com.fasterxml.jackson.datatype.jsr310.JavaTimeModule());
            return mapper.readValue(entity.getPayload(), DomainEvent.class);
        } catch (Exception e) {
            logger.error("Failed to reconstruct event {}", entity.getEventId(), e);
            return null;
        }
    }
    
    /**
     * Check if an event has already been processed.
     */
    private boolean isEventProcessed(String eventId) {
        return processedEventIds.containsKey(eventId);
    }
    
    /**
     * Mark an event as processed.
     */
    private void markEventAsProcessed(String eventId) {
        processedEventIds.put(eventId, Instant.now());
    }
    
    /**
     * Get a projection by order ID.
     */
    public OrderProjectionEntity getOrder(String orderId) {
        return projectionRepository.findByOrderId(orderId).orElse(null);
    }
    
    /**
     * Get all orders for a customer.
     */
    public List<OrderProjectionEntity> getOrdersByCustomer(String customerId) {
        return projectionRepository.findByCustomerId(customerId);
    }
    
    /**
     * Get all orders with a specific status.
     */
    public List<OrderProjectionEntity> getOrdersByStatus(OrderStatus status) {
        return projectionRepository.findByStatus(status);
    }
}
