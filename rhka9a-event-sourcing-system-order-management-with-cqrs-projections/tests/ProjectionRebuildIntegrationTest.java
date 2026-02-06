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
import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

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
    
    @Test
    @DisplayName("Should rebuild projections from specific timestamp")
    void shouldRebuildProjectionFromTimestamp() throws InterruptedException {
        // Create events before the cutoff timestamp
        String order1 = "order-timestamp-1";
        eventStore.appendEvents(order1, 0L, List.of(
            new OrderCreatedEvent(order1, 1L, "customer-1", BigDecimal.ZERO)
        ));
        
        // Record cutoff timestamp
        Thread.sleep(100); // Ensure timestamp difference
        Instant cutoffTime = Instant.now();
        Thread.sleep(100); // Ensure timestamp difference
        
        // Create events after the cutoff timestamp
        String order2 = "order-timestamp-2";
        eventStore.appendEvents(order2, 0L, List.of(
            new OrderCreatedEvent(order2, 1L, "customer-2", BigDecimal.ZERO)
        ));
        
        String order3 = "order-timestamp-3";
        eventStore.appendEvents(order3, 0L, List.of(
            new OrderCreatedEvent(order3, 1L, "customer-3", BigDecimal.ZERO)
        ));
        
        // Rebuild from cutoff timestamp
        orderProjection.rebuildFromTimestamp(cutoffTime);
        
        // Verify only events after cutoff were processed
        assertFalse(projectionRepository.existsByOrderId(order1), 
            "Order 1 (before cutoff) should not have projection");
        assertTrue(projectionRepository.existsByOrderId(order2), 
            "Order 2 (after cutoff) should have projection");
        assertTrue(projectionRepository.existsByOrderId(order3), 
            "Order 3 (after cutoff) should have projection");
    }
    
    @Test
    @DisplayName("Should handle empty event set when rebuilding from timestamp")
    void shouldHandleEmptyEventSetWhenRebuildingFromTimestamp() {
        // Create events
        String orderId = "order-empty-rebuild";
        eventStore.appendEvents(orderId, 0L, List.of(
            new OrderCreatedEvent(orderId, 1L, "customer-1", BigDecimal.ZERO)
        ));
        
        // Rebuild from future timestamp (no events after this time)
        Instant futureTime = Instant.now().plusSeconds(3600);
        assertDoesNotThrow(() -> orderProjection.rebuildFromTimestamp(futureTime),
            "Should handle empty event set gracefully");
        
        // Verify no projections exist
        assertFalse(projectionRepository.existsByOrderId(orderId),
            "No projection should exist when no events after timestamp");
    }
    
    @Test
    @DisplayName("Should rebuild all events when timestamp is in the past")
    void shouldRebuildAllEventsWhenTimestampIsInPast() {
        // Create multiple events
        String order1 = "order-past-1";
        String order2 = "order-past-2";
        
        eventStore.appendEvents(order1, 0L, List.of(
            new OrderCreatedEvent(order1, 1L, "customer-1", BigDecimal.ZERO)
        ));
        eventStore.appendEvents(order2, 0L, List.of(
            new OrderCreatedEvent(order2, 1L, "customer-2", BigDecimal.ZERO)
        ));
        
        // Rebuild from far past
        Instant pastTime = Instant.now().minusSeconds(3600);
        orderProjection.rebuildFromTimestamp(pastTime);
        
        // Verify all projections exist
        assertTrue(projectionRepository.existsByOrderId(order1),
            "Order 1 should have projection");
        assertTrue(projectionRepository.existsByOrderId(order2),
            "Order 2 should have projection");
    }
    
    @Test
    @DisplayName("Should delete and recreate projections when rebuilding from timestamp")
    void shouldDeleteAndRecreateProjectionsWhenRebuildingFromTimestamp() throws InterruptedException {
        // Create initial event and let projection build
        String orderId = "order-delete-rebuild";
        eventStore.appendEvents(orderId, 0L, List.of(
            new OrderCreatedEvent(orderId, 1L, "customer-1", BigDecimal.ZERO)
        ));
        
        // Manually create projection (simulating it was built)
        OrderProjectionEntity manualProjection = new OrderProjectionEntity(
            orderId, "customer-1", OrderStatus.DRAFT, BigDecimal.ZERO, 0, Instant.now()
        );
        projectionRepository.save(manualProjection);
        
        // Verify projection exists
        assertTrue(projectionRepository.existsByOrderId(orderId));
        
        Thread.sleep(100);
        Instant rebuildTime = Instant.now().minusSeconds(10); // Before all events
        
        // Rebuild from timestamp - should delete and recreate
        orderProjection.rebuildFromTimestamp(rebuildTime);
        
        // Verify projection still exists (was recreated)
        assertTrue(projectionRepository.existsByOrderId(orderId),
            "Projection should be recreated after rebuild");
    }
    
    @Test
    @DisplayName("Should use pagination when rebuilding from timestamp with many events")
    void shouldUsePaginationWhenRebuildingFromTimestamp() throws InterruptedException {
        // Record start time
        Instant startTime = Instant.now();
        Thread.sleep(100);
        
        // Create many events (more than one page)
        for (int i = 1; i <= 150; i++) {
            String orderId = "order-pagination-" + i;
            eventStore.appendEvents(orderId, 0L, List.of(
                new OrderCreatedEvent(orderId, 1L, "customer-" + i, BigDecimal.ZERO)
            ));
        }
        
        // Rebuild from start time (should process all 150 events in batches)
        assertDoesNotThrow(() -> orderProjection.rebuildFromTimestamp(startTime),
            "Should handle pagination correctly");
        
        // Verify all projections were created
        long projectionCount = projectionRepository.count();
        assertEquals(150, projectionCount, 
            "All 150 projections should be created via paginated rebuild");
    }
}


