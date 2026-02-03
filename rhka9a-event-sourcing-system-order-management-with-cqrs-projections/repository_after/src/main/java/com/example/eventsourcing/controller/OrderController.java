package com.example.eventsourcing.controller;

import com.example.eventsourcing.domain.order.*;
import com.example.eventsourcing.infrastructure.projection.OrderProjection;
import com.example.eventsourcing.infrastructure.projection.OrderProjectionEntity;
import com.example.eventsourcing.service.OrderService;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * REST Controller for Order operations.
 */
@RestController
@RequestMapping("/api/orders")
public class OrderController {
    
    private static final Logger logger = LoggerFactory.getLogger(OrderController.class);
    
    private final OrderService orderService;
    private final OrderProjection orderProjection;
    
    public OrderController(OrderService orderService, OrderProjection orderProjection) {
        this.orderService = orderService;
        this.orderProjection = orderProjection;
    }
    
    @PostMapping
    public ResponseEntity<OrderResponse> createOrder(@Valid @RequestBody CreateOrderCommand command) {
        logger.info("Creating order for customer: {}", command.getCustomerId());
        
        OrderAggregate order = orderService.createOrder(command.getCustomerId());
        
        OrderResponse response = new OrderResponse(
                order.getAggregateId(),
                order.getCustomerId(),
                order.getStatus().name(),
                order.getTotalAmount(),
                order.getItemCount(),
                order.getCreatedAt()
        );
        
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }
    
    @PostMapping("/{orderId}/items")
    public ResponseEntity<OrderResponse> addItem(
            @PathVariable String orderId,
            @Valid @RequestBody AddItemCommand command) {
        logger.info("Adding item to order: {}", orderId);
        
        OrderAggregate order = orderService.addItem(
                orderId,
                command.getProductId(),
                command.getProductName(),
                command.getQuantity(),
                command.getUnitPrice()
        );
        
        return ResponseEntity.ok(toResponse(order));
    }
    
    @DeleteMapping("/{orderId}/items/{productId}")
    public ResponseEntity<OrderResponse> removeItem(
            @PathVariable String orderId,
            @PathVariable String productId) {
        logger.info("Removing item {} from order: {}", productId, orderId);
        
        OrderAggregate order = orderService.removeItem(orderId, productId);
        
        return ResponseEntity.ok(toResponse(order));
    }
    
    @PostMapping("/{orderId}/submit")
    public ResponseEntity<OrderResponse> submitOrder(@PathVariable String orderId) {
        logger.info("Submitting order: {}", orderId);
        
        OrderAggregate order = orderService.submitOrder(orderId);
        
        return ResponseEntity.ok(toResponse(order));
    }
    
    @GetMapping("/{orderId}")
    public ResponseEntity<OrderAggregate> getOrder(@PathVariable String orderId) {
        logger.debug("Getting order: {}", orderId);
        
        OrderAggregate order = orderService.getOrder(orderId);
        
        return ResponseEntity.ok(order);
    }
    
    @GetMapping("/{orderId}/projection")
    public ResponseEntity<OrderProjectionEntity> getOrderProjection(@PathVariable String orderId) {
        logger.debug("Getting order projection: {}", orderId);
        
        OrderProjectionEntity projection = orderService.getOrderProjection(orderId);
        
        if (projection == null) {
            return ResponseEntity.notFound().build();
        }
        
        return ResponseEntity.ok(projection);
    }
    
    @GetMapping("/customer/{customerId}")
    public ResponseEntity<List<OrderProjectionEntity>> getOrdersByCustomer(@PathVariable String customerId) {
        logger.debug("Getting orders for customer: {}", customerId);
        
        List<OrderProjectionEntity> orders = orderService.getOrdersByCustomer(customerId);
        
        return ResponseEntity.ok(orders);
    }
    
    @PostMapping("/projection/rebuild")
    public ResponseEntity<Void> rebuildProjection() {
        logger.info("Rebuilding order projection");
        
        orderService.rebuildProjection();
        
        return ResponseEntity.accepted().build();
    }
    
    private OrderResponse toResponse(OrderAggregate order) {
        return new OrderResponse(
                order.getAggregateId(),
                order.getCustomerId(),
                order.getStatus().name(),
                order.getTotalAmount(),
                order.getItemCount(),
                order.getCreatedAt()
        );
    }
    
    public record OrderResponse(
            String orderId,
            String customerId,
            String status,
            java.math.BigDecimal totalAmount,
            int itemCount,
            java.time.Instant createdAt
    ) {}
}
