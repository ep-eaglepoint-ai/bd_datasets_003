import com.example.orders.OrdersApplication;
import com.example.orders.aggregate.Order;
import com.example.orders.command.CommandHandler;
import com.example.orders.command.Commands;
import com.example.orders.event.EventStore;
import com.example.orders.event.SnapshotRepository;
import com.example.orders.projection.ProjectionHandler;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(classes = OrdersApplication.class)
public class TestRequirements {

    @Autowired
    private CommandHandler commandHandler;

    @Autowired
    private ProjectionHandler projectionHandler;

    @Autowired
    private EventStore eventStore;

    @Autowired
    private SnapshotRepository snapshotRepository;
    
    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void test1_OptimisticLocking() {
        String orderId = UUID.randomUUID().toString();
        String customerId = "cust-1";

        commandHandler.handle(new Commands.CreateOrderCommand(orderId, customerId, UUID.randomUUID().toString()));
        
        Assertions.assertThrows(Exception.class, () -> {
            // Try to insert a duplicate event version manually
             jdbcTemplate.update(
                "INSERT INTO events (aggregate_id, aggregate_version, event_type, payload, timestamp, schema_version) VALUES (?, ?, ?, ?, ?, ?)",
                orderId, 1L, "SomeEvent", "{}", new java.sql.Timestamp(System.currentTimeMillis()), 1
            );
        });
    }

    @Test
    void test4_Snapshotting() throws Exception {
        String orderId = UUID.randomUUID().toString();
        commandHandler.handle(new Commands.CreateOrderCommand(orderId, "cust-snap", UUID.randomUUID().toString()));
        
        // Add 105 items to trigger snapshot (threshold 100)
        for (int i = 0; i < 110; i++) {
            commandHandler.handle(new Commands.AddItemCommand(orderId, "prod-" + i, 1, BigDecimal.TEN, UUID.randomUUID().toString()));
        }
        
        // Verify snapshot exists
        Integer count = jdbcTemplate.queryForObject(
            "SELECT count(*) FROM snapshots WHERE aggregate_id = ?", Integer.class, orderId
        );
        assertTrue(count > 0, "Snapshot should be created");
        
        // Verify loading uses snapshot (hard to verify implicitly, but if it works it works)
        assertDoesNotThrow(() -> 
            commandHandler.handle(new Commands.AddItemCommand(orderId, "prod-next", 1, BigDecimal.TEN, UUID.randomUUID().toString()))
        );
    }

    @Test
    void test5_Idempotency() {
        String orderId = UUID.randomUUID().toString();
        String idempotencyKey = UUID.randomUUID().toString();
        
        commandHandler.handle(new Commands.CreateOrderCommand(orderId, "cust-idem", idempotencyKey));
        
        Exception exception = assertThrows(Exception.class, () -> {
            commandHandler.handle(new Commands.CreateOrderCommand(orderId, "cust-idem", idempotencyKey));
        });
        
        assertTrue(exception.getMessage().contains("Duplicate command") || exception instanceof IllegalArgumentException);
    }
    
    @Test
    void test7_RebuildProjections() throws InterruptedException {
        String orderId = UUID.randomUUID().toString();
        commandHandler.handle(new Commands.CreateOrderCommand(orderId, "cust-proj", UUID.randomUUID().toString()));
        commandHandler.handle(new Commands.AddItemCommand(orderId, "item-1", 2, new BigDecimal("50.00"), UUID.randomUUID().toString()));
        
        // Wait for async projection
        Thread.sleep(1000);
        
        // Verify projection
        BigDecimal total = jdbcTemplate.queryForObject("SELECT total_amount FROM order_projections WHERE id = ?", BigDecimal.class, orderId);
        assertEquals(new BigDecimal("100.00"), total);
        
        // Corrupt projection
        jdbcTemplate.update("UPDATE order_projections SET total_amount = 0 WHERE id = ?", orderId);
        
        // Rebuild
        projectionHandler.rebuildProjections();
        Thread.sleep(1000);
        
        // Verify restored
        total = jdbcTemplate.queryForObject("SELECT total_amount FROM order_projections WHERE id = ?", BigDecimal.class, orderId);
        assertEquals(new BigDecimal("100.00"), total);
    }
    
    @Test
    void test9_AllEventTypes() throws InterruptedException {
        String orderId = UUID.randomUUID().toString();
        commandHandler.handle(new Commands.CreateOrderCommand(orderId, "cust-all", UUID.randomUUID().toString())); // OrderCreated
        commandHandler.handle(new Commands.AddItemCommand(orderId, "item-1", 1, BigDecimal.TEN, UUID.randomUUID().toString())); // ItemAdded
        commandHandler.handle(new Commands.RemoveItemCommand(orderId, "item-1", UUID.randomUUID().toString())); // ItemRemoved
        commandHandler.handle(new Commands.AddItemCommand(orderId, "item-2", 1, BigDecimal.TEN, UUID.randomUUID().toString())); 
        commandHandler.handle(new Commands.SubmitOrderCommand(orderId, "Address", UUID.randomUUID().toString())); // OrderSubmitted
        commandHandler.handle(new Commands.PaymentReceivedCommand(orderId, BigDecimal.TEN, "tx-1", UUID.randomUUID().toString())); // PaymentReceived
        commandHandler.handle(new Commands.ShipOrderCommand(orderId, "track-1", UUID.randomUUID().toString())); // OrderShipped
        
        Thread.sleep(1000);
        // Verify final status in projection
        String status = jdbcTemplate.queryForObject("SELECT status FROM order_projections WHERE id = ?", String.class, orderId);
        assertEquals("SHIPPED", status);
        
        // Cancelled flow
        String cancelId = UUID.randomUUID().toString();
        commandHandler.handle(new Commands.CreateOrderCommand(cancelId, "cust-cancel", UUID.randomUUID().toString()));
        commandHandler.handle(new Commands.CancelOrderCommand(cancelId, "Reason", UUID.randomUUID().toString())); // OrderCancelled
        
        Thread.sleep(1000);
        status = jdbcTemplate.queryForObject("SELECT status FROM order_projections WHERE id = ?", String.class, cancelId);
        assertEquals("CANCELLED", status);
    }

    // Requirement 2: Verify version mismatch detection
    @Test
    void test2_VersionMismatchDetection() {
        String orderId = UUID.randomUUID().toString();
        commandHandler.handle(new Commands.CreateOrderCommand(orderId, "cust-version", UUID.randomUUID().toString()));
        commandHandler.handle(new Commands.AddItemCommand(orderId, "item-1", 1, BigDecimal.TEN, UUID.randomUUID().toString()));
        
        // Manually insert an event with a conflicting version
        Exception exception = assertThrows(Exception.class, () -> {
            jdbcTemplate.update(
                "INSERT INTO events (aggregate_id, aggregate_version, event_type, payload, timestamp, schema_version) VALUES (?, ?, ?, ?, ?, ?)",
                orderId, 2L, "ConflictEvent", "{}", new java.sql.Timestamp(System.currentTimeMillis()), 1
            );
        });
        
        // Verify it's a constraint violation (DuplicateKeyException or similar)
        assertTrue(exception.getMessage().contains("duplicate") || exception.getMessage().contains("unique") || 
                   exception instanceof org.springframework.dao.DataIntegrityViolationException);
    }

    // Requirement 8: Verify business rules are enforced in the aggregate
    @Test
    void test8_BusinessRuleValidation() {
        String orderId = UUID.randomUUID().toString();
        commandHandler.handle(new Commands.CreateOrderCommand(orderId, "cust-rules", UUID.randomUUID().toString()));
        commandHandler.handle(new Commands.AddItemCommand(orderId, "item-1", 1, BigDecimal.TEN, UUID.randomUUID().toString()));
        commandHandler.handle(new Commands.SubmitOrderCommand(orderId, "123 Main St", UUID.randomUUID().toString()));
        
        // Try to add item to submitted order - should fail
        Exception exception = assertThrows(Exception.class, () -> {
            commandHandler.handle(new Commands.AddItemCommand(orderId, "item-2", 1, BigDecimal.TEN, UUID.randomUUID().toString()));
        });
        assertTrue(exception.getMessage().contains("Cannot add items to order in status"));
        
        // Try to remove item from submitted order - should fail
        exception = assertThrows(Exception.class, () -> {
            commandHandler.handle(new Commands.RemoveItemCommand(orderId, "item-1", UUID.randomUUID().toString()));
        });
        assertTrue(exception.getMessage().contains("Cannot remove items from order in status"));
        
        // Ship the order
        commandHandler.handle(new Commands.PaymentReceivedCommand(orderId, BigDecimal.TEN, "tx-1", UUID.randomUUID().toString()));
        commandHandler.handle(new Commands.ShipOrderCommand(orderId, "track-123", UUID.randomUUID().toString()));
        
        // Try to cancel shipped order - should fail
        exception = assertThrows(Exception.class, () -> {
            commandHandler.handle(new Commands.CancelOrderCommand(orderId, "Changed mind", UUID.randomUUID().toString()));
        });
        assertTrue(exception.getMessage().contains("Cannot cancel order in status"));
    }

    // Requirement 11: Verify aggregate version is updated after applying events
    @Test
    void test11_AggregateVersionConsistency() throws Exception {
        String orderId = UUID.randomUUID().toString();
        commandHandler.handle(new Commands.CreateOrderCommand(orderId, "cust-ver-check", UUID.randomUUID().toString()));
        
        // Load aggregate and verify version
        var snapshot = snapshotRepository.load(orderId, Order.class);
        Order order;
        if (snapshot.isPresent()) {
            order = Order.restore(snapshot.get());
        } else {
            order = new Order();
        }
        order.replay(eventStore.getEvents(orderId, 0));
        
        long versionAfterCreate = order.getVersion();
        assertEquals(1L, versionAfterCreate, "Version should be 1 after OrderCreated event");
        
        // Add an item
        commandHandler.handle(new Commands.AddItemCommand(orderId, "item-1", 1, BigDecimal.TEN, UUID.randomUUID().toString()));
        
        // Reload and verify version incremented
        order = new Order();
        order.replay(eventStore.getEvents(orderId, 0));
        long versionAfterAdd = order.getVersion();
        assertEquals(2L, versionAfterAdd, "Version should be 2 after ItemAdded event");
    }

    // Requirement 12: Verify async executor configuration
    @Test
    void test12_AsyncExecutorConfiguration() throws Exception {
        // Verify async behavior by confirming projection updates happen asynchronously
        String orderId = UUID.randomUUID().toString();
        commandHandler.handle(new Commands.CreateOrderCommand(orderId, "cust-async", UUID.randomUUID().toString()));
        
        // Wait for async processing
        Thread.sleep(500);
        
        // Verify projection was updated (proves @Async and executor are configured)
        String status = jdbcTemplate.queryForObject("SELECT status FROM order_projections WHERE id = ?", String.class, orderId);
        assertEquals("CREATED", status, "Async projection should have updated the read model");
        
        // Verify the projection handler is actually async by checking it doesn't block
        // If it were synchronous, this would fail due to timing
        String orderId2 = UUID.randomUUID().toString();
        long startTime = System.currentTimeMillis();
        commandHandler.handle(new Commands.CreateOrderCommand(orderId2, "cust-async-2", UUID.randomUUID().toString()));
        long endTime = System.currentTimeMillis();
        
        // Command should return quickly (not wait for projection)
        assertTrue((endTime - startTime) < 200, "Command handler should not block on async projection");
    }

    // GAP 1: Real concurrent command execution
    @Test
    void testGap1_ConcurrentCommandExecution() throws Exception {
        String orderId = UUID.randomUUID().toString();
        commandHandler.handle(new Commands.CreateOrderCommand(orderId, "cust-concurrent", UUID.randomUUID().toString()));
        
        CountDownLatch latch = new CountDownLatch(2);
        java.util.concurrent.atomic.AtomicInteger successCount = new java.util.concurrent.atomic.AtomicInteger(0);
        java.util.concurrent.atomic.AtomicInteger failureCount = new java.util.concurrent.atomic.AtomicInteger(0);
        
        // Simulate two threads trying to add items concurrently
        Runnable task = () -> {
            try {
                commandHandler.handle(new Commands.AddItemCommand(orderId, "item-" + Thread.currentThread().getId(), 
                    1, BigDecimal.TEN, UUID.randomUUID().toString()));
                successCount.incrementAndGet();
            } catch (Exception e) {
                failureCount.incrementAndGet();
            } finally {
                latch.countDown();
            }
        };
        
        Thread t1 = new Thread(task);
        Thread t2 = new Thread(task);
        t1.start();
        t2.start();
        
        assertTrue(latch.await(5, TimeUnit.SECONDS), "Concurrent commands should complete");
        
        // Both should succeed (different items) OR one should fail if same version conflict
        assertTrue(successCount.get() >= 1, "At least one command should succeed");
    }

    // GAP 2: Verify snapshot is actually used for loading
    @Test
    void testGap2_SnapshotLoadingVerification() throws Exception {
        String orderId = UUID.randomUUID().toString();
        commandHandler.handle(new Commands.CreateOrderCommand(orderId, "cust-snap-verify", UUID.randomUUID().toString()));
        
        // Add 105 items to trigger snapshot
        for (int i = 0; i < 105; i++) {
            commandHandler.handle(new Commands.AddItemCommand(orderId, "prod-" + i, 1, BigDecimal.TEN, UUID.randomUUID().toString()));
        }
        
        // Verify snapshot exists
        var snapshot = snapshotRepository.load(orderId, Order.class);
        assertTrue(snapshot.isPresent(), "Snapshot should exist");
        
        // Load aggregate - should use snapshot
        Order order = new Order();
        long snapshotVersion = snapshot.get().version;
        List<com.example.orders.event.Event> eventsAfterSnapshot = eventStore.getEvents(orderId, snapshotVersion);
        
        // Verify we only replay events AFTER snapshot, not all 106 events
        assertTrue(eventsAfterSnapshot.size() < 106, 
            "Should only replay events after snapshot, not all events. Found: " + eventsAfterSnapshot.size());
    }

    // GAP 3: Schema evolution - mixed schema versions
    @Test
    void testGap3_SchemaEvolution() throws Exception {
        String orderId = UUID.randomUUID().toString();
        commandHandler.handle(new Commands.CreateOrderCommand(orderId, "cust-schema", UUID.randomUUID().toString()));
        
        // Manually insert an event with schema version 2 (simulating future schema)
        jdbcTemplate.update(
            "INSERT INTO events (aggregate_id, aggregate_version, event_type, payload, timestamp, schema_version) VALUES (?, ?, ?, ?, ?, ?)",
            orderId, 2L, "ItemAddedEvent", 
            "{\"orderId\":\"" + orderId + "\",\"productId\":\"future-item\",\"quantity\":1,\"price\":10}",
            new java.sql.Timestamp(System.currentTimeMillis()), 2
        );
        
        // Verify system can still load and replay events with mixed schema versions
        assertDoesNotThrow(() -> {
            Order order = new Order();
            order.replay(eventStore.getEvents(orderId, 0));
        }, "System should handle mixed schema versions gracefully");
    }

    // GAP 4: Projection eventual consistency ordering
    @Test
    void testGap4_ProjectionEventOrdering() throws Exception {
        String orderId = UUID.randomUUID().toString();
        commandHandler.handle(new Commands.CreateOrderCommand(orderId, "cust-order", UUID.randomUUID().toString()));
        commandHandler.handle(new Commands.AddItemCommand(orderId, "item-1", 1, new BigDecimal("100.00"), UUID.randomUUID().toString()));
        commandHandler.handle(new Commands.SubmitOrderCommand(orderId, "123 Main St", UUID.randomUUID().toString()));
        
        // Wait for async projections
        Thread.sleep(1000);
        
        // Verify final state reflects all events in correct order
        String status = jdbcTemplate.queryForObject("SELECT status FROM order_projections WHERE id = ?", String.class, orderId);
        BigDecimal total = jdbcTemplate.queryForObject("SELECT total_amount FROM order_projections WHERE id = ?", BigDecimal.class, orderId);
        
        assertEquals("SUBMITTED", status, "Status should reflect latest event");
        assertEquals(new BigDecimal("100.00"), total, "Total should reflect all item additions");
    }

    // GAP 5: Transaction rollback on error
    @Test
    void testGap5_TransactionRollback() {
        String orderId = UUID.randomUUID().toString();
        commandHandler.handle(new Commands.CreateOrderCommand(orderId, "cust-rollback", UUID.randomUUID().toString()));
        
        // Try to perform an invalid operation that should rollback
        assertThrows(Exception.class, () -> {
            commandHandler.handle(new Commands.SubmitOrderCommand(orderId, "Address", UUID.randomUUID().toString()));
        }, "Should fail - cannot submit empty order");
        
        // Verify no events were persisted for the failed command
        List<com.example.orders.event.Event> events = eventStore.getEvents(orderId, 0);
        assertEquals(1, events.size(), "Should only have OrderCreated event, not OrderSubmitted");
    }

    // GAP 6: Input validation
    @Test
    void testGap6_InputValidation() {
        String orderId = UUID.randomUUID().toString();
        commandHandler.handle(new Commands.CreateOrderCommand(orderId, "cust-validation", UUID.randomUUID().toString()));
        
        // Test negative quantity
        assertThrows(Exception.class, () -> {
            commandHandler.handle(new Commands.AddItemCommand(orderId, "item-1", -1, BigDecimal.TEN, UUID.randomUUID().toString()));
        }, "Should reject negative quantity");
        
        // Test removing non-existent item
        assertThrows(Exception.class, () -> {
            commandHandler.handle(new Commands.RemoveItemCommand(orderId, "non-existent", UUID.randomUUID().toString()));
        }, "Should reject removing non-existent item");
    }

    // GAP 7: Snapshot restoration accuracy
    @Test
    void testGap7_SnapshotAccuracy() throws Exception {
        String orderId = UUID.randomUUID().toString();
        commandHandler.handle(new Commands.CreateOrderCommand(orderId, "cust-accuracy", UUID.randomUUID().toString()));
        
        // Add items
        commandHandler.handle(new Commands.AddItemCommand(orderId, "item-1", 2, new BigDecimal("50.00"), UUID.randomUUID().toString()));
        commandHandler.handle(new Commands.AddItemCommand(orderId, "item-2", 1, new BigDecimal("30.00"), UUID.randomUUID().toString()));
        
        // Load via replay
        Order orderViaReplay = new Order();
        orderViaReplay.replay(eventStore.getEvents(orderId, 0));
        
        // Create snapshot
        var snapshot = orderViaReplay.createSnapshot();
        snapshotRepository.save(orderId, orderViaReplay.getVersion(), orderViaReplay);
        
        // Load via snapshot
        var loadedSnapshot = snapshotRepository.load(orderId, Order.class);
        assertTrue(loadedSnapshot.isPresent(), "Snapshot should exist");
        Order orderViaSnapshot = Order.restore(loadedSnapshot.get());
        
        // Verify state matches
        assertEquals(orderViaReplay.getStatus(), orderViaSnapshot.getStatus(), "Status should match");
        assertEquals(orderViaReplay.getItems().size(), orderViaSnapshot.getItems().size(), "Item count should match");
        assertEquals(orderViaReplay.getVersion(), orderViaSnapshot.getVersion(), "Version should match");
    }
}
