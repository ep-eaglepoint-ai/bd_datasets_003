package com.example.eventsourcing.domain.order;

import com.example.eventsourcing.config.EventSourcingProperties;
import com.example.eventsourcing.domain.DomainEvent;
import com.example.eventsourcing.infrastructure.AggregateRepository;
import com.example.eventsourcing.infrastructure.EventStore;
import com.example.eventsourcing.infrastructure.persistence.EventRepository;
import com.example.eventsourcing.infrastructure.persistence.SnapshotEntity;
import com.example.eventsourcing.infrastructure.persistence.SnapshotRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Integration test validating that snapshots are created and
 * reduce the number of events that must be loaded from the store.
 */
@SpringBootTest
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
@DisplayName("Order snapshots reduce event load (integration)")
class OrderSnapshotIntegrationTest {

    @Autowired
    private AggregateRepository<OrderAggregate, DomainEvent> orderAggregateRepository;

    @Autowired
    private SnapshotRepository snapshotRepository;

    @Autowired
    private EventRepository eventRepository;

    @Autowired
    private EventStore eventStore;

    @Autowired
    private EventSourcingProperties properties;

    @BeforeEach
    void cleanDatabase() {
        snapshotRepository.deleteAll();
        eventRepository.deleteAll();
    }

    @Test
    @DisplayName("Snapshot creation reduces number of events loaded after snapshot version")
    void snapshotReducesEventsLoadedAfterVersion() throws Exception {
        // Configure a very small threshold so we trigger a snapshot quickly
        properties.getSnapshot().setThreshold(2);

        String customerId = "customer-snap-integration";
        OrderAggregate aggregate = OrderAggregate.createOrder(customerId);

        // Save new aggregate with initial event
        OrderCreatedEvent initialEvent = (OrderCreatedEvent) aggregate.getUncommittedEvents().get(0);
        aggregate = orderAggregateRepository.saveNew(aggregate, initialEvent);

        // Generate additional events to cross snapshot threshold
        aggregate.addItem("p1", "Product 1", 1, new BigDecimal("5.00"));
        aggregate = orderAggregateRepository.save(aggregate);

        aggregate.addItem("p2", "Product 2", 1, new BigDecimal("10.00"));
        aggregate = orderAggregateRepository.save(aggregate);

        String aggregateId = aggregate.getAggregateId();

        // Wait briefly for async snapshot creation
        Thread.sleep(500);

        // Verify snapshot exists and capture its version
        SnapshotEntity snapshot = snapshotRepository
                .findTopByAggregateIdOrderByVersionDesc(aggregateId)
                .orElseThrow(() -> new AssertionError("Snapshot was not created"));

        long totalEvents = eventStore.loadEvents(aggregateId).size();
        long eventsAfterSnapshot = eventStore
                .loadEventsAfterVersion(aggregateId, snapshot.getVersion())
                .size();

        // Sanity: we created at least threshold events
        assertTrue(totalEvents >= properties.getSnapshot().getThreshold());

        // The number of events after the snapshot should be strictly less than total
        assertTrue(eventsAfterSnapshot < totalEvents,
                () -> "Expected fewer events after snapshot, but total=" + totalEvents +
                        ", afterSnapshot=" + eventsAfterSnapshot);
    }
}


