package com.example.eventsourcing.domain.order;

import java.util.Objects;
import java.util.UUID;

/**
 * Command to create a new order.
 */
public record CreateOrderCommand(UUID customerId) {
    public CreateOrderCommand {
        Objects.requireNonNull(customerId, "Customer ID cannot be null");
    }
}

