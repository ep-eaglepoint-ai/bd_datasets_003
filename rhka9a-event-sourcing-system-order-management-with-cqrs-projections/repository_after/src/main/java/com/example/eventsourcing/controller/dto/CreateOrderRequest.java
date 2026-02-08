package com.example.eventsourcing.controller.dto;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

/**
 * Request DTO for creating an order.
 */
public record CreateOrderRequest(
    @NotNull(message = "Customer ID is required")
    UUID customerId
) {
}

