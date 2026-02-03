package com.example.eventsourcing.domain.order;

import com.example.eventsourcing.domain.DomainEvent;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Objects;

/**
 * Event representing an order being submitted.
 */
public class OrderSubmittedEvent extends DomainEvent {
    
    private final String customerId;
    private final BigDecimal totalAmount;
    private final int itemCount;
    
    @JsonCreator
    public OrderSubmittedEvent(
            @JsonProperty("eventId") String eventId,
            @JsonProperty("aggregateId") String aggregateId,
            @JsonProperty("version") Long version,
            @JsonProperty("timestamp") Instant timestamp,
            @JsonProperty("customerId") String customerId,
            @JsonProperty("totalAmount") BigDecimal totalAmount,
            @JsonProperty("itemCount") int itemCount) {
        super(eventId, aggregateId, version, timestamp);
        this.customerId = Objects.requireNonNull(customerId, "Customer ID cannot be null");
        this.totalAmount = totalAmount != null ? totalAmount : BigDecimal.ZERO;
        this.itemCount = itemCount;
    }
    
    public OrderSubmittedEvent(String aggregateId, Long version, String customerId,
                               BigDecimal totalAmount, int itemCount) {
        super(aggregateId, version);
        this.customerId = Objects.requireNonNull(customerId, "Customer ID cannot be null");
        this.totalAmount = totalAmount != null ? totalAmount : BigDecimal.ZERO;
        this.itemCount = itemCount;
    }
    
    public String getCustomerId() {
        return customerId;
    }
    
    public BigDecimal getTotalAmount() {
        return totalAmount;
    }
    
    public int getItemCount() {
        return itemCount;
    }
    
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        if (!super.equals(o)) return false;
        OrderSubmittedEvent that = (OrderSubmittedEvent) o;
        return itemCount == that.itemCount &&
               Objects.equals(customerId, that.customerId) &&
               Objects.equals(totalAmount, that.totalAmount);
    }
    
    @Override
    public int hashCode() {
        return Objects.hash(super.hashCode(), customerId, totalAmount, itemCount);
    }
    
    @Override
    public String toString() {
        return "OrderSubmittedEvent{" +
               "customerId='" + customerId + '\'' +
               ", totalAmount=" + totalAmount +
               ", itemCount=" + itemCount +
               "} " + super.toString();
    }
}
