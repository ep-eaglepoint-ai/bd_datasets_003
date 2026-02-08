package com.example.eventsourcing.domain;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.example.eventsourcing.domain.order.OrderCreatedEvent;
import com.example.eventsourcing.domain.order.OrderItemAddedEvent;
import com.example.eventsourcing.domain.order.OrderItemRemovedEvent;
import com.example.eventsourcing.domain.order.OrderSubmittedEvent;

import java.time.Instant;
import java.util.UUID;

/**
 * Base interface for all domain events.
 * Uses Jackson polymorphic serialization for proper event type handling.
 */
@JsonTypeInfo(
    use = JsonTypeInfo.Id.CLASS,
    property = "@type"
)
@JsonSubTypes({
    @JsonSubTypes.Type(value = OrderCreatedEvent.class, name = "OrderCreatedEvent"),
    @JsonSubTypes.Type(value = OrderItemAddedEvent.class, name = "OrderItemAddedEvent"),
    @JsonSubTypes.Type(value = OrderItemRemovedEvent.class, name = "OrderItemRemovedEvent"),
    @JsonSubTypes.Type(value = OrderSubmittedEvent.class, name = "OrderSubmittedEvent")
})
public interface DomainEvent {
    UUID getEventId();
    UUID getAggregateId();
    Long getVersion();
    Instant getOccurredAt();
}

