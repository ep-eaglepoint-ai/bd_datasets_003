package com.example.orders;

import java.math.BigDecimal;
import java.time.Instant;

public class Order {
    private final long id;
    private final Instant createdAt;
    private final BigDecimal total;

    public Order(long id, Instant createdAt, BigDecimal total) {
        this.id = id;
        this.createdAt = createdAt;
        this.total = total;
    }

    public long getId() {
        return id;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public BigDecimal getTotal() {
        return total;
    }
}
