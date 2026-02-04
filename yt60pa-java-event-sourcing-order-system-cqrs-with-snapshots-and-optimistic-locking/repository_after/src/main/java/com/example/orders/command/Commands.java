package com.example.orders.command;

import java.math.BigDecimal;

public class Commands {
    public record CreateOrderCommand(String orderId, String customerId, String idempotencyKey) {}
    public record AddItemCommand(String orderId, String productId, int quantity, BigDecimal price, String idempotencyKey) {}
    public record RemoveItemCommand(String orderId, String productId, String idempotencyKey) {}
    public record SubmitOrderCommand(String orderId, String shippingAddress, String idempotencyKey) {}
    public record CancelOrderCommand(String orderId, String reason, String idempotencyKey) {}
    public record PaymentReceivedCommand(String orderId, BigDecimal amount, String transactionId, String idempotencyKey) {}
    public record ShipOrderCommand(String orderId, String trackingNumber, String idempotencyKey) {}
}
