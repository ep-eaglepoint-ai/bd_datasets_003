package com.example.eventsourcing.infrastructure.projection;

import com.example.eventsourcing.domain.order.OrderStatus;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * JPA Entity representing an order projection (denormalized read model).
 */
public class OrderProjectionEntity {
    
    private String orderId;
    private String customerId;
    private OrderStatus status;
    private BigDecimal totalAmount;
    private int itemCount;
    private Instant createdAt;
    private Instant submittedAt;
    private Instant lastProcessedEventId;
    
    public OrderProjectionEntity() {
    }
    
    public OrderProjectionEntity(String orderId, String customerId, OrderStatus status,
                                  BigDecimal totalAmount, int itemCount, Instant createdAt) {
        this.orderId = orderId;
        this.customerId = customerId;
        this.status = status;
        this.totalAmount = totalAmount;
        this.itemCount = itemCount;
        this.createdAt = createdAt;
    }
    
    public String getOrderId() {
        return orderId;
    }
    
    public void setOrderId(String orderId) {
        this.orderId = orderId;
    }
    
    public String getCustomerId() {
        return customerId;
    }
    
    public void setCustomerId(String customerId) {
        this.customerId = customerId;
    }
    
    public OrderStatus getStatus() {
        return status;
    }
    
    public void setStatus(OrderStatus status) {
        this.status = status;
    }
    
    public BigDecimal getTotalAmount() {
        return totalAmount;
    }
    
    public void setTotalAmount(BigDecimal totalAmount) {
        this.totalAmount = totalAmount;
    }
    
    public int getItemCount() {
        return itemCount;
    }
    
    public void setItemCount(int itemCount) {
        this.itemCount = itemCount;
    }
    
    public Instant getCreatedAt() {
        return createdAt;
    }
    
    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
    
    public Instant getSubmittedAt() {
        return submittedAt;
    }
    
    public void setSubmittedAt(Instant submittedAt) {
        this.submittedAt = submittedAt;
    }
    
    public Instant getLastProcessedEventId() {
        return lastProcessedEventId;
    }
    
    public void setLastProcessedEventId(Instant lastProcessedEventId) {
        this.lastProcessedEventId = lastProcessedEventId;
    }
}
