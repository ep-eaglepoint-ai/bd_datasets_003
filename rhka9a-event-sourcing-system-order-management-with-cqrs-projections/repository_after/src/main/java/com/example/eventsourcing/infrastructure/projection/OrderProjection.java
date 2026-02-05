package com.example.eventsourcing.infrastructure.projection;

import com.example.eventsourcing.domain.DomainEvent;
import com.example.eventsourcing.domain.order.*;
import com.example.eventsourcing.infrastructure.DomainEventWrapper;
import com.example.eventsourcing.infrastructure.persistence.EventEntity;
import com.example.eventsourcing.infrastructure.persistence.EventRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

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
    private final ObjectMapper objectMapper;
    
    // In-memory cache of processed event IDs for fast idempotency within a JVM,
    // complemented by the persisted lastProcessedEventId in the projection entity.
    private final Map<String, Instant> processedEventIds = new ConcurrentHashMap<>();
    
    @Autowired
    public OrderProjection(OrderProjectionRepository projectionRepository,
                           EventRepository eventRepository,
                           ObjectMapper objectMapper) {
        this.projectionRepository = projectionRepository;
        this.eventRepository = eventRepository;
        this.objectMapper = objectMapper;
    }
    
    /**
     * Handle domain events published by the event store.
     * This method is idempotent - processing the same event multiple times has no effect.
     */
    @EventListener
    @Transactional
    public void handleDomainEvent(DomainEventWrapper wrapper) {
        // Unwrap the DomainEvent from the wrapper
        DomainEvent event = wrapper.getDomainEvent();
        String eventId = event.getEventId();
        
        // Check if this event has already been processed for this order (idempotency)
        if (isEventProcessed(event)) {
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
        
        // Mark event as processed for this order
        markEventAsProcessed(event);
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
        projection.setLastProcessedEventId(event.getEventId());
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
        projection.setLastProcessedEventId(event.getEventId());
        projectionRepository.save(projection);
        logger.debug("Updated order projection {} after adding item", orderId);
    }
    
    /**
     * Handle OrderItemRemovedEvent - update order totals and item count.
     * Uses newTotalAmount from the event for correct calculation.
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
        
        // Update the projection using the new total from the event
        projection.setTotalAmount(event.getNewTotalAmount());
        projection.setItemCount(Math.max(0, projection.getItemCount() - 1));
        projection.setLastProcessedEventId(event.getEventId());
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
        projection.setLastProcessedEventId(event.getEventId());
        
        projectionRepository.save(projection);
        logger.info("Updated order projection {} to SUBMITTED status", orderId);
    }
    
    /**
     * Rebuild the projection from scratch by replaying all events.
     * Uses streaming/batch loading to keep memory bounded.
     * This method is designed to not block ongoing operations.
     */
    @Transactional
    public void rebuildProjection() {
        logger.info("Starting full projection rebuild");
        
        // Clear the projection
        projectionRepository.deleteAll();
        // Clear in-memory idempotency cache so that all events are eligible for replay
        processedEventIds.clear();
        
        // Get total count for logging
        long totalEvents = eventRepository.count();
        logger.info("Replaying {} events for projection rebuild", totalEvents);
        
        // Load events in batches using pagination to keep memory bounded
        int pageSize = 100;
        int pageNumber = 0;
        Page<EventEntity> page;
        
        do {
            page = eventRepository.findAll(PageRequest.of(pageNumber, pageSize, Sort.by(Sort.Direction.ASC, "timestamp", "version")));
            
            for (EventEntity entity : page.getContent()) {
                // Reconstruct the event
                DomainEvent event = reconstructEvent(entity);
                if (event != null) {
                    handleDomainEventForRebuild(event);
                }
            }
            
            pageNumber++;
            logger.debug("Processed page {} of {} ({} events so far)", pageNumber, page.getTotalPages(), (pageNumber * pageSize));
            
        } while (page.hasNext());
        
        logger.info("Completed full projection rebuild");
    }
    
    /**
     * Handle a domain event during rebuild (without wrapper unwrapping).
     */
    private void handleDomainEventForRebuild(DomainEvent event) {
        String eventId = event.getEventId();
        
        // Check if this event has already been processed for this order (idempotency)
        if (isEventProcessed(event)) {
            logger.debug("Event {} already processed during rebuild, skipping", eventId);
            return;
        }
        
        logger.debug("Rebuild - Processing event {} of type {}", eventId, event.getEventType());
        
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
        markEventAsProcessed(event);
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
        
        // Load events after the timestamp in batches
        int pageSize = 100;
        int pageNumber = 0;
        Page<EventEntity> page;
        
        do {
            page = eventRepository.findByTimestampGreaterThanOrderByTimestampAsc(
                    timestamp, PageRequest.of(pageNumber, pageSize));
            
            for (EventEntity entity : page.getContent()) {
                DomainEvent event = reconstructEvent(entity);
                if (event != null) {
                    handleDomainEventForRebuild(event);
                }
            }
            
            pageNumber++;
            
        } while (page.hasNext());
        
        logger.info("Completed incremental projection rebuild");
    }
    
    /**
     * Reconstruct a DomainEvent from an EventEntity.
     * Uses the persisted event_type for polymorphic deserialization and the same
     * ObjectMapper configuration as the EventStore so numeric types (e.g. BigDecimal)
     * and type metadata are handled consistently.
     */
    private DomainEvent reconstructEvent(EventEntity entity) {
        try {
            Class<? extends DomainEvent> eventClass =
                    (Class<? extends DomainEvent>) Class.forName(entity.getEventType());
            return objectMapper.readValue(entity.getPayload(), eventClass);
        } catch (Exception e) {
            logger.error("Failed to reconstruct event {}", entity.getEventId(), e);
            return null;
        }
    }
    
    /**
     * Check if an event has already been processed for its aggregate.
     * Uses an in-memory cache for fast idempotency within the current JVM and
     * falls back to the persisted lastProcessedEventId for resilience across restarts.
     */
    private boolean isEventProcessed(DomainEvent event) {
        String eventId = event.getEventId();
        if (processedEventIds.containsKey(eventId)) {
            return true;
        }
        
        boolean persisted = projectionRepository.existsByOrderIdAndLastProcessedEventId(
                event.getAggregateId(), eventId);
        if (persisted) {
            processedEventIds.put(eventId, Instant.now());
        }
        return persisted;
    }
    
    /**
     * Mark an event as processed for its aggregate by updating the in-memory cache.
     * The projection handlers themselves are responsible for persisting lastProcessedEventId
     * on the entity before saving, so we avoid an extra save() call here.
     */
    private void markEventAsProcessed(DomainEvent event) {
        processedEventIds.put(event.getEventId(), Instant.now());
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
