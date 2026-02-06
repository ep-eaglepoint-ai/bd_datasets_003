package com.example.eventsourcing.domain;

import com.example.eventsourcing.domain.order.OrderAggregate;
import com.example.eventsourcing.domain.order.OrderCreatedEvent;
import com.example.eventsourcing.domain.order.OrderItemAddedEvent;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests for Requirement 3: Aggregate Base Class
 * Validates uncommitted events tracking, version management, and state rebuild from history.
 */
@DisplayName("Aggregate Base Class Tests")
class AggregateBaseClassTest {

    @Nested
    @DisplayName("Uncommitted Events Tracking")
    class UncommittedEventsTests {

        @Test
        @DisplayName("Should track uncommitted events")
        void shouldTrackUncommittedEvents() {
            OrderAggregate aggregate = OrderAggregate.createOrder("customer-123");

            assertTrue(aggregate.hasUncommittedChanges());
            assertEquals(1, aggregate.getUncommittedEventCount());
            assertFalse(aggregate.getUncommittedEvents().isEmpty());
        }

        @Test
        @DisplayName("Should track multiple uncommitted events")
        void shouldTrackMultipleUncommittedEvents() {
            OrderAggregate aggregate = OrderAggregate.createOrder("customer-123");
            aggregate.markEventsAsCommitted();

            aggregate.addItem("p1", "Product 1", 1, new BigDecimal("10.00"));
            aggregate.addItem("p2", "Product 2", 1, new BigDecimal("20.00"));
            aggregate.addItem("p3", "Product 3", 1, new BigDecimal("30.00"));

            assertEquals(3, aggregate.getUncommittedEventCount());
            assertTrue(aggregate.hasUncommittedChanges());
        }

        @Test
        @DisplayName("Should clear uncommitted events after marking as committed")
        void shouldClearUncommittedEventsAfterMarkingAsCommitted() {
            OrderAggregate aggregate = OrderAggregate.createOrder("customer-123");
            assertEquals(1, aggregate.getUncommittedEventCount());

            aggregate.markEventsAsCommitted();

            assertFalse(aggregate.hasUncommittedChanges());
            assertEquals(0, aggregate.getUncommittedEventCount());
            assertTrue(aggregate.getUncommittedEvents().isEmpty());
        }

        @Test
        @DisplayName("Should return unmodifiable list of uncommitted events")
        void shouldReturnUnmodifiableListOfUncommittedEvents() {
            OrderAggregate aggregate = OrderAggregate.createOrder("customer-123");

            List<DomainEvent> uncommitted = aggregate.getUncommittedEvents();

            assertThrows(UnsupportedOperationException.class, () -> {
                uncommitted.add(new OrderCreatedEvent("order-2", 1L, "customer-2", BigDecimal.ZERO));
            });
        }

        @Test
        @DisplayName("Should apply events immediately when registered")
        void shouldApplyEventsImmediatelyWhenRegistered() {
            OrderAggregate aggregate = OrderAggregate.createOrder("customer-123");
            aggregate.markEventsAsCommitted();

            // State before adding item
            int itemCountBefore = aggregate.getItemCount();
            BigDecimal totalBefore = aggregate.getTotalAmount();

            aggregate.addItem("p1", "Product 1", 2, new BigDecimal("10.00"));

            // State should be updated immediately
            assertEquals(itemCountBefore + 1, aggregate.getItemCount());
            assertEquals(0, totalBefore.add(new BigDecimal("20.00")).compareTo(aggregate.getTotalAmount()));
        }
    }

    @Nested
    @DisplayName("Version Tracking")
    class VersionTrackingTests {

        @Test
        @DisplayName("Should initialize with version 0")
        void shouldInitializeWithVersionZero() {
            OrderAggregate aggregate = new OrderAggregate();

            assertEquals(0L, aggregate.getVersion());
        }

        @Test
        @DisplayName("Should track version during state rebuild")
        void shouldTrackVersionDuringStateRebuild() {
            OrderAggregate aggregate = new OrderAggregate();
            aggregate.setAggregateId("order-123");

            List<DomainEvent> events = List.of(
                    new OrderCreatedEvent("order-123", 1L, "customer-123", BigDecimal.ZERO),
                    new OrderItemAddedEvent("order-123", 2L, "p1", "Product 1", 1,
                            new BigDecimal("10.00"), new BigDecimal("10.00")),
                    new OrderItemAddedEvent("order-123", 3L, "p2", "Product 2", 1,
                            new BigDecimal("20.00"), new BigDecimal("30.00"))
            );

            aggregate.loadFromHistory(events);

            assertEquals(3L, aggregate.getVersion());
        }

        @Test
        @DisplayName("Should calculate next version accounting for uncommitted events")
        void shouldCalculateNextVersionAccountingForUncommittedEvents() {
            OrderAggregate aggregate = OrderAggregate.createOrder("customer-123");
            aggregate.setVersion(5L);
            aggregate.markEventsAsCommitted();

            // Add first item - creates event with version 6, next version should be 7
            aggregate.addItem("p1", "Product 1", 1, new BigDecimal("10.00"));
            assertEquals(7L, aggregate.getNextVersion());

            // Add second item - creates event with version 7, next version should be 8
            aggregate.addItem("p2", "Product 2", 1, new BigDecimal("20.00"));
            assertEquals(8L, aggregate.getNextVersion());
        }

        @Test
        @DisplayName("Should update version after loading from history")
        void shouldUpdateVersionAfterLoadingFromHistory() {
            OrderAggregate aggregate = new OrderAggregate();
            aggregate.setAggregateId("order-123");

            List<DomainEvent> events = List.of(
                    new OrderCreatedEvent("order-123", 1L, "customer-123", BigDecimal.ZERO),
                    new OrderItemAddedEvent("order-123", 2L, "p1", "Product 1", 1,
                            new BigDecimal("10.00"), new BigDecimal("10.00"))
            );

            aggregate.loadFromHistory(events);

            assertEquals(2L, aggregate.getVersion());
        }
    }

    @Nested
    @DisplayName("State Rebuild from History")
    class StateRebuildTests {

        @Test
        @DisplayName("Should rebuild state from empty history")
        void shouldRebuildStateFromEmptyHistory() {
            OrderAggregate aggregate = new OrderAggregate();
            aggregate.setAggregateId("order-123");

            aggregate.loadFromHistory(List.of());

            assertEquals(0L, aggregate.getVersion());
            assertEquals(0, aggregate.getItemCount());
        }

        @Test
        @DisplayName("Should rebuild state from single event")
        void shouldRebuildStateFromSingleEvent() {
            OrderAggregate aggregate = new OrderAggregate();
            aggregate.setAggregateId("order-123");

            OrderCreatedEvent event = new OrderCreatedEvent("order-123", 1L, "customer-123", BigDecimal.ZERO);
            aggregate.loadFromHistory(List.of(event));

            assertEquals(1L, aggregate.getVersion());
            assertEquals("customer-123", aggregate.getCustomerId());
            assertEquals(0, aggregate.getItemCount());
        }

        @Test
        @DisplayName("Should rebuild state from multiple events in order")
        void shouldRebuildStateFromMultipleEventsInOrder() {
            OrderAggregate aggregate = new OrderAggregate();
            aggregate.setAggregateId("order-123");

            List<DomainEvent> events = List.of(
                    new OrderCreatedEvent("order-123", 1L, "customer-123", BigDecimal.ZERO),
                    new OrderItemAddedEvent("order-123", 2L, "p1", "Product 1", 2,
                            new BigDecimal("10.00"), new BigDecimal("20.00")),
                    new OrderItemAddedEvent("order-123", 3L, "p2", "Product 2", 1,
                            new BigDecimal("15.00"), new BigDecimal("35.00"))
            );

            aggregate.loadFromHistory(events);

            assertEquals(3L, aggregate.getVersion());
            assertEquals(2, aggregate.getItemCount());
            assertEquals(0, new BigDecimal("35.00").compareTo(aggregate.getTotalAmount()));
        }

        @Test
        @DisplayName("Should rebuild state correctly with 100+ events")
        void shouldRebuildStateCorrectlyWithManyEvents() {
            OrderAggregate aggregate = new OrderAggregate();
            aggregate.setAggregateId("order-123");

            List<DomainEvent> events = new java.util.ArrayList<>();
            events.add(new OrderCreatedEvent("order-123", 1L, "customer-123", BigDecimal.ZERO));

            BigDecimal expectedTotal = BigDecimal.ZERO;
            for (int i = 2; i <= 101; i++) {
                BigDecimal price = new BigDecimal(i * 10);
                expectedTotal = expectedTotal.add(price);
                events.add(new OrderItemAddedEvent("order-123", (long) i, "p" + (i - 1),
                        "Product " + (i - 1), 1, price, expectedTotal));
            }

            aggregate.loadFromHistory(events);

            assertEquals(101L, aggregate.getVersion());
            assertEquals(100, aggregate.getItemCount());
            assertEquals(0, expectedTotal.compareTo(aggregate.getTotalAmount()));
        }

        @Test
        @DisplayName("Should have no uncommitted events after loading from history")
        void shouldHaveNoUncommittedEventsAfterLoadingFromHistory() {
            OrderAggregate aggregate = new OrderAggregate();
            aggregate.setAggregateId("order-123");

            List<DomainEvent> events = List.of(
                    new OrderCreatedEvent("order-123", 1L, "customer-123", BigDecimal.ZERO),
                    new OrderItemAddedEvent("order-123", 2L, "p1", "Product 1", 1,
                            new BigDecimal("10.00"), new BigDecimal("10.00"))
            );

            aggregate.loadFromHistory(events);

            assertFalse(aggregate.hasUncommittedChanges());
            assertEquals(0, aggregate.getUncommittedEventCount());
        }

        @Test
        @DisplayName("Should apply events in correct order during rebuild")
        void shouldApplyEventsInCorrectOrderDuringRebuild() {
            OrderAggregate aggregate = new OrderAggregate();
            aggregate.setAggregateId("order-123");

            List<DomainEvent> events = List.of(
                    new OrderCreatedEvent("order-123", 1L, "customer-123", BigDecimal.ZERO),
                    new OrderItemAddedEvent("order-123", 2L, "p1", "Product 1", 2,
                            new BigDecimal("10.00"), new BigDecimal("20.00")),
                    new OrderItemAddedEvent("order-123", 3L, "p2", "Product 2", 1,
                            new BigDecimal("15.00"), new BigDecimal("35.00"))
            );

            aggregate.loadFromHistory(events);

            // Verify final state reflects all events in order
            assertEquals(2, aggregate.getItemCount());
            assertTrue(aggregate.getItems().containsKey("p1"));
            assertTrue(aggregate.getItems().containsKey("p2"));
            assertEquals(0, new BigDecimal("35.00").compareTo(aggregate.getTotalAmount()));
        }
    }

    @Nested
    @DisplayName("Aggregate Type")
    class AggregateTypeTests {

        @Test
        @DisplayName("Should return aggregate type name")
        void shouldReturnAggregateTypeName() {
            OrderAggregate aggregate = new OrderAggregate();

            String aggregateType = aggregate.getAggregateType();

            assertNotNull(aggregateType);
            assertEquals("OrderAggregate", aggregateType);
        }
    }

    @Nested
    @DisplayName("Aggregate Identity")
    class AggregateIdentityTests {

        @Test
        @DisplayName("Should use aggregate ID for equality")
        void shouldUseAggregateIdForEquality() {
            OrderAggregate aggregate1 = new OrderAggregate();
            aggregate1.setAggregateId("order-123");

            OrderAggregate aggregate2 = new OrderAggregate();
            aggregate2.setAggregateId("order-123");

            assertEquals(aggregate1, aggregate2);
            assertEquals(aggregate1.hashCode(), aggregate2.hashCode());
        }

        @Test
        @DisplayName("Should not be equal with different aggregate IDs")
        void shouldNotBeEqualWithDifferentAggregateIds() {
            OrderAggregate aggregate1 = new OrderAggregate();
            aggregate1.setAggregateId("order-123");

            OrderAggregate aggregate2 = new OrderAggregate();
            aggregate2.setAggregateId("order-456");

            assertNotEquals(aggregate1, aggregate2);
        }
    }
}

