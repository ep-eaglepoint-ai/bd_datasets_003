package com.example.eventsourcing.domain.order;

import com.example.eventsourcing.domain.DomainEvent;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Objects;

/**
 * Event representing an item being added to an order.
 */
public class OrderItemAddedEvent extends DomainEvent {
    
    private final String productId;
    private final String productName;
    private final int quantity;
    private final BigDecimal unitPrice;
    private final BigDecimal totalAmount;
    
    @JsonCreator
    public OrderItemAddedEvent(
            @JsonProperty("eventId") String eventId,
            @JsonProperty("aggregateId") String aggregateId,
            @JsonProperty("version") Long version,
            @JsonProperty("timestamp") Instant timestamp,
            @JsonProperty("productId") String productId,
            @JsonProperty("productName") String productName,
            @JsonProperty("quantity") int quantity,
            @JsonProperty("unitPrice") BigDecimal unitPrice,
            @JsonProperty("totalAmount") BigDecimal totalAmount) {
        super(eventId, aggregateId, version, timestamp);
        this.productId = Objects.requireNonNull(productId, "Product ID cannot be null");
        this.productName = Objects.requireNonNull(productName, "Product name cannot be null");
        this.quantity = quantity;
        this.unitPrice = Objects.requireNonNull(unitPrice, "Unit price cannot be null");
        this.totalAmount = totalAmount != null ? totalAmount : BigDecimal.ZERO;
    }
    
    public OrderItemAddedEvent(String aggregateId, Long version, String productId, 
                               String productName, int quantity, BigDecimal unitPrice,
                               BigDecimal totalAmount) {
        super(aggregateId, version);
        this.productId = Objects.requireNonNull(productId, "Product ID cannot be null");
        this.productName = Objects.requireNonNull(productName, "Product name cannot be null");
        this.quantity = quantity;
        this.unitPrice = Objects.requireNonNull(unitPrice, "Unit price cannot be null");
        this.totalAmount = totalAmount != null ? totalAmount : BigDecimal.ZERO;
    }
    
    public String getProductId() {
        return productId;
    }
    
    public String getProductName() {
        return productName;
    }
    
    public int getQuantity() {
        return quantity;
    }
    
    public BigDecimal getUnitPrice() {
        return unitPrice;
    }
    
    public BigDecimal getTotalAmount() {
        return totalAmount;
    }
    
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        if (!super.equals(o)) return false;
        OrderItemAddedEvent that = (OrderItemAddedEvent) o;
        return quantity == that.quantity &&
               Objects.equals(productId, that.productId) &&
               Objects.equals(productName, that.productName) &&
               Objects.equals(unitPrice, that.unitPrice) &&
               Objects.equals(totalAmount, that.totalAmount);
    }
    
    @Override
    public int hashCode() {
        return Objects.hash(super.hashCode(), productId, productName, quantity, unitPrice, totalAmount);
    }
    
    @Override
    public String toString() {
        return "OrderItemAddedEvent{" +
               "productId='" + productId + '\'' +
               ", productName='" + productName + '\'' +
               ", quantity=" + quantity +
               ", unitPrice=" + unitPrice +
               ", totalAmount=" + totalAmount +
               "} " + super.toString();
    }
}
