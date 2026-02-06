package com.example.orders.api;

import com.example.orders.command.*;
import com.example.orders.projection.OrderProjection;
import com.example.orders.query.OrderQueryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/orders")
public class OrderController {

    private final CommandHandler commandHandler;
    private final OrderQueryService queryService;

    public OrderController(CommandHandler commandHandler, OrderQueryService queryService) {
        this.commandHandler = commandHandler;
        this.queryService = queryService;
    }

    @PostMapping
    public ResponseEntity<String> createOrder(@RequestBody CreateOrderRequest request) {
        String orderId = UUID.randomUUID().toString();
        commandHandler.handle(new CreateOrderCommand(orderId, request.customerId()));
        return ResponseEntity.ok(orderId);
    }

    @PostMapping("/{orderId}/items")
    public ResponseEntity<Void> addItem(@PathVariable String orderId, @RequestBody AddItemRequest request) {
        commandHandler.handle(new AddItemCommand(orderId, request.productId(), request.quantity(), request.price()));
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/{orderId}/items/{productId}")
    public ResponseEntity<Void> removeItem(@PathVariable String orderId, @PathVariable String productId) {
        commandHandler.handle(new RemoveItemCommand(orderId, productId));
        return ResponseEntity.ok().build();
    }

    @PostMapping("/{orderId}/submit")
    public ResponseEntity<Void> submitOrder(@PathVariable String orderId, @RequestBody SubmitOrderRequest request) {
        commandHandler.handle(new SubmitOrderCommand(orderId, request.shippingAddress()));
        return ResponseEntity.ok().build();
    }

    @PostMapping("/{orderId}/cancel")
    public ResponseEntity<Void> cancelOrder(@PathVariable String orderId, @RequestBody CancelOrderRequest request) {
        commandHandler.handle(new CancelOrderCommand(orderId, request.reason()));
        return ResponseEntity.ok().build();
    }

    @PostMapping("/{orderId}/payment")
    public ResponseEntity<Void> receivePayment(@PathVariable String orderId, @RequestBody ReceivePaymentRequest request) {
        commandHandler.handle(new ReceivePaymentCommand(orderId, request.amount(), request.transactionId()));
        return ResponseEntity.ok().build();
    }

    @PostMapping("/{orderId}/ship")
    public ResponseEntity<Void> shipOrder(@PathVariable String orderId, @RequestBody ShipOrderRequest request) {
        commandHandler.handle(new ShipOrderCommand(orderId, request.trackingNumber()));
        return ResponseEntity.ok().build();
    }

    @GetMapping("/{orderId}")
    public ResponseEntity<OrderProjection> getOrder(@PathVariable String orderId) {
        return ResponseEntity.ok(queryService.getOrder(orderId));
    }

    @GetMapping
    public ResponseEntity<List<OrderProjection>> getAllOrders() {
        return ResponseEntity.ok(queryService.getAllOrders());
    }

    @GetMapping("/customer/{customerId}")
    public ResponseEntity<List<OrderProjection>> getOrdersByCustomer(@PathVariable String customerId) {
        return ResponseEntity.ok(queryService.getOrdersByCustomer(customerId));
    }

    @GetMapping("/status/{status}")
    public ResponseEntity<List<OrderProjection>> getOrdersByStatus(@PathVariable String status) {
        return ResponseEntity.ok(queryService.getOrdersByStatus(status));
    }

    record CreateOrderRequest(String customerId) {}
    record AddItemRequest(String productId, int quantity, BigDecimal price) {}
    record SubmitOrderRequest(String shippingAddress) {}
    record CancelOrderRequest(String reason) {}
    record ReceivePaymentRequest(BigDecimal amount, String transactionId) {}
    record ShipOrderRequest(String trackingNumber) {}
}
