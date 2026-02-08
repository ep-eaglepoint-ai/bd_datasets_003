package com.example.eventsourcing.domain.order;

import java.math.BigDecimal;
import java.util.Objects;
import java.util.UUID;

/**
 * Command to add an item to an order.
 */
public record AddItemCommand(
    UUID orderId,
    UUID productId,
    int quantity,
    BigDecimal unitPrice
) {
    public AddItemCommand {
        Objects.requireNonNull(orderId, "Order ID cannot be null");
        Objects.requireNonNull(productId, "Product ID cannot be null");
        if (quantity <= 0) {
            throw new IllegalArgumentException("Quantity must be positive");
        }
        Objects.requireNonNull(unitPrice, "Unit price cannot be null");
        if (unitPrice.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Unit price must be positive");
        }
    }
}

