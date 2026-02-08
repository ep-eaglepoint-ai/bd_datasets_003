package com.example.eventsourcing.domain.order;

import java.util.Objects;
import java.util.UUID;

/**
 * Command to submit an order.
 */
public record SubmitOrderCommand(UUID orderId) {
    public SubmitOrderCommand {
        Objects.requireNonNull(orderId, "Order ID cannot be null");
    }
}

