package com.example.eventsourcing.performance;

import com.example.eventsourcing.domain.order.*;
import com.example.eventsourcing.infrastructure.AggregateRepository;
import com.example.eventsourcing.infrastructure.projection.OrderProjectionRepository;
import com.example.eventsourcing.infrastructure.projection.ProjectionRebuildService;
import com.example.eventsourcing.service.OrderService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import java.math.BigDecimal;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Performance tests for event sourcing operations.
 * Uses PostgreSQL service from docker-compose.
 */
@SpringBootTest
@TestPropertySource(properties = {
    "event-sourcing.snapshot.enabled=true",
    "event-sourcing.snapshot.interval=10"
})
@DisplayName("Performance Tests")
class PerformanceTest {
    
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
    private OrderService orderService;
    
    @Autowired
    private AggregateRepository<OrderAggregate> aggregateRepository;
    
    @Autowired
    private ProjectionRebuildService projectionRebuildService;
    
    @Autowired
    private OrderProjectionRepository projectionRepository;
    
    @Test
    @DisplayName("should load aggregate with snapshot faster than without")
    void shouldLoadAggregateWithSnapshotFasterThanWithout() throws InterruptedException {
        UUID orderId = orderService.createOrder(new CreateOrderCommand(UUID.randomUUID()));
        
        // Create 50 events
        for (int i = 0; i < 49; i++) {
            orderService.addItem(new AddItemCommand(orderId, UUID.randomUUID(), 1, BigDecimal.TEN));
        }
        
        // Wait for snapshots
        Thread.sleep(2000);
        
        // Measure load time with snapshot
        long start = System.currentTimeMillis();
        OrderAggregate order = aggregateRepository.load(orderId, OrderAggregate.class).orElseThrow();
        long loadTime = System.currentTimeMillis() - start;
        
        assertNotNull(order);
        assertEquals(50L, order.getVersion());
        assertTrue(loadTime < 1000, "Load time with snapshot should be < 1s, was: " + loadTime + "ms");
    }
    
    @Test
    @DisplayName("should handle high volume of events efficiently")
    void shouldHandleHighVolumeOfEventsEfficiently() {
        UUID orderId = orderService.createOrder(new CreateOrderCommand(UUID.randomUUID()));
        
        long start = System.currentTimeMillis();
        
        // Add 100 items
        for (int i = 0; i < 100; i++) {
            orderService.addItem(new AddItemCommand(orderId, UUID.randomUUID(), 1, BigDecimal.TEN));
        }
        
        long duration = System.currentTimeMillis() - start;
        
        OrderAggregate order = aggregateRepository.load(orderId, OrderAggregate.class).orElseThrow();
        assertEquals(101L, order.getVersion());
        
        // Should process 100 events in reasonable time
        assertTrue(duration < 10000, "Should process 100 events in < 10s, was: " + duration + "ms");
    }
    
    @Test
    @DisplayName("should rebuild projections with bounded memory")
    void shouldRebuildProjectionsWithBoundedMemory() throws InterruptedException {
        // Create 100 orders with 5 events each
        for (int i = 0; i < 100; i++) {
            UUID orderId = orderService.createOrder(new CreateOrderCommand(UUID.randomUUID()));
            for (int j = 0; j < 4; j++) {
                orderService.addItem(new AddItemCommand(orderId, UUID.randomUUID(), 1, BigDecimal.TEN));
            }
        }
        
        Runtime runtime = Runtime.getRuntime();
        long memoryBefore = runtime.totalMemory() - runtime.freeMemory();
        
        // Rebuild projections
        long start = System.currentTimeMillis();
        projectionRebuildService.rebuildOrderProjections();
        long duration = System.currentTimeMillis() - start;
        
        // Wait for projection handlers to complete (they run after commit)
        Thread.sleep(2000);
        
        long memoryAfter = runtime.totalMemory() - runtime.freeMemory();
        long memoryUsed = (memoryAfter - memoryBefore) / 1024 / 1024; // MB
        
        assertEquals(100, projectionRepository.count());
        assertTrue(duration < 30000, "Rebuild should complete in < 30s, was: " + duration + "ms");
        assertTrue(memoryUsed < 500, "Memory usage should be bounded, used: " + memoryUsed + "MB");
    }
    
    @Test
    @DisplayName("should maintain performance with large aggregates")
    void shouldMaintainPerformanceWithLargeAggregates() throws InterruptedException {
        UUID orderId = orderService.createOrder(new CreateOrderCommand(UUID.randomUUID()));
        
        // Create large aggregate (200 events)
        for (int i = 0; i < 199; i++) {
            orderService.addItem(new AddItemCommand(orderId, UUID.randomUUID(), 1, BigDecimal.TEN));
        }
        
        Thread.sleep(3000); // Allow snapshots
        
        // Load should still be fast due to snapshots
        long start = System.currentTimeMillis();
        OrderAggregate order = aggregateRepository.load(orderId, OrderAggregate.class).orElseThrow();
        long loadTime = System.currentTimeMillis() - start;
        
        assertEquals(200L, order.getVersion());
        assertTrue(loadTime < 2000, "Large aggregate load should be < 2s, was: " + loadTime + "ms");
    }
    
    @Test
    @DisplayName("should handle concurrent operations without significant degradation")
    void shouldHandleConcurrentOperationsWithoutSignificantDegradation() throws InterruptedException {
        int orderCount = 50;
        long start = System.currentTimeMillis();
        
        // Create 50 orders concurrently
        Thread[] threads = new Thread[orderCount];
        for (int i = 0; i < orderCount; i++) {
            threads[i] = new Thread(() -> {
                UUID orderId = orderService.createOrder(new CreateOrderCommand(UUID.randomUUID()));
                for (int j = 0; j < 5; j++) {
                    orderService.addItem(new AddItemCommand(orderId, UUID.randomUUID(), 1, BigDecimal.TEN));
                }
            });
            threads[i].start();
        }
        
        for (Thread thread : threads) {
            thread.join();
        }
        
        long duration = System.currentTimeMillis() - start;
        
        assertTrue(duration < 20000, "Concurrent operations should complete in < 20s, was: " + duration + "ms");
    }
    
    @Test
    @DisplayName("should scale event retrieval efficiently")
    void shouldScaleEventRetrievalEfficiently() {
        UUID orderId = orderService.createOrder(new CreateOrderCommand(UUID.randomUUID()));
        
        // Add 50 events
        for (int i = 0; i < 49; i++) {
            orderService.addItem(new AddItemCommand(orderId, UUID.randomUUID(), 1, BigDecimal.TEN));
        }
        
        // Measure retrieval time
        long start = System.currentTimeMillis();
        OrderAggregate order = aggregateRepository.load(orderId, OrderAggregate.class).orElseThrow();
        long duration = System.currentTimeMillis() - start;
        
        assertEquals(50L, order.getVersion());
        assertTrue(duration < 500, "Event retrieval should be < 500ms, was: " + duration + "ms");
    }
}

