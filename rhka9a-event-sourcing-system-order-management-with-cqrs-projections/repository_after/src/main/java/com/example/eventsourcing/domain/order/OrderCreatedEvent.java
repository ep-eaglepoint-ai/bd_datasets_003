package com.example.eventsourcing.domain.order;

import com.example.eventsourcing.domain.DomainEvent;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Objects;

/**
 * Event representing the creation of a new order.
 */
public class OrderCreatedEvent extends DomainEvent {
    
    private final String customerId;
    private final BigDecimal totalAmount;
    
    @JsonCreator
    public OrderCreatedEvent(
            @JsonProperty("eventId") String eventId,
            @JsonProperty("aggregateId") String aggregateId,
            @JsonProperty("version") Long version,
            @JsonProperty("timestamp") Instant timestamp,
            @JsonProperty("customerId") String customerId,
            @JsonProperty("totalAmount") BigDecimal totalAmount) {
        super(eventId, aggregateId, version, timestamp);
        this.customerId = Objects.requireNonNull(customerId, "Customer ID cannot be null");
        this.totalAmount = totalAmount != null ? totalAmount : BigDecimal.ZERO;
    }
    
    public OrderCreatedEvent(String aggregateId, Long version, String customerId, BigDecimal totalAmount) {
        super(aggregateId, version);
        this.customerId = Objects.requireNonNull(customerId, "Customer ID cannot be null");
        this.totalAmount = totalAmount != null ? totalAmount : BigDecimal.ZERO;
    }
    
    public String getCustomerId() {
        return customerId;
    }
    
    public BigDecimal getTotalAmount() {
        return totalAmount;
    }
    
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        if (!super.equals(o)) return false;
        OrderCreatedEvent that = (OrderCreatedEvent) o;
        return Objects.equals(customerId, that.customerId) &&
               Objects.equals(totalAmount, that.totalAmount);
    }
    
    @Override
    public int hashCode() {
        return Objects.hash(super.hashCode(), customerId, totalAmount);
    }
    
    @Override
    public String toString() {
        return "OrderCreatedEvent{" +
               "customerId='" + customerId + '\'' +
               ", totalAmount=" + totalAmount +
               "} " + super.toString();
    }
}
