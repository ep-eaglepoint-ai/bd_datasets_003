package com.example.eventsourcing.domain.order;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests for event serialization and deserialization.
 */
@DisplayName("Event Serialization Tests")
class EventSerializationTest {
    
    private ObjectMapper objectMapper;
    
    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());
    }
    
    @Test
    @DisplayName("should serialize and deserialize OrderCreatedEvent")
    void shouldSerializeAndDeserializeOrderCreatedEvent() throws Exception {
        UUID eventId = UUID.randomUUID();
        UUID aggregateId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        Instant occurredAt = Instant.now();
        
        OrderCreatedEvent original = new OrderCreatedEvent(
            eventId, aggregateId, 1L, occurredAt, customerId
        );
        
        String json = objectMapper.writeValueAsString(original);
        OrderCreatedEvent deserialized = objectMapper.readValue(json, OrderCreatedEvent.class);
        
        assertEquals(original.eventId(), deserialized.eventId());
        assertEquals(original.aggregateId(), deserialized.aggregateId());
        assertEquals(original.version(), deserialized.version());
        assertEquals(original.customerId(), deserialized.customerId());
    }
    
    @Test
    @DisplayName("should serialize and deserialize OrderItemAddedEvent")
    void shouldSerializeAndDeserializeOrderItemAddedEvent() throws Exception {
        UUID productId = UUID.randomUUID();
        BigDecimal unitPrice = BigDecimal.valueOf(123.45);
        
        OrderItemAddedEvent original = new OrderItemAddedEvent(
            UUID.randomUUID(), UUID.randomUUID(), 1L, Instant.now(),
            productId, 5, unitPrice
        );
        
        String json = objectMapper.writeValueAsString(original);
        OrderItemAddedEvent deserialized = objectMapper.readValue(json, OrderItemAddedEvent.class);
        
        assertEquals(original.productId(), deserialized.productId());
        assertEquals(original.quantity(), deserialized.quantity());
        assertEquals(original.unitPrice(), deserialized.unitPrice());
    }
    
    @Test
    @DisplayName("should serialize and deserialize OrderItemRemovedEvent")
    void shouldSerializeAndDeserializeOrderItemRemovedEvent() throws Exception {
        UUID productId = UUID.randomUUID();
        
        OrderItemRemovedEvent original = new OrderItemRemovedEvent(
            UUID.randomUUID(), UUID.randomUUID(), 1L, Instant.now(), productId
        );
        
        String json = objectMapper.writeValueAsString(original);
        OrderItemRemovedEvent deserialized = objectMapper.readValue(json, OrderItemRemovedEvent.class);
        
        assertEquals(original.productId(), deserialized.productId());
    }
    
    @Test
    @DisplayName("should serialize and deserialize OrderSubmittedEvent")
    void shouldSerializeAndDeserializeOrderSubmittedEvent() throws Exception {
        OrderSubmittedEvent original = new OrderSubmittedEvent(
            UUID.randomUUID(), UUID.randomUUID(), 1L, Instant.now()
        );
        
        String json = objectMapper.writeValueAsString(original);
        OrderSubmittedEvent deserialized = objectMapper.readValue(json, OrderSubmittedEvent.class);
        
        assertEquals(original.eventId(), deserialized.eventId());
        assertEquals(original.aggregateId(), deserialized.aggregateId());
        assertEquals(original.version(), deserialized.version());
    }
    
    @Test
    @DisplayName("should preserve BigDecimal precision in serialization")
    void shouldPreserveBigDecimalPrecisionInSerialization() throws Exception {
        BigDecimal precisePrice = new BigDecimal("99.99");
        
        OrderItemAddedEvent original = new OrderItemAddedEvent(
            UUID.randomUUID(), UUID.randomUUID(), 1L, Instant.now(),
            UUID.randomUUID(), 1, precisePrice
        );
        
        String json = objectMapper.writeValueAsString(original);
        OrderItemAddedEvent deserialized = objectMapper.readValue(json, OrderItemAddedEvent.class);
        
        assertEquals(0, precisePrice.compareTo(deserialized.unitPrice()));
    }
    
    @Test
    @DisplayName("should serialize events with all required fields")
    void shouldSerializeEventsWithAllRequiredFields() throws Exception {
        OrderCreatedEvent event = new OrderCreatedEvent(
            UUID.randomUUID(), UUID.randomUUID(), 1L, Instant.now(), UUID.randomUUID()
        );
        
        String json = objectMapper.writeValueAsString(event);
        
        assertTrue(json.contains("eventId"));
        assertTrue(json.contains("aggregateId"));
        assertTrue(json.contains("version"));
        assertTrue(json.contains("occurredAt"));
        assertTrue(json.contains("customerId"));
    }
}

