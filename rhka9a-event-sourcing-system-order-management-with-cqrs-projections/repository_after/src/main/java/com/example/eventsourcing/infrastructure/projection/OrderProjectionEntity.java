package com.example.eventsourcing.infrastructure.projection;

import com.example.eventsourcing.domain.order.OrderStatus;
import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Order projection entity (read model).
 */
@Entity
@Table(name = "order_projections",
       indexes = {
           @Index(name = "idx_projection_customer_id", columnList = "customer_id"),
           @Index(name = "idx_projection_status", columnList = "status"),
           @Index(name = "idx_projection_created_at", columnList = "created_at")
       })
public class OrderProjectionEntity {
    
    @Id
    @Column(columnDefinition = "UUID")
    private UUID orderId;
    
    @Column(nullable = false, columnDefinition = "UUID")
    private UUID customerId;
    
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 50)
    private OrderStatus status;
    
    @Column(nullable = false, precision = 19, scale = 2)
    private BigDecimal totalAmount;
    
    @Column(nullable = false)
    private Integer itemCount;
    
    @Column(nullable = false)
    private Instant createdAt;
    
    @Column
    private Instant submittedAt;
    
    @Column(nullable = false)
    private Instant updatedAt;
    
    @Version
    private Long version;
    
    // Constructors
    public OrderProjectionEntity() {
    }
    
    // Getters and Setters
    public UUID getOrderId() {
        return orderId;
    }
    
    public void setOrderId(UUID orderId) {
        this.orderId = orderId;
    }
    
    public UUID getCustomerId() {
        return customerId;
    }
    
    public void setCustomerId(UUID customerId) {
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
    
    public Integer getItemCount() {
        return itemCount;
    }
    
    public void setItemCount(Integer itemCount) {
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
    
    public Instant getUpdatedAt() {
        return updatedAt;
    }
    
    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
    
    public Long getVersion() {
        return version;
    }
    
    public void setVersion(Long version) {
        this.version = version;
    }
}

