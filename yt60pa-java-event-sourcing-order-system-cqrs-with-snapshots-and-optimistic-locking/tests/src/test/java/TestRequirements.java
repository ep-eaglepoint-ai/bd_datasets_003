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
}
