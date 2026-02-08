package com.example.eventsourcing.domain.order;

import java.util.Objects;
import java.util.UUID;

/**
 * Command to remove an item from an order.
 */
public record RemoveItemCommand(UUID orderId, UUID productId) {
    public RemoveItemCommand {
        Objects.requireNonNull(orderId, "Order ID cannot be null");
        Objects.requireNonNull(productId, "Product ID cannot be null");
    }
}
