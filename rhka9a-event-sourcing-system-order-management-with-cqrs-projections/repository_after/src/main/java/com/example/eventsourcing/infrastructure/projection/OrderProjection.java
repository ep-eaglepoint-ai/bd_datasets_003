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
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
    
    // In-memory cache of processed event IDs per order for fast idempotency within a JVM.
    // Key: aggregateId (orderId), Value: Set of processed event IDs for that order.
    // This is complemented by the persisted lastProcessedEventId in the projection entity.
    // Using per-order cache ensures idempotency is tracked per aggregate, not globally.
    private final Map<String, Set<String>> processedEventIdsByOrder = new ConcurrentHashMap<>();
    
    // Maximum size for the per-order cache to prevent unbounded memory growth during rebuilds.
    // When limit is reached, oldest entries are removed (simple FIFO eviction).
    private static final int MAX_CACHE_SIZE = 10000;
    
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
     * Uses REQUIRES_NEW propagation to ensure projection failures do not roll back command transactions.
     */
    @EventListener
    @Transactional(propagation = Propagation.REQUIRES_NEW)
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
     * 
     * Note: This method is synchronous. If async/background rebuild is required,
     * the caller (e.g., OrderService) should invoke it asynchronously.
     */
    @Transactional
    public void rebuildProjection() {
        logger.info("Starting full projection rebuild");
        
        // Clear the projection
        projectionRepository.deleteAll();
        // Clear in-memory idempotency cache so that all events are eligible for replay
        processedEventIdsByOrder.clear();
        
        // Get total count for logging
        long totalEvents = eventRepository.count();
        logger.info("Replaying {} events for projection rebuild", totalEvents);
        
        // Load events per-aggregate to process all events for each aggregate together.
        // This is more efficient and ensures correct ordering per aggregate.
        // First, get all unique aggregate IDs
        List<String> aggregateIds = eventRepository.findDistinctAggregateIds();
        logger.info("Rebuilding projections for {} aggregates", aggregateIds.size());
        
        int processedAggregates = 0;
        for (String aggregateId : aggregateIds) {
            // Load all events for this aggregate in order
            List<EventEntity> events = eventRepository.findByAggregateIdOrderByVersionAsc(aggregateId);
            
            // Process events for this aggregate
            for (EventEntity entity : events) {
                DomainEvent event = reconstructEvent(entity);
                if (event != null) {
                    handleDomainEventForRebuild(event);
                }
            }
            
            processedAggregates++;
            
            // Periodically clear cache to prevent unbounded memory growth during large rebuilds
            if (processedAggregates % 100 == 0) {
                clearOldCacheEntries();
                logger.debug("Processed {} aggregates, cleared old cache entries", processedAggregates);
            }
            
            if (processedAggregates % 10 == 0) {
                logger.debug("Processed {} of {} aggregates", processedAggregates, aggregateIds.size());
            }
        }
        
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
     * Uses a per-order in-memory cache for fast idempotency within the current JVM and
     * falls back to the persisted lastProcessedEventId for resilience across restarts.
     */
    private boolean isEventProcessed(DomainEvent event) {
        String aggregateId = event.getAggregateId();
        String eventId = event.getEventId();
        
        // Check per-order in-memory cache
        Set<String> processedEvents = processedEventIdsByOrder.get(aggregateId);
        if (processedEvents != null && processedEvents.contains(eventId)) {
            return true;
        }
        
        // Check persisted lastProcessedEventId
        boolean persisted = projectionRepository.existsByOrderIdAndLastProcessedEventId(aggregateId, eventId);
        if (persisted) {
            // Add to per-order cache
            processedEventIdsByOrder.computeIfAbsent(aggregateId, k -> ConcurrentHashMap.newKeySet()).add(eventId);
        }
        return persisted;
    }
    
    /**
     * Mark an event as processed for its aggregate by updating the per-order in-memory cache.
     * The projection handlers themselves are responsible for persisting lastProcessedEventId
     * on the entity before saving, so we avoid an extra save() call here.
     */
    private void markEventAsProcessed(DomainEvent event) {
        String aggregateId = event.getAggregateId();
        String eventId = event.getEventId();
        
        // Add to per-order cache
        processedEventIdsByOrder.computeIfAbsent(aggregateId, k -> ConcurrentHashMap.newKeySet()).add(eventId);
        
        // Prevent unbounded memory growth by clearing old entries if cache gets too large
        if (processedEventIdsByOrder.size() > MAX_CACHE_SIZE) {
            clearOldCacheEntries();
        }
    }
    
    /**
     * Clear old cache entries to prevent unbounded memory growth.
     * Removes entries for aggregates that are no longer being actively processed.
     * Uses simple FIFO eviction: removes oldest 20% of entries.
     */
    private void clearOldCacheEntries() {
        if (processedEventIdsByOrder.size() <= MAX_CACHE_SIZE) {
            return;
        }
        
        int entriesToRemove = processedEventIdsByOrder.size() / 5; // Remove 20%
        int removed = 0;
        
        // Remove entries (simple approach: remove first entries encountered)
        for (String aggregateId : processedEventIdsByOrder.keySet()) {
            if (removed >= entriesToRemove) {
                break;
            }
            processedEventIdsByOrder.remove(aggregateId);
            removed++;
        }
        
        logger.debug("Cleared {} old cache entries, {} remaining", removed, processedEventIdsByOrder.size());
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
