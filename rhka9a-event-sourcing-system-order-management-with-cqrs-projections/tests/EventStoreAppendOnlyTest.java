package com.example.eventsourcing.infrastructure;

import com.example.eventsourcing.domain.DomainEvent;
import com.example.eventsourcing.domain.order.OrderCreatedEvent;
import com.example.eventsourcing.domain.order.OrderItemAddedEvent;
import com.example.eventsourcing.infrastructure.persistence.EventEntity;
import com.example.eventsourcing.infrastructure.persistence.EventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests for Requirement 1: Event Store Append-Only Semantics
 * Validates event ordering, serialization, large-scale scenarios, and edge cases.
 */
@SpringBootTest
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
@DisplayName("Event Store Append-Only Tests")
class EventStoreAppendOnlyTest {

    @Autowired
    private EventStore eventStore;

    @Autowired
    private EventRepository eventRepository;

    @BeforeEach
    void cleanDatabase() {
        eventRepository.deleteAll();
    }

    @Nested
    @DisplayName("Event Ordering")
    class EventOrderingTests {

        @Test
        @DisplayName("Should persist multiple events with strictly increasing version numbers")
        void shouldPersistMultipleEventsWithStrictlyIncreasingVersions() {
            String aggregateId = "order-ordering-1";

            List<DomainEvent> events = new ArrayList<>();
            for (int i = 1; i <= 5; i++) {
                events.add(new OrderCreatedEvent(aggregateId, (long) i, "customer-1", new BigDecimal(i * 10)));
            }

            eventStore.appendEvents(aggregateId, 0L, events);

            List<DomainEvent> loaded = eventStore.loadEvents(aggregateId);
            assertEquals(5, loaded.size());

            // Verify strictly increasing versions
            for (int i = 0; i < loaded.size(); i++) {
                assertEquals((long) (i + 1), loaded.get(i).getVersion(),
                        "Event at index " + i + " should have version " + (i + 1));
            }
        }

        @Test
        @DisplayName("Should maintain event order across multiple appends")
        void shouldMaintainEventOrderAcrossMultipleAppends() {
            String aggregateId = "order-ordering-2";

            // First append
            List<DomainEvent> batch1 = List.of(
                    new OrderCreatedEvent(aggregateId, 1L, "customer-1", BigDecimal.ZERO)
            );
            eventStore.appendEvents(aggregateId, 0L, batch1);

            // Second append
            List<DomainEvent> batch2 = List.of(
                    new OrderItemAddedEvent(aggregateId, 2L, "p1", "Product 1", 1,
                            new BigDecimal("10.00"), new BigDecimal("10.00"))
            );
            eventStore.appendEvents(aggregateId, 1L, batch2);

            // Third append
            List<DomainEvent> batch3 = List.of(
                    new OrderItemAddedEvent(aggregateId, 3L, "p2", "Product 2", 1,
                            new BigDecimal("20.00"), new BigDecimal("30.00"))
            );
            eventStore.appendEvents(aggregateId, 2L, batch3);

            List<DomainEvent> loaded = eventStore.loadEvents(aggregateId);
            assertEquals(3, loaded.size());
            assertEquals(1L, loaded.get(0).getVersion());
            assertEquals(2L, loaded.get(1).getVersion());
            assertEquals(3L, loaded.get(2).getVersion());
        }

        @Test
        @DisplayName("Should order events by version when loading")
        void shouldOrderEventsByVersionWhenLoading() {
            String aggregateId = "order-ordering-3";

            // Append events in non-sequential order (simulating concurrent appends that succeeded)
            eventStore.appendEvents(aggregateId, 0L, List.of(
                    new OrderCreatedEvent(aggregateId, 1L, "customer-1", BigDecimal.ZERO)
            ));
            eventStore.appendEvents(aggregateId, 1L, List.of(
                    new OrderItemAddedEvent(aggregateId, 2L, "p1", "Product 1", 1,
                            BigDecimal.ONE, BigDecimal.ONE)
            ));
            eventStore.appendEvents(aggregateId, 2L, List.of(
                    new OrderItemAddedEvent(aggregateId, 3L, "p2", "Product 2", 1,
                            BigDecimal.ONE, new BigDecimal("2.00"))
            ));

            List<DomainEvent> loaded = eventStore.loadEvents(aggregateId);

            // Verify events are in version order
            for (int i = 0; i < loaded.size() - 1; i++) {
                assertTrue(loaded.get(i).getVersion() < loaded.get(i + 1).getVersion(),
                        "Events should be in ascending version order");
            }
        }
    }

    @Nested
    @DisplayName("Event Serialization")
    class EventSerializationTests {

        @Test
        @DisplayName("Should serialize event type as fully qualified class name")
        void shouldSerializeEventTypeAsFullyQualifiedClassName() {
            String aggregateId = "order-serial-1";
            OrderCreatedEvent event = new OrderCreatedEvent(aggregateId, 1L, "customer-1", BigDecimal.ZERO);

            eventStore.appendEvents(aggregateId, 0L, List.of(event));

            EventEntity entity = eventRepository.findByAggregateIdOrderByVersionAsc(aggregateId).get(0);
            String eventType = entity.getEventType();

            assertNotNull(eventType);
            assertTrue(eventType.contains("OrderCreatedEvent"));
            assertTrue(eventType.contains("com.example.eventsourcing"));
            assertEquals("com.example.eventsourcing.domain.order.OrderCreatedEvent", eventType);
        }

        @Test
        @DisplayName("Should serialize event payload as valid JSON")
        void shouldSerializeEventPayloadAsValidJson() {
            String aggregateId = "order-serial-2";
            OrderItemAddedEvent event = new OrderItemAddedEvent(aggregateId, 1L, "product-1",
                    "Laptop", 2, new BigDecimal("999.99"), new BigDecimal("1999.98"));

            eventStore.appendEvents(aggregateId, 0L, List.of(event));

            EventEntity entity = eventRepository.findByAggregateIdOrderByVersionAsc(aggregateId).get(0);
            String payload = entity.getPayload();

            assertNotNull(payload);
            assertTrue(payload.startsWith("{") && payload.endsWith("}"));
            assertTrue(payload.contains("productId"));
            assertTrue(payload.contains("product-1"));
            assertTrue(payload.contains("999.99"));
        }

        @Test
        @DisplayName("Should preserve all event fields in serialized payload")
        void shouldPreserveAllEventFieldsInSerializedPayload() {
            String aggregateId = "order-serial-3";
            String customerId = "customer-123";
            BigDecimal totalAmount = new BigDecimal("150.75");
            OrderCreatedEvent event = new OrderCreatedEvent(aggregateId, 1L, customerId, totalAmount);

            eventStore.appendEvents(aggregateId, 0L, List.of(event));

            EventEntity entity = eventRepository.findByAggregateIdOrderByVersionAsc(aggregateId).get(0);
            String payload = entity.getPayload();

            assertTrue(payload.contains(aggregateId));
            assertTrue(payload.contains(customerId));
            assertTrue(payload.contains("150.75"));
        }
    }

    @Nested
    @DisplayName("Large-Scale Scenarios")
    class LargeScaleTests {

        @Test
        @DisplayName("Should handle large number of events (100+ events)")
        void shouldHandleLargeNumberOfEvents() {
            String aggregateId = "order-large-1";
            int eventCount = 150;

            List<DomainEvent> events = new ArrayList<>();
            for (int i = 1; i <= eventCount; i++) {
                events.add(new OrderItemAddedEvent(aggregateId, (long) i, "product-" + i,
                        "Product " + i, 1, BigDecimal.ONE, new BigDecimal(i)));
            }

            // Append in batches to simulate real-world usage
            int batchSize = 50;
            for (int i = 0; i < events.size(); i += batchSize) {
                int end = Math.min(i + batchSize, events.size());
                List<DomainEvent> batch = events.subList(i, end);
                eventStore.appendEvents(aggregateId, (long) i, batch);
            }

            List<DomainEvent> loaded = eventStore.loadEvents(aggregateId);
            assertEquals(eventCount, loaded.size());

            // Verify all versions are present and sequential
            for (int i = 0; i < loaded.size(); i++) {
                assertEquals((long) (i + 1), loaded.get(i).getVersion());
            }
        }

        @Test
        @DisplayName("Should maintain performance with many events")
        void shouldMaintainPerformanceWithManyEvents() {
            String aggregateId = "order-large-2";
            int eventCount = 200;

            long startTime = System.currentTimeMillis();

            // Append events
            for (int i = 1; i <= eventCount; i++) {
                List<DomainEvent> batch = List.of(
                        new OrderItemAddedEvent(aggregateId, (long) i, "product-" + i,
                                "Product " + i, 1, BigDecimal.ONE, new BigDecimal(i))
                );
                eventStore.appendEvents(aggregateId, (long) (i - 1), batch);
            }

            long appendTime = System.currentTimeMillis() - startTime;

            // Load events
            startTime = System.currentTimeMillis();
            List<DomainEvent> loaded = eventStore.loadEvents(aggregateId);
            long loadTime = System.currentTimeMillis() - startTime;

            assertEquals(eventCount, loaded.size());
            assertTrue(appendTime < 10000, "Appending 200 events should take less than 10 seconds");
            assertTrue(loadTime < 5000, "Loading 200 events should take less than 5 seconds");
        }
    }

    @Nested
    @DisplayName("Event ID Uniqueness")
    class EventIdUniquenessTests {

        @Test
        @DisplayName("Should generate unique event IDs")
        void shouldGenerateUniqueEventIds() {
            String aggregateId = "order-unique-1";

            List<DomainEvent> events = new ArrayList<>();
            for (int i = 1; i <= 10; i++) {
                events.add(new OrderCreatedEvent(aggregateId, (long) i, "customer-1", BigDecimal.ZERO));
            }

            eventStore.appendEvents(aggregateId, 0L, events);

            List<DomainEvent> loaded = eventStore.loadEvents(aggregateId);
            Set<String> eventIds = loaded.stream()
                    .map(DomainEvent::getEventId)
                    .collect(Collectors.toSet());

            assertEquals(10, eventIds.size(), "All event IDs should be unique");
        }

        @Test
        @DisplayName("Should maintain unique event IDs across different aggregates")
        void shouldMaintainUniqueEventIdsAcrossAggregates() {
            List<String> eventIds = new ArrayList<>();

            for (int i = 1; i <= 5; i++) {
                String aggregateId = "order-unique-" + i;
                OrderCreatedEvent event = new OrderCreatedEvent(aggregateId, 1L, "customer-1", BigDecimal.ZERO);
                eventStore.appendEvents(aggregateId, 0L, List.of(event));

                List<DomainEvent> loaded = eventStore.loadEvents(aggregateId);
                eventIds.add(loaded.get(0).getEventId());
            }

            Set<String> uniqueIds = eventIds.stream().collect(Collectors.toSet());
            assertEquals(5, uniqueIds.size(), "Event IDs across aggregates should be unique");
        }
    }

    @Nested
    @DisplayName("Timestamp Ordering")
    class TimestampOrderingTests {

        @Test
        @DisplayName("Should preserve event timestamps")
        void shouldPreserveEventTimestamps() throws InterruptedException {
            String aggregateId = "order-timestamp-1";

            List<DomainEvent> events = new ArrayList<>();
            List<Instant> timestamps = new ArrayList<>();

            for (int i = 1; i <= 5; i++) {
                Thread.sleep(10); // Small delay to ensure different timestamps
                Instant timestamp = Instant.now();
                timestamps.add(timestamp);
                events.add(new OrderCreatedEvent(UUID.randomUUID().toString(), aggregateId, (long) i, timestamp, "customer-1", BigDecimal.ZERO));
            }

            eventStore.appendEvents(aggregateId, 0L, events);

            List<DomainEvent> loaded = eventStore.loadEvents(aggregateId);
            assertEquals(5, loaded.size());

            // Verify timestamps are preserved
            for (int i = 0; i < loaded.size(); i++) {
                assertEquals(timestamps.get(i), loaded.get(i).getTimestamp(),
                        "Timestamp at index " + i + " should be preserved");
            }
        }

        @Test
        @DisplayName("Should order events by timestamp when versions are sequential")
        void shouldOrderEventsByTimestamp() throws InterruptedException {
            String aggregateId = "order-timestamp-2";

            List<Instant> timestamps = new ArrayList<>();
            for (int i = 1; i <= 3; i++) {
                Thread.sleep(10);
                timestamps.add(Instant.now());
                List<DomainEvent> batch = List.of(
                        new OrderCreatedEvent(UUID.randomUUID().toString(), aggregateId, (long) i, timestamps.get(i - 1), "customer-1", BigDecimal.ZERO)
                );
                eventStore.appendEvents(aggregateId, (long) (i - 1), batch);
            }

            List<DomainEvent> loaded = eventStore.loadEvents(aggregateId);

            // Verify timestamps are in order (should match version order)
            for (int i = 0; i < loaded.size() - 1; i++) {
                assertTrue(loaded.get(i).getTimestamp().isBefore(loaded.get(i + 1).getTimestamp()) ||
                                loaded.get(i).getTimestamp().equals(loaded.get(i + 1).getTimestamp()),
                        "Timestamps should be in ascending order");
            }
        }
    }

    @Nested
    @DisplayName("Edge Cases")
    class EdgeCaseTests {

        @Test
        @DisplayName("Should handle single event append")
        void shouldHandleSingleEventAppend() {
            String aggregateId = "order-edge-1";
            OrderCreatedEvent event = new OrderCreatedEvent(aggregateId, 1L, "customer-1", BigDecimal.ZERO);

            eventStore.appendEvents(aggregateId, 0L, List.of(event));

            List<DomainEvent> loaded = eventStore.loadEvents(aggregateId);
            assertEquals(1, loaded.size());
            assertEquals(1L, loaded.get(0).getVersion());
        }

        @Test
        @DisplayName("Should handle empty event list gracefully")
        void shouldHandleEmptyEventList() {
            String aggregateId = "order-edge-2";

            // This should not throw an exception
            assertDoesNotThrow(() -> {
                eventStore.appendEvents(aggregateId, 0L, List.of());
            });

            List<DomainEvent> loaded = eventStore.loadEvents(aggregateId);
            assertTrue(loaded.isEmpty());
        }

        @Test
        @DisplayName("Should handle events with null optional fields")
        void shouldHandleEventsWithNullOptionalFields() {
            String aggregateId = "order-edge-3";
            // OrderCreatedEvent with null totalAmount should default to ZERO
            OrderCreatedEvent event = new OrderCreatedEvent(aggregateId, 1L, "customer-1", null);

            eventStore.appendEvents(aggregateId, 0L, List.of(event));

            List<DomainEvent> loaded = eventStore.loadEvents(aggregateId);
            assertEquals(1, loaded.size());
            OrderCreatedEvent loadedEvent = (OrderCreatedEvent) loaded.get(0);
            assertEquals(BigDecimal.ZERO, loadedEvent.getTotalAmount());
        }
    }
}

