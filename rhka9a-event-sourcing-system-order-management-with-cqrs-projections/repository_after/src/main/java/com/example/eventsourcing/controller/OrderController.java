package com.example.eventsourcing.controller;

import com.example.eventsourcing.controller.dto.AddItemRequest;
import com.example.eventsourcing.controller.dto.CreateOrderRequest;
import com.example.eventsourcing.controller.dto.CreateOrderResponse;
import com.example.eventsourcing.domain.order.*;
import com.example.eventsourcing.service.OrderQueryService;
import com.example.eventsourcing.service.OrderService;
import com.example.eventsourcing.service.dto.OrderProjectionDTO;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * REST controller for order operations.
 */
@RestController
@RequestMapping("/api/orders")
public class OrderController {
    
    @Autowired
    private OrderService commandService;
    
    @Autowired
    private OrderQueryService queryService;
    
    /**
     * Create a new order.
     */
    @PostMapping
    public ResponseEntity<CreateOrderResponse> createOrder(
        @RequestBody @Valid CreateOrderRequest request
    ) {
        UUID orderId = commandService.createOrder(
            new CreateOrderCommand(request.customerId())
        );
        
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(new CreateOrderResponse(orderId));
    }
    
    /**
     * Add an item to an order.
     */
    @PostMapping("/{orderId}/items")
    public ResponseEntity<Void> addItem(
        @PathVariable UUID orderId,
        @RequestBody @Valid AddItemRequest request
    ) {
        commandService.addItem(new AddItemCommand(
            orderId,
            request.productId(),
            request.quantity(),
            request.unitPrice()
        ));
        
        return ResponseEntity.noContent().build();
    }
    
    /**
     * Remove an item from an order.
     */
    @DeleteMapping("/{orderId}/items/{productId}")
    public ResponseEntity<Void> removeItem(
        @PathVariable UUID orderId,
        @PathVariable UUID productId
    ) {
        commandService.removeItem(new RemoveItemCommand(orderId, productId));
        return ResponseEntity.noContent().build();
    }
    
    /**
     * Submit an order.
     */
    @PostMapping("/{orderId}/submit")
    public ResponseEntity<Void> submitOrder(@PathVariable UUID orderId) {
        commandService.submitOrder(new SubmitOrderCommand(orderId));
        return ResponseEntity.noContent().build();
    }
    
    /**
     * Get an order by ID.
     */
    @GetMapping("/{orderId}")
    public ResponseEntity<OrderProjectionDTO> getOrder(@PathVariable UUID orderId) {
        return queryService.getOrder(orderId)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }
    
    /**
     * Get all orders for a customer.
     */
    @GetMapping("/customer/{customerId}")
    public ResponseEntity<List<OrderProjectionDTO>> getOrdersByCustomer(
        @PathVariable UUID customerId
    ) {
        List<OrderProjectionDTO> orders = queryService.getOrdersByCustomer(customerId);
        return ResponseEntity.ok(orders);
    }
    
    /**
     * Get orders by customer and status.
     */
    @GetMapping("/customer/{customerId}/status/{status}")
    public ResponseEntity<List<OrderProjectionDTO>> getOrdersByCustomerAndStatus(
        @PathVariable UUID customerId,
        @PathVariable OrderStatus status
    ) {
        List<OrderProjectionDTO> orders = queryService.getOrdersByCustomerAndStatus(customerId, status);
        return ResponseEntity.ok(orders);
    }
}

