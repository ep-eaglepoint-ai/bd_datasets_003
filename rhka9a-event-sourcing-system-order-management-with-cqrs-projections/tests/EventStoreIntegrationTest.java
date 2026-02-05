package com.example.eventsourcing.infrastructure;

import com.example.eventsourcing.domain.DomainEvent;
import com.example.eventsourcing.domain.order.OrderCreatedEvent;
import com.example.eventsourcing.infrastructure.persistence.EventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * PostgreSQL-backed integration tests for EventStore.
 * Validates event ordering, optimistic locking, and rebuild from full history.
 */
@SpringBootTest
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
@DisplayName("EventStore Integration Tests (PostgreSQL)")
class EventStoreIntegrationTest {

    @Autowired
    private EventStore eventStore;

    @Autowired
    private EventRepository eventRepository;

    @BeforeEach
    void cleanDatabase() {
        // Ensure tests are idempotent against a persistent PostgreSQL instance
        eventRepository.deleteAll();
    }

    @Test
    @DisplayName("Should persist and load events in strict version order")
    void shouldPersistAndLoadEventsInOrder() {
        String aggregateId = "order-int-1";

        DomainEvent e1 = new OrderCreatedEvent(aggregateId, 1L, "customer-1", BigDecimal.ZERO);
        DomainEvent e2 = new OrderCreatedEvent(aggregateId, 2L, "customer-1", BigDecimal.ONE);

        // appendEvents will enforce version = 0 before appending first batch
        eventStore.appendEvents(aggregateId, 0L, Arrays.asList(e1, e2));

        List<DomainEvent> loaded = eventStore.loadEvents(aggregateId);
        assertEquals(2, loaded.size());
        assertEquals(1L, loaded.get(0).getVersion());
        assertEquals(2L, loaded.get(1).getVersion());
    }

    @Test
    @DisplayName("Should enforce optimistic locking on concurrent updates")
    void shouldEnforceOptimisticLocking() {
        String aggregateId = "order-int-2";

        DomainEvent e1 = new OrderCreatedEvent(aggregateId, 1L, "customer-1", BigDecimal.ZERO);
        eventStore.appendEvents(aggregateId, 0L, List.of(e1));

        // Simulate stale writer expecting version 0 while DB already at version 1
        DomainEvent e2 = new OrderCreatedEvent(aggregateId, 2L, "customer-1", BigDecimal.ONE);

        assertThrows(
                com.example.eventsourcing.exception.ConcurrencyException.class,
                () -> eventStore.appendEvents(aggregateId, 0L, List.of(e2))
        );
    }

    @Test
    @DisplayName("Should rebuild aggregate state from full history via loadEvents")
    void shouldRebuildFromFullHistory() {
        String aggregateId = "order-int-3";

        DomainEvent e1 = new OrderCreatedEvent(aggregateId, 1L, "customer-1", BigDecimal.ZERO);
        DomainEvent e2 = new OrderCreatedEvent(aggregateId, 2L, "customer-1", new BigDecimal("10.00"));

        eventStore.appendEvents(aggregateId, 0L, Arrays.asList(e1, e2));

        List<DomainEvent> history = eventStore.loadEvents(aggregateId);
        assertEquals(2, history.size());

        // Rebuild a simple projection of the totalAmount from history as a sanity check
        BigDecimal total = history.stream()
                .filter(e -> e instanceof OrderCreatedEvent)
                .map(e -> ((OrderCreatedEvent) e).getTotalAmount())
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        assertEquals(new BigDecimal("10.00"), total);
    }
}


