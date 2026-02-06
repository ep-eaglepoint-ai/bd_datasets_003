package com.example.eventsourcing.domain.order;

import com.example.eventsourcing.config.EventSourcingProperties;
import com.example.eventsourcing.domain.DomainEvent;
import com.example.eventsourcing.domain.order.OrderItem;
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
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration test validating that snapshot restoration actually restores aggregate state correctly.
 * This test ensures that when an aggregate is loaded from a snapshot, all state fields
 * (items, customerId, status, totalAmount, etc.) are properly restored.
 */
@SpringBootTest
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
@DisplayName("Order snapshot state restoration tests")
class OrderSnapshotStateRestorationTest {

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
    @DisplayName("Snapshot restoration should restore all aggregate state fields correctly")
    void snapshotRestorationShouldRestoreAllStateFields() throws Exception {
        // Configure a small threshold to trigger snapshot quickly
        properties.getSnapshot().setThreshold(3);

        String customerId = "customer-snapshot-restore";
        OrderAggregate original = OrderAggregate.createOrder(customerId);
        String orderId = original.getAggregateId();

        // Save new aggregate with initial event
        OrderCreatedEvent initialEvent = (OrderCreatedEvent) original.getUncommittedEvents().get(0);
        original = orderAggregateRepository.saveNew(original, initialEvent);

        // Add items to build up state
        original.addItem("p1", "Product 1", 2, new BigDecimal("10.00"));
        original = orderAggregateRepository.save(original);

        original.addItem("p2", "Product 2", 1, new BigDecimal("20.00"));
        original = orderAggregateRepository.save(original);

        // At this point, we should have version 3 (initial + 2 items), which should trigger snapshot
        // Wait for async snapshot creation
        Thread.sleep(1000);

        // Verify snapshot exists
        SnapshotEntity snapshot = snapshotRepository
                .findTopByAggregateIdOrderByVersionDesc(orderId)
                .orElseThrow(() -> new AssertionError("Snapshot was not created"));

        assertEquals(3L, snapshot.getVersion(), "Snapshot should be at version 3");

        // Capture the original state at the snapshot version before adding more events
        String originalCustomerId = original.getCustomerId();
        OrderStatus originalStatus = original.getStatus();
        Map<String, OrderItem> originalItems = original.getItems();

        // Add more events after snapshot to verify we replay events after snapshot
        original.addItem("p3", "Product 3", 1, new BigDecimal("15.00"));
        original = orderAggregateRepository.save(original);


        // Now load the aggregate - it should restore from snapshot and replay only events after version 3
        OrderAggregate restored = orderAggregateRepository.load(orderId);

        // Verify all state fields were restored correctly
        assertEquals(originalCustomerId, restored.getCustomerId(),
                "Customer ID should be restored from snapshot");
        assertEquals(originalStatus, restored.getStatus(),
                "Status should be restored from snapshot");

        // Verify items were restored
        assertNotNull(restored.getItems(), "Items map should not be null");

        // Verify individual items were restored correctly
        for (String productId : originalItems.keySet()) {
            assertTrue(restored.getItems().containsKey(productId),
                    "Item " + productId + " should be restored");
            OrderItem originalItem = originalItems.get(productId);
            OrderItem restoredItem = restored.getItems().get(productId);
            assertEquals(originalItem.getProductId(), restoredItem.getProductId());
            assertEquals(originalItem.getProductName(), restoredItem.getProductName());
            assertEquals(originalItem.getQuantity(), restoredItem.getQuantity());
            assertEquals(0, originalItem.getUnitPrice().compareTo(restoredItem.getUnitPrice()));
        }

        // Verify that events after snapshot were also replayed
        // The restored aggregate should have p3 added (event after snapshot)
        assertTrue(restored.getItems().containsKey("p3"),
                "Events after snapshot should be replayed");
        assertEquals(3, restored.getItemCount(),
                "Item count should include items from snapshot and events after");
    }

    @Test
    @DisplayName("Snapshot restoration should work even when no events exist after snapshot")
    void snapshotRestorationShouldWorkWithNoEventsAfterSnapshot() throws Exception {
        // Configure threshold
        properties.getSnapshot().setThreshold(2);

        String customerId = "customer-snapshot-only";
        OrderAggregate original = OrderAggregate.createOrder(customerId);
        String orderId = original.getAggregateId();

        // Save new aggregate
        OrderCreatedEvent initialEvent = (OrderCreatedEvent) original.getUncommittedEvents().get(0);
        original = orderAggregateRepository.saveNew(original, initialEvent);

        // Add one item to reach version 2 (should trigger snapshot)
        original.addItem("p1", "Product 1", 1, new BigDecimal("10.00"));
        original = orderAggregateRepository.save(original);

        // Wait for snapshot creation
        Thread.sleep(1000);

        // Verify snapshot exists
        SnapshotEntity snapshot = snapshotRepository
                .findTopByAggregateIdOrderByVersionDesc(orderId)
                .orElseThrow(() -> new AssertionError("Snapshot was not created"));

        // Capture state at snapshot version
        String snapshotCustomerId = original.getCustomerId();
        BigDecimal snapshotTotalAmount = original.getTotalAmount();
        int snapshotItemCount = original.getItemCount();

        // Load aggregate - should restore from snapshot with no events after
        OrderAggregate restored = orderAggregateRepository.load(orderId);

        // Verify state was restored correctly
        assertEquals(snapshotCustomerId, restored.getCustomerId(),
                "Customer ID should be restored");
        assertEquals(0, snapshotTotalAmount.compareTo(restored.getTotalAmount()),
                "Total amount should be restored");
        assertEquals(snapshotItemCount, restored.getItemCount(),
                "Item count should be restored");
        assertEquals(1, restored.getItems().size(),
                "Should have one item restored from snapshot");
        assertTrue(restored.getItems().containsKey("p1"),
                "Item p1 should be restored from snapshot");

        // Verify no events were loaded after snapshot (since snapshot is at current version)
        List<DomainEvent> eventsAfterSnapshot = eventStore.loadEventsAfterVersion(orderId, snapshot.getVersion());
        assertEquals(0, eventsAfterSnapshot.size(),
                "No events should exist after snapshot version");
    }

    @Test
    @DisplayName("Snapshot restoration should correctly combine snapshot state with events after snapshot")
    void snapshotRestorationShouldCombineSnapshotAndEventsAfter() throws Exception {
        properties.getSnapshot().setThreshold(2);

        String customerId = "customer-combined";
        OrderAggregate original = OrderAggregate.createOrder(customerId);
        String orderId = original.getAggregateId();

        // Save and add items to trigger snapshot at version 2
        OrderCreatedEvent initialEvent = (OrderCreatedEvent) original.getUncommittedEvents().get(0);
        original = orderAggregateRepository.saveNew(original, initialEvent);

        original.addItem("p1", "Product 1", 1, new BigDecimal("10.00"));
        original = orderAggregateRepository.save(original);

        // Wait for snapshot
        Thread.sleep(1000);

        // Verify snapshot at version 2
        SnapshotEntity snapshot = snapshotRepository
                .findTopByAggregateIdOrderByVersionDesc(orderId)
                .orElseThrow(() -> new AssertionError("Snapshot was not created"));
        assertEquals(2L, snapshot.getVersion());

        // Add more items after snapshot
        original.addItem("p2", "Product 2", 2, new BigDecimal("15.00"));
        original = orderAggregateRepository.save(original);

        original.addItem("p3", "Product 3", 1, new BigDecimal("20.00"));
        original = orderAggregateRepository.save(original);

        // Load aggregate - should restore from snapshot (version 2) and replay events 3 and 4
        OrderAggregate restored = orderAggregateRepository.load(orderId);

        // Verify final state includes both snapshot state and events after
        assertEquals(3, restored.getItemCount(),
                "Should have 3 items: 1 from snapshot, 2 from events after");
        assertTrue(restored.getItems().containsKey("p1"),
                "p1 should be from snapshot");
        assertTrue(restored.getItems().containsKey("p2"),
                "p2 should be from event after snapshot");
        assertTrue(restored.getItems().containsKey("p3"),
                "p3 should be from event after snapshot");

        // Verify total amount is correct (10 + 30 + 20 = 60)
        BigDecimal expectedTotal = new BigDecimal("60.00");
        assertEquals(0, expectedTotal.compareTo(restored.getTotalAmount()),
                "Total amount should be sum of all items");

        // Verify version is correct
        assertEquals(4L, restored.getVersion(),
                "Version should be 4 (snapshot at 2, plus 2 events after)");
    }
}

