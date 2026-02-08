package com.example.eventsourcing.domain.order;

import java.math.BigDecimal;
import java.util.Objects;
import java.util.UUID;

/**
 * Order item value object.
 */
public record OrderItem(
    UUID productId,
    int quantity,
    BigDecimal unitPrice
) {
    public OrderItem {
        Objects.requireNonNull(productId, "Product ID cannot be null");
        if (quantity <= 0) {
            throw new IllegalArgumentException("Quantity must be positive");
        }
        Objects.requireNonNull(unitPrice, "Unit price cannot be null");
        if (unitPrice.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Unit price must be positive");
        }
    }
    
    public BigDecimal getTotalPrice() {
        return unitPrice.multiply(BigDecimal.valueOf(quantity));
    }
}

