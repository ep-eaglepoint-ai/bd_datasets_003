package com.example.orders.projection;

import java.math.BigDecimal;
import java.time.Instant;

public class OrderProjection {
    public String id;
    public String customerId;
    public String status;
    public BigDecimal totalAmount;
    public int itemCount;
    public Instant createdAt;
    public Instant updatedAt;

    public OrderProjection() {}

    public OrderProjection(String id, String customerId, String status, BigDecimal totalAmount, int itemCount, Instant createdAt, Instant updatedAt) {
        this.id = id;
        this.customerId = customerId;
        this.status = status;
        this.totalAmount = totalAmount;
        this.itemCount = itemCount;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }
}
