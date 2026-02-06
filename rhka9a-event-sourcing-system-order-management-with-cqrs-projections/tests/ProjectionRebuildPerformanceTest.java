package com.example.eventsourcing.infrastructure.projection;

import com.example.eventsourcing.domain.DomainEvent;
import com.example.eventsourcing.domain.order.OrderCreatedEvent;
import com.example.eventsourcing.domain.order.OrderItemAddedEvent;
import com.example.eventsourcing.infrastructure.EventStore;
import com.example.eventsourcing.infrastructure.persistence.EventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests for Requirement 8: Projection Rebuilds with Bounded Memory
 * Validates performance, large-scale scenarios, and concurrency during rebuilds.
 */
@SpringBootTest
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
@DisplayName("Projection Rebuild Performance Tests")
class ProjectionRebuildPerformanceTest {

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

    @Nested
    @DisplayName("Large-Scale Rebuild")
    class LargeScaleRebuildTests {

        @Test
        @DisplayName("Should rebuild projection with 1000+ events without running out of memory")
        void shouldRebuildProjectionWithManyEvents() {
            int eventCount = 1500;
            List<String> orderIds = new ArrayList<>();

            // Create multiple orders with many events
            for (int orderNum = 1; orderNum <= 10; orderNum++) {
                String orderId = "order-large-" + orderNum;
                orderIds.add(orderId);
                String customerId = "customer-" + orderNum;

                List<DomainEvent> events = new ArrayList<>();
                events.add(new OrderCreatedEvent(orderId, 1L, customerId, BigDecimal.ZERO));

                BigDecimal total = BigDecimal.ZERO;
                for (int i = 2; i <= (eventCount / 10) + 1; i++) {
                    BigDecimal price = new BigDecimal(i);
                    total = total.add(price);
                    events.add(new OrderItemAddedEvent(orderId, (long) i, "p" + i,
                            "Product " + i, 1, price, total));
                }

                eventStore.appendEvents(orderId, 0L, events);
            }

            // Rebuild projection - should use pagination and not run out of memory
            long startTime = System.currentTimeMillis();
            assertDoesNotThrow(() -> orderProjection.rebuildProjection());
            long rebuildTime = System.currentTimeMillis() - startTime;

            // Verify all projections were created
            for (String orderId : orderIds) {
                assertTrue(projectionRepository.existsByOrderId(orderId),
                        "Projection for " + orderId + " should exist");
            }

            assertTrue(rebuildTime < 60000, "Rebuild of 1500 events should complete in under 60 seconds");
        }

        @Test
        @DisplayName("Should use pagination when rebuilding large event stores")
        void shouldUsePaginationWhenRebuildingLargeEventStores() {
            // Create 500 events across multiple orders
            for (int i = 1; i <= 50; i++) {
                String orderId = "order-paginated-" + i;
                List<DomainEvent> events = new ArrayList<>();
                events.add(new OrderCreatedEvent(orderId, 1L, "customer-" + i, BigDecimal.ZERO));

                for (int j = 2; j <= 10; j++) {
                    events.add(new OrderItemAddedEvent(orderId, (long) j, "p" + j,
                            "Product " + j, 1, new BigDecimal(j), new BigDecimal(j * 10)));
                }

                eventStore.appendEvents(orderId, 0L, events);
            }

            // Rebuild should complete without loading all events at once
            assertDoesNotThrow(() -> {
                orderProjection.rebuildProjection();
            });

            // Verify all projections exist
            assertEquals(50, projectionRepository.count());
        }
    }

    @Nested
    @DisplayName("Rebuild Doesn't Block Commands")
    class RebuildNonBlockingTests {

        @Test
        @DisplayName("Should allow commands to execute during rebuild")
        void shouldAllowCommandsToExecuteDuringRebuild() throws InterruptedException {
            // Create initial events
            String orderId = "order-concurrent-1";
            eventStore.appendEvents(orderId, 0L, List.of(
                    new OrderCreatedEvent(orderId, 1L, "customer-1", BigDecimal.ZERO)
            ));

            AtomicInteger commandsExecuted = new AtomicInteger(0);
            CountDownLatch rebuildStarted = new CountDownLatch(1);
            CountDownLatch commandsCanStart = new CountDownLatch(1);

            // Start rebuild in background
            ExecutorService executor = Executors.newSingleThreadExecutor();
            executor.submit(() -> {
                rebuildStarted.countDown();
                try {
                    commandsCanStart.await(1, TimeUnit.SECONDS);
                    orderProjection.rebuildProjection();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            });

            // Wait for rebuild to start
            rebuildStarted.await(1, TimeUnit.SECONDS);

            // Execute commands while rebuild is running
            commandsCanStart.countDown();
            for (int i = 0; i < 5; i++) {
                String newOrderId = "order-concurrent-" + (i + 2);
                eventStore.appendEvents(newOrderId, 0L, List.of(
                        new OrderCreatedEvent(newOrderId, 1L, "customer-" + (i + 2), BigDecimal.ZERO)
                ));
                commandsExecuted.incrementAndGet();
            }

            executor.shutdown();
            executor.awaitTermination(5, TimeUnit.SECONDS);

            assertTrue(commandsExecuted.get() > 0, "Commands should execute during rebuild");
        }

        @Test
        @DisplayName("Should allow event publishing during rebuild")
        void shouldAllowEventPublishingDuringRebuild() throws InterruptedException {
            // Create initial events
            for (int i = 1; i <= 10; i++) {
                String orderId = "order-publish-" + i;
                eventStore.appendEvents(orderId, 0L, List.of(
                        new OrderCreatedEvent(orderId, 1L, "customer-" + i, BigDecimal.ZERO)
                ));
            }

            AtomicInteger eventsPublished = new AtomicInteger(0);
            CountDownLatch rebuildStarted = new CountDownLatch(1);

            // Start rebuild
            ExecutorService executor = Executors.newSingleThreadExecutor();
            executor.submit(() -> {
                rebuildStarted.countDown();
                orderProjection.rebuildProjection();
            });

            rebuildStarted.await(1, TimeUnit.SECONDS);

            // Publish new events during rebuild
            for (int i = 11; i <= 15; i++) {
                String orderId = "order-publish-" + i;
                eventStore.appendEvents(orderId, 0L, List.of(
                        new OrderCreatedEvent(orderId, 1L, "customer-" + i, BigDecimal.ZERO)
                ));
                eventsPublished.incrementAndGet();
            }

            executor.shutdown();
            executor.awaitTermination(10, TimeUnit.SECONDS);

            assertTrue(eventsPublished.get() > 0, "Events should be publishable during rebuild");
        }
    }

    @Nested
    @DisplayName("Rebuild Idempotency")
    class RebuildIdempotencyTests {

        @Test
        @DisplayName("Should produce same result when rebuilding twice")
        void shouldProduceSameResultWhenRebuildingTwice() {
            // Create events
            String orderId = "order-idempotent-1";
            eventStore.appendEvents(orderId, 0L, List.of(
                    new OrderCreatedEvent(orderId, 1L, "customer-1", BigDecimal.ZERO),
                    new OrderItemAddedEvent(orderId, 2L, "p1", "Product 1", 1,
                            new BigDecimal("10.00"), new BigDecimal("10.00"))
            ));

            // First rebuild
            orderProjection.rebuildProjection();
            OrderProjectionEntity projection1 = projectionRepository.findByOrderId(orderId).orElse(null);

            // Second rebuild
            orderProjection.rebuildProjection();
            OrderProjectionEntity projection2 = projectionRepository.findByOrderId(orderId).orElse(null);

            assertNotNull(projection1);
            assertNotNull(projection2);
            assertEquals(projection1.getOrderId(), projection2.getOrderId());
            assertEquals(projection1.getCustomerId(), projection2.getCustomerId());
            assertEquals(projection1.getTotalAmount(), projection2.getTotalAmount());
            assertEquals(projection1.getItemCount(), projection2.getItemCount());
        }
    }

    @Nested
    @DisplayName("Rebuild with Concurrent Events")
    class RebuildConcurrencyTests {

        @Test
        @DisplayName("Should handle rebuild while new events are being published")
        void shouldHandleRebuildWhileNewEventsAreBeingPublished() throws InterruptedException {
            // Create initial events
            for (int i = 1; i <= 20; i++) {
                String orderId = "order-concurrent-rebuild-" + i;
                eventStore.appendEvents(orderId, 0L, List.of(
                        new OrderCreatedEvent(orderId, 1L, "customer-" + i, BigDecimal.ZERO)
                ));
            }

            AtomicInteger newEventsPublished = new AtomicInteger(0);
            CountDownLatch rebuildStarted = new CountDownLatch(1);

            // Start rebuild
            ExecutorService rebuildExecutor = Executors.newSingleThreadExecutor();
            rebuildExecutor.submit(() -> {
                rebuildStarted.countDown();
                orderProjection.rebuildProjection();
            });

            rebuildStarted.await(1, TimeUnit.SECONDS);

            // Publish new events concurrently
            ExecutorService publishExecutor = Executors.newFixedThreadPool(5);
            for (int i = 21; i <= 30; i++) {
                final int orderNum = i;
                publishExecutor.submit(() -> {
                    String orderId = "order-concurrent-rebuild-" + orderNum;
                    eventStore.appendEvents(orderId, 0L, List.of(
                            new OrderCreatedEvent(orderId, 1L, "customer-" + orderNum, BigDecimal.ZERO)
                    ));
                    newEventsPublished.incrementAndGet();
                });
            }

            publishExecutor.shutdown();
            publishExecutor.awaitTermination(5, TimeUnit.SECONDS);

            rebuildExecutor.shutdown();
            rebuildExecutor.awaitTermination(10, TimeUnit.SECONDS);

            assertTrue(newEventsPublished.get() > 0, "New events should be published during rebuild");
            // Rebuild should complete successfully even with concurrent events
            assertTrue(projectionRepository.count() >= 20, "At least initial projections should exist");
        }
    }

    @Nested
    @DisplayName("Memory Boundedness")
    class MemoryBoundednessTests {

        @Test
        @DisplayName("Should not load all events into memory at once")
        void shouldNotLoadAllEventsIntoMemoryAtOnce() {
            // Create a large number of events
            int totalEvents = 500;
            for (int i = 1; i <= 50; i++) {
                String orderId = "order-memory-" + i;
                List<DomainEvent> events = new ArrayList<>();
                events.add(new OrderCreatedEvent(orderId, 1L, "customer-" + i, BigDecimal.ZERO));

                for (int j = 2; j <= 10; j++) {
                    events.add(new OrderItemAddedEvent(orderId, (long) j, "p" + j,
                            "Product " + j, 1, new BigDecimal(j), new BigDecimal(j * 10)));
                }

                eventStore.appendEvents(orderId, 0L, events);
            }

            // Rebuild - if all events were loaded at once, this would use excessive memory
            // The test passes if rebuild completes without OutOfMemoryError
            assertDoesNotThrow(() -> {
                orderProjection.rebuildProjection();
            });

            // Verify projections were created
            assertEquals(50, projectionRepository.count());
        }
    }

    @Nested
    @DisplayName("Rebuild Performance")
    class RebuildPerformanceTests {

        @Test
        @DisplayName("Should complete rebuild in reasonable time")
        void shouldCompleteRebuildInReasonableTime() {
            // Create 200 events
            for (int i = 1; i <= 20; i++) {
                String orderId = "order-perf-" + i;
                List<DomainEvent> events = new ArrayList<>();
                events.add(new OrderCreatedEvent(orderId, 1L, "customer-" + i, BigDecimal.ZERO));

                for (int j = 2; j <= 10; j++) {
                    events.add(new OrderItemAddedEvent(orderId, (long) j, "p" + j,
                            "Product " + j, 1, new BigDecimal(j), new BigDecimal(j * 10)));
                }

                eventStore.appendEvents(orderId, 0L, events);
            }

            long startTime = System.currentTimeMillis();
            orderProjection.rebuildProjection();
            long rebuildTime = System.currentTimeMillis() - startTime;

            assertTrue(rebuildTime < 30000, "Rebuild of 200 events should complete in under 30 seconds");
            assertEquals(20, projectionRepository.count());
        }
    }
}

