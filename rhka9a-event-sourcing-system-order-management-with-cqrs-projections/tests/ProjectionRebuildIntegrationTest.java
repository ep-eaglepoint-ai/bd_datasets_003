package com.example.eventsourcing.infrastructure.projection;

import com.example.eventsourcing.domain.DomainEvent;
import com.example.eventsourcing.domain.order.OrderCreatedEvent;
import com.example.eventsourcing.domain.order.OrderItemAddedEvent;
import com.example.eventsourcing.domain.order.OrderStatus;
import com.example.eventsourcing.infrastructure.EventStore;
import com.example.eventsourcing.infrastructure.persistence.EventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * Integration test validating full projection rebuild using paged event replay.
 * This indirectly exercises bounded-memory rebuild behavior via paging.
 */
@SpringBootTest
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
@DisplayName("Projection rebuild integration tests")
class ProjectionRebuildIntegrationTest {

    @Autowired
    private EventStore eventStore;

    @Autowired
    private EventRepository eventRepository;

    @Autowired
    private OrderProjection orderProjection;

    @Autowired
    private OrderProjectionRepository projectionRepository;

    @BeforeEach
    void cleanDatabase() {
        projectionRepository.deleteAll();
        eventRepository.deleteAll();
    }

    @Test
    @DisplayName("Should rebuild projections from full event history")
    void shouldRebuildProjectionFromFullHistory() {
        String orderId = "order-proj-int-1";

        DomainEvent created = new OrderCreatedEvent(orderId, 1L, "customer-proj",
                BigDecimal.ZERO);
        DomainEvent itemAdded = new OrderItemAddedEvent(orderId, 2L, "p1", "Product",
                1, new BigDecimal("10.00"), new BigDecimal("10.00"));

        eventStore.appendEvents(orderId, 0L, List.of(created, itemAdded));

        // Rebuild projection from scratch using paged replay
        orderProjection.rebuildProjection();

        OrderProjectionEntity projection = projectionRepository.findByOrderId(orderId).orElse(null);
        assertNotNull(projection, "Projection should exist after rebuild");
        assertEquals("customer-proj", projection.getCustomerId());
        assertEquals(OrderStatus.DRAFT, projection.getStatus());
        // Use compareTo for BigDecimal so column scale normalization (10.0000 vs 10.00)
        // in the database does not cause a false-negative; value equality is what matters.
        assertEquals(0, projection.getTotalAmount().compareTo(new BigDecimal("10.00")));
        assertEquals(1, projection.getItemCount());
    }
}


