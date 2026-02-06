package com.example.eventsourcing.domain;

import com.example.eventsourcing.domain.order.OrderCreatedEvent;
import com.example.eventsourcing.domain.order.OrderItemAddedEvent;
import com.example.eventsourcing.domain.order.OrderItemRemovedEvent;
import com.example.eventsourcing.domain.order.OrderSubmittedEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests for Requirement 6: Immutable Domain Events
 * Validates that events are immutable, serialize/deserialize correctly,
 * and handle polymorphic type information properly.
 */
@DisplayName("Domain Event Immutability Tests")
class DomainEventImmutabilityTest {

    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());
        objectMapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    }

    @Nested
    @DisplayName("Event Immutability")
    class ImmutabilityTests {

        @Test
        @DisplayName("Events should have final fields")
        void eventsShouldHaveFinalFields() {
            // Check OrderCreatedEvent fields
            Field[] fields = OrderCreatedEvent.class.getDeclaredFields();
            for (Field field : fields) {
                if (!field.isSynthetic()) {
                    assertTrue(Modifier.isFinal(field.getModifiers()),
                            "Field " + field.getName() + " should be final");
                }
            }
        }

        @Test
        @DisplayName("Events should not have setters")
        void eventsShouldNotHaveSetters() {
            // Check that events don't have setter methods
            java.lang.reflect.Method[] methods = OrderCreatedEvent.class.getMethods();
            for (java.lang.reflect.Method method : methods) {
                String methodName = method.getName();
                if (methodName.startsWith("set") && method.getParameterCount() == 1) {
                    fail("Event should not have setter method: " + methodName);
                }
            }
        }

        @Test
        @DisplayName("Event fields should be accessible only through getters")
        void eventFieldsShouldBeAccessibleOnlyThroughGetters() {
            String aggregateId = "order-123";
            OrderCreatedEvent event = new OrderCreatedEvent(aggregateId, 1L, "customer-123", BigDecimal.ZERO);

            // Verify fields are accessible through getters
            assertNotNull(event.getEventId());
            assertEquals(aggregateId, event.getAggregateId());
            assertEquals(1L, event.getVersion());
            assertNotNull(event.getTimestamp());
            assertEquals("customer-123", event.getCustomerId());
        }
    }

    @Nested
    @DisplayName("Event Serialization")
    class SerializationTests {

        @Test
        @DisplayName("Events should serialize to JSON correctly")
        void eventsShouldSerializeToJson() throws Exception {
            String aggregateId = "order-123";
            OrderCreatedEvent event = new OrderCreatedEvent(aggregateId, 1L, "customer-123", new BigDecimal("100.50"));

            String json = objectMapper.writeValueAsString(event);

            assertNotNull(json);
            assertTrue(json.contains(aggregateId));
            assertTrue(json.contains("customer-123"));
            assertTrue(json.contains("100.50"));
            assertTrue(json.contains("eventId"));
            assertTrue(json.contains("version"));
            assertTrue(json.contains("timestamp"));
        }

        @Test
        @DisplayName("Events should serialize with all fields")
        void eventsShouldSerializeWithAllFields() throws Exception {
            String aggregateId = "order-456";
            OrderItemAddedEvent event = new OrderItemAddedEvent(
                    aggregateId, 2L, "product-1", "Laptop", 2,
                    new BigDecimal("999.99"), new BigDecimal("1999.98"));

            String json = objectMapper.writeValueAsString(event);

            assertTrue(json.contains(aggregateId));
            assertTrue(json.contains("product-1"));
            assertTrue(json.contains("Laptop"));
            assertTrue(json.contains("999.99"));
            assertTrue(json.contains("1999.98"));
        }

        @Test
        @DisplayName("Events should serialize event type information")
        void eventsShouldSerializeEventType() throws Exception {
            OrderCreatedEvent event = new OrderCreatedEvent("order-123", 1L, "customer-123", BigDecimal.ZERO);

            String json = objectMapper.writeValueAsString(event);

            // Verify event type is included (either as @class or in eventType field)
            assertTrue(json.contains("OrderCreatedEvent") || json.contains("eventType"));
        }
    }

    @Nested
    @DisplayName("Event Deserialization")
    class DeserializationTests {

        @Test
        @DisplayName("Events should deserialize from JSON correctly")
        void eventsShouldDeserializeFromJson() throws Exception {
            String aggregateId = "order-123";
            OrderCreatedEvent original = new OrderCreatedEvent(aggregateId, 1L, "customer-123", new BigDecimal("100.50"));

            String json = objectMapper.writeValueAsString(original);
            OrderCreatedEvent deserialized = objectMapper.readValue(json, OrderCreatedEvent.class);

            assertEquals(original.getEventId(), deserialized.getEventId());
            assertEquals(original.getAggregateId(), deserialized.getAggregateId());
            assertEquals(original.getVersion(), deserialized.getVersion());
            assertEquals(original.getCustomerId(), deserialized.getCustomerId());
            assertEquals(0, original.getTotalAmount().compareTo(deserialized.getTotalAmount()));
        }

        @Test
        @DisplayName("Events should deserialize with correct concrete type")
        void eventsShouldDeserializeWithCorrectType() throws Exception {
            OrderItemAddedEvent original = new OrderItemAddedEvent(
                    "order-123", 2L, "product-1", "Laptop", 1,
                    new BigDecimal("999.99"), new BigDecimal("999.99"));

            String json = objectMapper.writeValueAsString(original);
            OrderItemAddedEvent deserialized = objectMapper.readValue(json, OrderItemAddedEvent.class);

            assertTrue(deserialized instanceof OrderItemAddedEvent);
            assertEquals(original.getProductId(), deserialized.getProductId());
            assertEquals(original.getProductName(), deserialized.getProductName());
            assertEquals(original.getQuantity(), deserialized.getQuantity());
        }

        @Test
        @DisplayName("Events should preserve version through serialize/deserialize cycle")
        void eventsShouldPreserveVersion() throws Exception {
            OrderCreatedEvent original = new OrderCreatedEvent("order-123", 5L, "customer-123", BigDecimal.ZERO);

            String json = objectMapper.writeValueAsString(original);
            OrderCreatedEvent deserialized = objectMapper.readValue(json, OrderCreatedEvent.class);

            assertEquals(5L, deserialized.getVersion());
        }

        @Test
        @DisplayName("Events should preserve timestamp through serialize/deserialize cycle")
        void eventsShouldPreserveTimestamp() throws Exception {
            Instant timestamp = Instant.now().minusSeconds(100);
            OrderCreatedEvent original = new OrderCreatedEvent(
                    UUID.randomUUID().toString(), "order-123", 1L, timestamp, "customer-123", BigDecimal.ZERO);

            String json = objectMapper.writeValueAsString(original);
            OrderCreatedEvent deserialized = objectMapper.readValue(json, OrderCreatedEvent.class);

            assertEquals(timestamp, deserialized.getTimestamp());
        }
    }

    @Nested
    @DisplayName("Polymorphic Type Handling")
    class PolymorphicTypeTests {

        @Test
        @DisplayName("Event type should be stored as fully qualified class name")
        void eventTypeShouldBeFullyQualifiedClassName() {
            OrderCreatedEvent event = new OrderCreatedEvent("order-123", 1L, "customer-123", BigDecimal.ZERO);

            String eventType = event.getEventType();

            assertNotNull(eventType);
            assertTrue(eventType.contains("OrderCreatedEvent"));
            assertTrue(eventType.contains("com.example.eventsourcing"));
        }

        @Test
        @DisplayName("Different event types should have different type names")
        void differentEventTypesShouldHaveDifferentTypeNames() {
            OrderCreatedEvent created = new OrderCreatedEvent("order-1", 1L, "customer-1", BigDecimal.ZERO);
            OrderItemAddedEvent added = new OrderItemAddedEvent("order-1", 2L, "p1", "Product", 1,
                    BigDecimal.ONE, BigDecimal.ONE);
            OrderSubmittedEvent submitted = new OrderSubmittedEvent("order-1", 3L, "customer-1",
                    BigDecimal.ONE, 1);

            assertNotEquals(created.getEventType(), added.getEventType());
            assertNotEquals(created.getEventType(), submitted.getEventType());
            assertNotEquals(added.getEventType(), submitted.getEventType());
        }
    }

    @Nested
    @DisplayName("Event Equality and HashCode")
    class EqualityTests {

        @Test
        @DisplayName("Events with same data should be equal")
        void eventsWithSameDataShouldBeEqual() {
            String eventId = "event-123";
            String aggregateId = "order-123";
            Long version = 1L;

            OrderCreatedEvent event1 = new OrderCreatedEvent(eventId, aggregateId, version,
                    Instant.now(), "customer-123", BigDecimal.ZERO);
            OrderCreatedEvent event2 = new OrderCreatedEvent(eventId, aggregateId, version,
                    event1.getTimestamp(), "customer-123", BigDecimal.ZERO);

            assertEquals(event1, event2);
            assertEquals(event1.hashCode(), event2.hashCode());
        }

        @Test
        @DisplayName("Events with different event IDs should not be equal")
        void eventsWithDifferentEventIdsShouldNotBeEqual() {
            String aggregateId = "order-123";
            Long version = 1L;

            OrderCreatedEvent event1 = new OrderCreatedEvent("event-1", aggregateId, version,
                    Instant.now(), "customer-123", BigDecimal.ZERO);
            OrderCreatedEvent event2 = new OrderCreatedEvent("event-2", aggregateId, version,
                    event1.getTimestamp(), "customer-123", BigDecimal.ZERO);

            assertNotEquals(event1, event2);
        }
    }

    @Nested
    @DisplayName("Event with All Event Types")
    class AllEventTypesTests {

        @Test
        @DisplayName("OrderCreatedEvent should serialize and deserialize correctly")
        void orderCreatedEventShouldSerializeDeserialize() throws Exception {
            OrderCreatedEvent original = new OrderCreatedEvent("order-123", 1L, "customer-123",
                    new BigDecimal("100.00"));

            String json = objectMapper.writeValueAsString(original);
            OrderCreatedEvent deserialized = objectMapper.readValue(json, OrderCreatedEvent.class);

            assertEquals(original.getCustomerId(), deserialized.getCustomerId());
            assertEquals(0, original.getTotalAmount().compareTo(deserialized.getTotalAmount()));
        }

        @Test
        @DisplayName("OrderItemAddedEvent should serialize and deserialize correctly")
        void orderItemAddedEventShouldSerializeDeserialize() throws Exception {
            OrderItemAddedEvent original = new OrderItemAddedEvent("order-123", 2L, "product-1",
                    "Laptop", 2, new BigDecimal("999.99"), new BigDecimal("1999.98"));

            String json = objectMapper.writeValueAsString(original);
            OrderItemAddedEvent deserialized = objectMapper.readValue(json, OrderItemAddedEvent.class);

            assertEquals(original.getProductId(), deserialized.getProductId());
            assertEquals(original.getQuantity(), deserialized.getQuantity());
            assertEquals(0, original.getUnitPrice().compareTo(deserialized.getUnitPrice()));
        }

        @Test
        @DisplayName("OrderItemRemovedEvent should serialize and deserialize correctly")
        void orderItemRemovedEventShouldSerializeDeserialize() throws Exception {
            OrderItemRemovedEvent original = new OrderItemRemovedEvent("order-123", 3L, "product-1",
                    2, new BigDecimal("1999.98"), new BigDecimal("999.99"));

            String json = objectMapper.writeValueAsString(original);
            OrderItemRemovedEvent deserialized = objectMapper.readValue(json, OrderItemRemovedEvent.class);

            assertEquals(original.getProductId(), deserialized.getProductId());
            assertEquals(0, original.getNewTotalAmount().compareTo(deserialized.getNewTotalAmount()));
        }

        @Test
        @DisplayName("OrderSubmittedEvent should serialize and deserialize correctly")
        void orderSubmittedEventShouldSerializeDeserialize() throws Exception {
            OrderSubmittedEvent original = new OrderSubmittedEvent("order-123", 4L, "customer-123",
                    new BigDecimal("1999.98"), 2);

            String json = objectMapper.writeValueAsString(original);
            OrderSubmittedEvent deserialized = objectMapper.readValue(json, OrderSubmittedEvent.class);

            assertEquals(original.getCustomerId(), deserialized.getCustomerId());
            assertEquals(original.getItemCount(), deserialized.getItemCount());
            assertEquals(0, original.getTotalAmount().compareTo(deserialized.getTotalAmount()));
        }
    }
}

