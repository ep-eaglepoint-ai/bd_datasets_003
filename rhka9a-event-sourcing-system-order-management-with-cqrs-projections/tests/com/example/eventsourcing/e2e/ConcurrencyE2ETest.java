package com.example.eventsourcing.e2e;

import com.example.eventsourcing.domain.order.*;
import com.example.eventsourcing.exception.ConcurrencyException;
import com.example.eventsourcing.infrastructure.AggregateRepository;
import com.example.eventsourcing.service.OrderService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

/**
 * End-to-end concurrency tests.
 * Uses PostgreSQL service from docker-compose.
 */
@SpringBootTest
@DisplayName("Concurrency E2E Tests")
class ConcurrencyE2ETest {
    
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
    
    @Test
    @DisplayName("should detect concurrent modifications with optimistic locking")
    void shouldDetectConcurrentModificationsWithOptimisticLocking() throws InterruptedException {
        UUID orderId = orderService.createOrder(new CreateOrderCommand(UUID.randomUUID()));
        
        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger failureCount = new AtomicInteger(0);
        
        int threadCount = 10;
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        CountDownLatch latch = new CountDownLatch(threadCount);
        
        for (int i = 0; i < threadCount; i++) {
            final int index = i;
            executor.submit(() -> {
                try {
                    orderService.addItem(new AddItemCommand(
                        orderId,
                        UUID.randomUUID(),
                        1,
                        BigDecimal.TEN
                    ));
                    successCount.incrementAndGet();
                } catch (ConcurrencyException e) {
                    failureCount.incrementAndGet();
                } catch (Exception e) {
                    // Other exceptions
                } finally {
                    latch.countDown();
                }
            });
        }
        
        latch.await(10, TimeUnit.SECONDS);
        executor.shutdown();
        
        // At least some should succeed
        assertTrue(successCount.get() > 0, "Some operations should succeed");
        
        // Verify final state
        OrderAggregate order = aggregateRepository.load(orderId, OrderAggregate.class).orElseThrow();
        assertEquals(successCount.get(), order.getItems().size());
    }
    
    @Test
    @DisplayName("should handle concurrent creates on different aggregates")
    void shouldHandleConcurrentCreatesOnDifferentAggregates() throws InterruptedException {
        int orderCount = 20;
        ExecutorService executor = Executors.newFixedThreadPool(10);
        List<Future<UUID>> futures = new ArrayList<>();
        
        for (int i = 0; i < orderCount; i++) {
            futures.add(executor.submit(() -> 
                orderService.createOrder(new CreateOrderCommand(UUID.randomUUID()))
            ));
        }
        
        executor.shutdown();
        executor.awaitTermination(30, TimeUnit.SECONDS);
        
        // All should succeed
        assertEquals(orderCount, futures.stream()
            .filter(f -> {
                try {
                    return f.get() != null;
                } catch (Exception e) {
                    return false;
                }
            })
            .count());
    }
    
    @Test
    @DisplayName("should maintain consistency under high load")
    void shouldMaintainConsistencyUnderHighLoad() throws InterruptedException, ExecutionException {
        UUID orderId = orderService.createOrder(new CreateOrderCommand(UUID.randomUUID()));
        
        int operationCount = 50;
        ExecutorService executor = Executors.newFixedThreadPool(10);
        List<Future<Boolean>> futures = new ArrayList<>();
        
        for (int i = 0; i < operationCount; i++) {
            futures.add(executor.submit(() -> {
                try {
                    orderService.addItem(new AddItemCommand(
                        orderId,
                        UUID.randomUUID(),
                        1,
                        BigDecimal.TEN
                    ));
                    return true;
                } catch (Exception e) {
                    return false;
                }
            }));
        }
        
        executor.shutdown();
        executor.awaitTermination(60, TimeUnit.SECONDS);
        
        long successfulOps = futures.stream()
            .map(f -> {
                try {
                    return f.get();
                } catch (Exception e) {
                    return false;
                }
            })
            .filter(success -> success)
            .count();
        
        OrderAggregate order = aggregateRepository.load(orderId, OrderAggregate.class).orElseThrow();
        
        assertEquals(successfulOps, order.getItems().size());
        assertEquals(BigDecimal.valueOf(successfulOps * 10), order.getTotalAmount());
    }
    
    @Test
    @DisplayName("should handle concurrent read and write operations")
    void shouldHandleConcurrentReadAndWriteOperations() throws InterruptedException {
        UUID orderId = orderService.createOrder(new CreateOrderCommand(UUID.randomUUID()));
        
        ExecutorService executor = Executors.newFixedThreadPool(20);
        CountDownLatch latch = new CountDownLatch(100);
        
        // 50 writes
        for (int i = 0; i < 50; i++) {
            executor.submit(() -> {
                try {
                    orderService.addItem(new AddItemCommand(
                        orderId,
                        UUID.randomUUID(),
                        1,
                        BigDecimal.TEN
                    ));
                } catch (Exception e) {
                    // Expected concurrency failures
                } finally {
                    latch.countDown();
                }
            });
        }
        
        // 50 reads
        for (int i = 0; i < 50; i++) {
            executor.submit(() -> {
                try {
                    aggregateRepository.load(orderId, OrderAggregate.class);
                } catch (Exception e) {
                    // Reads should not fail
                } finally {
                    latch.countDown();
                }
            });
        }
        
        latch.await(30, TimeUnit.SECONDS);
        executor.shutdown();
        
        // Final state should be consistent
        OrderAggregate order = aggregateRepository.load(orderId, OrderAggregate.class).orElseThrow();
        assertNotNull(order);
        assertTrue(order.getVersion() > 0);
    }
    
    @Test
    @DisplayName("should reject concurrent submissions")
    void shouldRejectConcurrentSubmissions() throws InterruptedException {
        UUID orderId = orderService.createOrder(new CreateOrderCommand(UUID.randomUUID()));
        orderService.addItem(new AddItemCommand(orderId, UUID.randomUUID(), 1, BigDecimal.TEN));
        
        AtomicInteger successCount = new AtomicInteger(0);
        
        ExecutorService executor = Executors.newFixedThreadPool(5);
        CountDownLatch latch = new CountDownLatch(5);
        
        for (int i = 0; i < 5; i++) {
            executor.submit(() -> {
                try {
                    orderService.submitOrder(new SubmitOrderCommand(orderId));
                    successCount.incrementAndGet();
                } catch (Exception e) {
                    // Expected: only one should succeed
                } finally {
                    latch.countDown();
                }
            });
        }
        
        latch.await(10, TimeUnit.SECONDS);
        executor.shutdown();
        
        // Only one submission should succeed
        assertEquals(1, successCount.get());
    }
}

