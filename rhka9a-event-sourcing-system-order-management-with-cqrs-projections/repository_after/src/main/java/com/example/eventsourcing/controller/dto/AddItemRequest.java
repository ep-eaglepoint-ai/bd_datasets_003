package com.example.eventsourcing.controller.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Request DTO for adding an item to an order.
 */
public record AddItemRequest(
    @NotNull(message = "Product ID is required")
    UUID productId,
    
    @Positive(message = "Quantity must be positive")
    int quantity,
    
    @NotNull(message = "Unit price is required")
    @Positive(message = "Unit price must be positive")
    BigDecimal unitPrice
) {
}

