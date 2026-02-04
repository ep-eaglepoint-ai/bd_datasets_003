package com.example.eventsourcing.domain.order;

import com.example.eventsourcing.domain.DomainEvent;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Objects;

/**
 * Event representing an item being removed from an order.
 */
public class OrderItemRemovedEvent extends DomainEvent {
    
    private final String productId;
    private final int previousQuantity;
    private final BigDecimal previousTotalAmount;
    private final BigDecimal newTotalAmount;
    
    @JsonCreator
    public OrderItemRemovedEvent(
            @JsonProperty("eventId") String eventId,
            @JsonProperty("aggregateId") String aggregateId,
            @JsonProperty("version") Long version,
            @JsonProperty("timestamp") Instant timestamp,
            @JsonProperty("productId") String productId,
            @JsonProperty("previousQuantity") int previousQuantity,
            @JsonProperty("previousTotalAmount") BigDecimal previousTotalAmount,
            @JsonProperty("newTotalAmount") BigDecimal newTotalAmount) {
        super(eventId, aggregateId, version, timestamp);
        this.productId = Objects.requireNonNull(productId, "Product ID cannot be null");
        this.previousQuantity = previousQuantity;
        this.previousTotalAmount = previousTotalAmount != null ? previousTotalAmount : BigDecimal.ZERO;
        this.newTotalAmount = newTotalAmount != null ? newTotalAmount : BigDecimal.ZERO;
    }
    
    public OrderItemRemovedEvent(String aggregateId, Long version, String productId,
                                 int previousQuantity, BigDecimal previousTotalAmount,
                                 BigDecimal newTotalAmount) {
        super(aggregateId, version);
        this.productId = Objects.requireNonNull(productId, "Product ID cannot be null");
        this.previousQuantity = previousQuantity;
        this.previousTotalAmount = previousTotalAmount != null ? previousTotalAmount : BigDecimal.ZERO;
        this.newTotalAmount = newTotalAmount != null ? newTotalAmount : BigDecimal.ZERO;
    }
    
    public String getProductId() {
        return productId;
    }
    
    public int getPreviousQuantity() {
        return previousQuantity;
    }
    
    public BigDecimal getPreviousTotalAmount() {
        return previousTotalAmount;
    }
    
    public BigDecimal getNewTotalAmount() {
        return newTotalAmount;
    }
    
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        if (!super.equals(o)) return false;
        OrderItemRemovedEvent that = (OrderItemRemovedEvent) o;
        return previousQuantity == that.previousQuantity &&
               Objects.equals(productId, that.productId) &&
               Objects.equals(previousTotalAmount, that.previousTotalAmount) &&
               Objects.equals(newTotalAmount, that.newTotalAmount);
    }
    
    @Override
    public int hashCode() {
        return Objects.hash(super.hashCode(), productId, previousQuantity, previousTotalAmount, newTotalAmount);
    }
    
    @Override
    public String toString() {
        return "OrderItemRemovedEvent{" +
               "productId='" + productId + '\'' +
               ", previousQuantity=" + previousQuantity +
               ", previousTotalAmount=" + previousTotalAmount +
               ", newTotalAmount=" + newTotalAmount +
               "} " + super.toString();
    }
}
