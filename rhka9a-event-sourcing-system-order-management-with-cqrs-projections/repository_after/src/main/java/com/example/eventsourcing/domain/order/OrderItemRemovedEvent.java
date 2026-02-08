package com.example.eventsourcing.domain.order;

import com.example.eventsourcing.domain.DomainEvent;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * Event emitted when an item is removed from an order.
 */
public record OrderItemRemovedEvent(
    UUID eventId,
    UUID aggregateId,
    Long version,
    Instant occurredAt,
    UUID productId
) implements DomainEvent {
    
    @JsonCreator
    public OrderItemRemovedEvent(
        @JsonProperty("eventId") UUID eventId,
        @JsonProperty("aggregateId") UUID aggregateId,
        @JsonProperty("version") Long version,
        @JsonProperty("occurredAt") Instant occurredAt,
        @JsonProperty("productId") UUID productId
    ) {
        this.eventId = Objects.requireNonNull(eventId, "Event ID cannot be null");
        this.aggregateId = Objects.requireNonNull(aggregateId, "Aggregate ID cannot be null");
        this.version = Objects.requireNonNull(version, "Version cannot be null");
        this.occurredAt = Objects.requireNonNull(occurredAt, "Occurred at cannot be null");
        this.productId = Objects.requireNonNull(productId, "Product ID cannot be null");
    }
    
    @Override
    public UUID getEventId() {
        return eventId;
    }
    
    @Override
    public UUID getAggregateId() {
        return aggregateId;
    }
    
    @Override
    public Long getVersion() {
        return version;
    }
    
    @Override
    public Instant getOccurredAt() {
        return occurredAt;
    }
}

