package com.example.eventsourcing.service;

import com.example.eventsourcing.domain.order.*;
import com.example.eventsourcing.exception.AggregateNotFoundException;
import com.example.eventsourcing.infrastructure.AggregateRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Command service for order operations (write side).
 */
@Service
@Transactional
public class OrderService {
    
    private static final Logger log = LoggerFactory.getLogger(OrderService.class);
    
    @Autowired
    private AggregateRepository<OrderAggregate> repository;
    
    /**
     * Create a new order.
     */
    public UUID createOrder(CreateOrderCommand command) {
        UUID orderId = UUID.randomUUID();
        OrderAggregate order = new OrderAggregate(orderId);
        order.createOrder(command.customerId());
        
        repository.save(order);
        
        log.info("Order created: {}", orderId);
        return orderId;
    }
    
    /**
     * Add an item to an order.
     */
    public void addItem(AddItemCommand command) {
        OrderAggregate order = repository.load(command.orderId(), OrderAggregate.class)
            .orElseThrow(() -> new AggregateNotFoundException(
                "Order not found: " + command.orderId()));
        
        order.addItem(command.productId(), command.quantity(), command.unitPrice());
        
        repository.save(order);
        
        log.info("Item added to order {}: product={}, quantity={}",
            command.orderId(), command.productId(), command.quantity());
    }
    
    /**
     * Remove an item from an order.
     */
    public void removeItem(RemoveItemCommand command) {
        OrderAggregate order = repository.load(command.orderId(), OrderAggregate.class)
            .orElseThrow(() -> new AggregateNotFoundException(
                "Order not found: " + command.orderId()));
        
        order.removeItem(command.productId());
        
        repository.save(order);
        
        log.info("Item removed from order {}: product={}",
            command.orderId(), command.productId());
    }
    
    /**
     * Submit an order.
     */
    public void submitOrder(SubmitOrderCommand command) {
        OrderAggregate order = repository.load(command.orderId(), OrderAggregate.class)
            .orElseThrow(() -> new AggregateNotFoundException(
                "Order not found: " + command.orderId()));
        
        order.submitOrder();
        
        repository.save(order);
        
        log.info("Order submitted: {}", command.orderId());
    }
}

