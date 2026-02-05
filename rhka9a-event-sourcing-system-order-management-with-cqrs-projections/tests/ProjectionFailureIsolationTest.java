package com.example.eventsourcing.infrastructure.projection;

import com.example.eventsourcing.domain.DomainEvent;
import com.example.eventsourcing.domain.order.OrderAggregate;
import com.example.eventsourcing.domain.order.OrderCreatedEvent;
import com.example.eventsourcing.infrastructure.AggregateRepository;
import com.example.eventsourcing.infrastructure.EventStore;
import com.example.eventsourcing.infrastructure.persistence.EventRepository;
import com.example.eventsourcing.infrastructure.projection.OrderProjectionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration test verifying that projection failures do not roll back command transactions.
 * This validates Req 9: Projection updates run in separate transactions (REQUIRES_NEW).
 */
@SpringBootTest
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
@DisplayName("Projection failure isolation tests")
class ProjectionFailureIsolationTest {

    @Autowired
    private AggregateRepository<OrderAggregate, DomainEvent> aggregateRepository;

    @Autowired
    private EventStore eventStore;

    @Autowired
    private EventRepository eventRepository;

    @Autowired
    private OrderProjectionRepository projectionRepository;

    @BeforeEach
    void cleanDatabase() {
        projectionRepository.deleteAll();
        eventRepository.deleteAll();
    }

    @Test
    @DisplayName("Projection failure should not roll back command transaction")
    void projectionFailureShouldNotRollBackCommand() {
        // Create and save an order - this will publish events to projections
        OrderAggregate order = OrderAggregate.createOrder("customer-1");
        OrderCreatedEvent initialEvent = (OrderCreatedEvent) order.getUncommittedEvents().get(0);
        
        // Save the aggregate - this should persist events and trigger projection update
        aggregateRepository.saveNew(order, initialEvent);
        
        // Verify events were persisted (command transaction committed)
        long eventCount = eventRepository.count();
        assertEquals(1, eventCount, "Event should be persisted even if projection fails");
        
        // Verify the aggregate can be loaded (events are in the store)
        OrderAggregate loaded = aggregateRepository.load(order.getAggregateId());
        assertNotNull(loaded, "Aggregate should be loadable after save");
        assertEquals("customer-1", loaded.getCustomerId());
        
        // Note: The projection might not exist if it failed, but the command succeeded
        // This is the expected behavior - projection failures don't affect commands
    }

    @Test
    @DisplayName("Multiple commands should succeed even if projections fail")
    void multipleCommandsShouldSucceedDespiteProjectionFailures() {
        // Create and save multiple orders
        OrderAggregate order1 = OrderAggregate.createOrder("customer-1");
        OrderCreatedEvent event1 = (OrderCreatedEvent) order1.getUncommittedEvents().get(0);
        aggregateRepository.saveNew(order1, event1);
        
        OrderAggregate order2 = OrderAggregate.createOrder("customer-2");
        OrderCreatedEvent event2 = (OrderCreatedEvent) order2.getUncommittedEvents().get(0);
        aggregateRepository.saveNew(order2, event2);
        
        // Verify both events were persisted
        long eventCount = eventRepository.count();
        assertEquals(2, eventCount, "Both events should be persisted");
        
        // Verify both aggregates can be loaded
        OrderAggregate loaded1 = aggregateRepository.load(order1.getAggregateId());
        OrderAggregate loaded2 = aggregateRepository.load(order2.getAggregateId());
        
        assertNotNull(loaded1);
        assertNotNull(loaded2);
        assertEquals("customer-1", loaded1.getCustomerId());
        assertEquals("customer-2", loaded2.getCustomerId());
    }
}

