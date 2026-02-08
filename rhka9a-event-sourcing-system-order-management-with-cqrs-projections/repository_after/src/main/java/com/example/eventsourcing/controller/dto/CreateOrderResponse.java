package com.example.eventsourcing.controller.dto;

import java.util.UUID;

/**
 * Response DTO for order creation.
 */
public record CreateOrderResponse(UUID orderId) {
}

