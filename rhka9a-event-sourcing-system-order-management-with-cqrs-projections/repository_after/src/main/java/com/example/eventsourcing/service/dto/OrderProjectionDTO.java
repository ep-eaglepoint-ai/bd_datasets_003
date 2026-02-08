package com.example.eventsourcing.service.dto;

import com.example.eventsourcing.domain.order.OrderStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * DTO for order projection query results.
 */
public record OrderProjectionDTO(
    UUID orderId,
    UUID customerId,
    OrderStatus status,
    BigDecimal totalAmount,
    Integer itemCount,
    Instant createdAt,
    Instant submittedAt
) {
}

