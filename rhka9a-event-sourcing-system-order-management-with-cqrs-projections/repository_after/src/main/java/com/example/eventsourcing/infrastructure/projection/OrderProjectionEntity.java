package com.example.eventsourcing.infrastructure.projection;

import com.example.eventsourcing.domain.order.OrderStatus;
import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * JPA Entity representing an order projection (denormalized read model).
 */
@Entity
@Table(name = "order_projections")
public class OrderProjectionEntity {
    
    @Id
    @Column(name = "order_id", length = 36)
    private String orderId;
    
    @Column(name = "customer_id", nullable = false, length = 36)
    private String customerId;
    
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private OrderStatus status;
    
    @Column(name = "total_amount", nullable = false, precision = 19, scale = 4)
    private BigDecimal totalAmount;
    
    @Column(name = "item_count", nullable = false)
    private int itemCount;
    
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
    
    @Column(name = "submitted_at")
    private Instant submittedAt;
    
    @Column(name = "last_processed_event_id", length = 36)
    private String lastProcessedEventId;
    
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
    
    public String getLastProcessedEventId() {
        return lastProcessedEventId;
    }
    
    public void setLastProcessedEventId(String lastProcessedEventId) {
        this.lastProcessedEventId = lastProcessedEventId;
    }
}
