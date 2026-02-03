package com.example.eventsourcing.service;

import com.example.eventsourcing.domain.DomainEvent;
import com.example.eventsourcing.domain.order.OrderAggregate;
import com.example.eventsourcing.domain.order.OrderCreatedEvent;
import com.example.eventsourcing.domain.order.OrderItem;
import com.example.eventsourcing.exception.AggregateNotFoundException;
import com.example.eventsourcing.infrastructure.AggregateRepository;
import com.example.eventsourcing.infrastructure.projection.OrderProjection;
import com.example.eventsourcing.infrastructure.projection.OrderProjectionEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * Service for managing orders using event sourcing.
 */
@Service
public class OrderService {
    
    private static final Logger logger = LoggerFactory.getLogger(OrderService.class);
    
    private final AggregateRepository<OrderAggregate, DomainEvent> aggregateRepository;
    private final OrderProjection orderProjection;
    
    public OrderService(AggregateRepository<OrderAggregate, DomainEvent> aggregateRepository,
                       OrderProjection orderProjection) {
        this.aggregateRepository = aggregateRepository;
        this.orderProjection = orderProjection;
    }
    
    /**
     * Create a new order.
     */
    @Transactional
    public OrderAggregate createOrder(String customerId) {
        logger.info("Creating order for customer {}", customerId);
        
        // Create the aggregate
        OrderAggregate aggregate = OrderAggregate.createOrder(customerId);
        
        // Get the initial event
        OrderCreatedEvent initialEvent = (OrderCreatedEvent) aggregate.getUncommittedEvents().get(0);
        
        // Save the new aggregate
        OrderAggregate savedAggregate = aggregateRepository.saveNew(aggregate, initialEvent);
        
        logger.info("Created order {} for customer {}", savedAggregate.getAggregateId(), customerId);
        return savedAggregate;
    }
    
    /**
     * Add an item to an order.
     */
    @Transactional
    public OrderAggregate addItem(String orderId, String productId, String productName,
                                  int quantity, BigDecimal unitPrice) {
        logger.info("Adding item {} to order {}", productId, orderId);
        
        OrderAggregate aggregate = loadOrder(orderId);
        aggregate.addItem(productId, productName, quantity, unitPrice);
        
        return aggregateRepository.save(aggregate);
    }
    
    /**
     * Remove an item from an order.
     */
    @Transactional
    public OrderAggregate removeItem(String orderId, String productId) {
        logger.info("Removing item {} from order {}", productId, orderId);
        
        OrderAggregate aggregate = loadOrder(orderId);
        aggregate.removeItem(productId);
        
        return aggregateRepository.save(aggregate);
    }
    
    /**
     * Submit an order.
     */
    @Transactional
    public OrderAggregate submitOrder(String orderId) {
        logger.info("Submitting order {}", orderId);
        
        OrderAggregate aggregate = loadOrder(orderId);
        aggregate.submitOrder();
        
        return aggregateRepository.save(aggregate);
    }
    
    /**
     * Get an order by ID.
     */
    @Transactional(readOnly = true)
    public OrderAggregate getOrder(String orderId) {
        return loadOrder(orderId);
    }
    
    /**
     * Get the read model projection for an order.
     */
    @Transactional(readOnly = true)
    public OrderProjectionEntity getOrderProjection(String orderId) {
        return orderProjection.getOrder(orderId);
    }
    
    /**
     * Get all orders for a customer.
     */
    @Transactional(readOnly = true)
    public List<OrderProjectionEntity> getOrdersByCustomer(String customerId) {
        return orderProjection.getOrdersByCustomer(customerId);
    }
    
    /**
     * Rebuild the order projection from scratch.
     */
    @Transactional
    public void rebuildProjection() {
        logger.info("Rebuilding order projection");
        orderProjection.rebuildProjection();
    }
    
    /**
     * Load an order aggregate from the event store.
     */
    private OrderAggregate loadOrder(String orderId) {
        return aggregateRepository.load(orderId);
    }
    
    /**
     * Check if an order exists.
     */
    @Transactional(readOnly = true)
    public boolean orderExists(String orderId) {
        return aggregateRepository.exists(orderId);
    }
}
