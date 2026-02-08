package com.example.eventsourcing.infrastructure.snapshot;

import com.example.eventsourcing.domain.order.OrderAggregate;
import com.example.eventsourcing.infrastructure.AggregateRepository;
import com.example.eventsourcing.infrastructure.EventStore;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration tests for Snapshot functionality.
 * Uses PostgreSQL service from docker-compose.
 */
@SpringBootTest
@TestPropertySource(properties = {
    "event-sourcing.snapshot.enabled=true",
    "event-sourcing.snapshot.interval=5"
})
@DisplayName("Snapshot Integration Tests")
class SnapshotIntegrationTest {
    
    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        // Use PostgreSQL service from docker-compose
        String dbUrl = System.getenv().getOrDefault(
            "SPRING_DATASOURCE_URL", 
            "jdbc:postgresql://postgres:5432/event_sourcing_db"
        );
        String dbUser = System.getenv().getOrDefault(
            "SPRING_DATASOURCE_USERNAME", 
            "postgres"
        );
        String dbPassword = System.getenv().getOrDefault(
            "SPRING_DATASOURCE_PASSWORD", 
            "postgres"
        );
        
        registry.add("spring.datasource.url", () -> dbUrl);
        registry.add("spring.datasource.username", () -> dbUser);
        registry.add("spring.datasource.password", () -> dbPassword);
    }
    
    @Autowired
    private AggregateRepository<OrderAggregate> repository;
    
    @Autowired
    private EventStore eventStore;
    
    @Autowired
    private SnapshotStore snapshotStore;
    
    @Test
    @Transactional
    @DisplayName("should create snapshot after threshold events")
    void shouldCreateSnapshotAfterThresholdEvents() throws InterruptedException {
        UUID orderId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        
        OrderAggregate order = new OrderAggregate(orderId);
        order.createOrder(customerId);
        
        // Add 4 items to reach snapshot threshold (5 events total)
        for (int i = 0; i < 4; i++) {
            order.addItem(UUID.randomUUID(), 1, BigDecimal.TEN);
        }
        
        repository.save(order);
        
        // Wait for async snapshot creation
        Thread.sleep(1000);
        
        // Verify snapshot was created
        Optional<SnapshotData> snapshot = snapshotStore.getLatestSnapshot(orderId);
        assertTrue(snapshot.isPresent());
        assertEquals(5L, snapshot.get().getVersion());
    }
    
    @Test
    @Transactional
    @DisplayName("should load aggregate from snapshot and remaining events")
    void shouldLoadAggregateFromSnapshotAndRemainingEvents() throws InterruptedException {
        UUID orderId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        
        // Create order with 5 events (triggers snapshot)
        OrderAggregate order = new OrderAggregate(orderId);
        order.createOrder(customerId);
        for (int i = 0; i < 4; i++) {
            order.addItem(UUID.randomUUID(), 1, BigDecimal.TEN);
        }
        repository.save(order);
        Thread.sleep(1000); // Wait for snapshot
        
        // Add 2 more events
        order = repository.load(orderId, OrderAggregate.class).orElseThrow();
        order.addItem(UUID.randomUUID(), 1, BigDecimal.TEN);
        order.addItem(UUID.randomUUID(), 1, BigDecimal.TEN);
        repository.save(order);
        
        // Load aggregate - should use snapshot + 2 events
        OrderAggregate loaded = repository.load(orderId, OrderAggregate.class).orElseThrow();
        
        assertEquals(7L, loaded.getVersion());
        assertEquals(6, loaded.getItems().size());
        assertEquals(BigDecimal.valueOf(60), loaded.getTotalAmount());
    }
    
    @Test
    @Transactional
    @DisplayName("should reduce load time with snapshot")
    void shouldReduceLoadTimeWithSnapshot() throws InterruptedException {
        UUID orderId = UUID.randomUUID();
        
        // Create order with many events
        OrderAggregate order = new OrderAggregate(orderId);
        order.createOrder(UUID.randomUUID());
        
        for (int i = 0; i < 20; i++) {
            order.addItem(UUID.randomUUID(), 1, BigDecimal.TEN);
        }
        repository.save(order);
        Thread.sleep(1500); // Wait for snapshots
        
        // Load with snapshot should be faster
        long start = System.currentTimeMillis();
        OrderAggregate loaded = repository.load(orderId, OrderAggregate.class).orElseThrow();
        long duration = System.currentTimeMillis() - start;
        
        assertEquals(21L, loaded.getVersion());
        assertTrue(duration < 1000, "Load time should be reasonable");
    }
    
    @Test
    @Transactional
    @DisplayName("should handle missing snapshot gracefully")
    void shouldHandleMissingSnapshotGracefully() {
        UUID orderId = UUID.randomUUID();
        
        // Create order with few events (no snapshot)
        OrderAggregate order = new OrderAggregate(orderId);
        order.createOrder(UUID.randomUUID());
        order.addItem(UUID.randomUUID(), 1, BigDecimal.TEN);
        repository.save(order);
        
        // Load should work without snapshot
        OrderAggregate loaded = repository.load(orderId, OrderAggregate.class).orElseThrow();
        
        assertEquals(2L, loaded.getVersion());
        assertEquals(1, loaded.getItems().size());
    }
    
    @Test
    @DisplayName("should update snapshot on subsequent saves")
    void shouldUpdateSnapshotOnSubsequentSaves() throws InterruptedException {
        UUID orderId = UUID.randomUUID();
        
        OrderAggregate order = new OrderAggregate(orderId);
        order.createOrder(UUID.randomUUID());
        for (int i = 0; i < 4; i++) {
            order.addItem(UUID.randomUUID(), 1, BigDecimal.TEN);
        }
        repository.save(order);
        Thread.sleep(2000); // Wait for async snapshot creation
        
        // Add more events to trigger another snapshot
        order = repository.load(orderId, OrderAggregate.class).orElseThrow();
        for (int i = 0; i < 5; i++) {
            order.addItem(UUID.randomUUID(), 1, BigDecimal.TEN);
        }
        repository.save(order);
        Thread.sleep(2000); // Wait for async snapshot creation
        
        // Latest snapshot should be at version 10
        Optional<SnapshotData> snapshot = snapshotStore.getLatestSnapshot(orderId);
        assertTrue(snapshot.isPresent());
        assertEquals(10L, snapshot.get().getVersion());
    }
    
    @Test
    @Transactional
    @DisplayName("should preserve aggregate state in snapshot")
    void shouldPreserveAggregateStateInSnapshot() throws InterruptedException {
        UUID orderId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        
        OrderAggregate order = new OrderAggregate(orderId);
        order.createOrder(customerId);
        for (int i = 0; i < 4; i++) {
            order.addItem(UUID.randomUUID(), i + 1, BigDecimal.valueOf(10 * (i + 1)));
        }
        repository.save(order);
        Thread.sleep(1000);
        
        // Load from snapshot
        OrderAggregate loaded = repository.load(orderId, OrderAggregate.class).orElseThrow();
        
        assertEquals(customerId, loaded.getCustomerId());
        assertEquals(4, loaded.getItems().size());
        assertEquals(BigDecimal.valueOf(300), loaded.getTotalAmount());
    }
}

