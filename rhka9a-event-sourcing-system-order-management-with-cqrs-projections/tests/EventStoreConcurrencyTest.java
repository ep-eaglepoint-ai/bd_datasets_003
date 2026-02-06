package com.example.eventsourcing.infrastructure;

import com.example.eventsourcing.domain.DomainEvent;
import com.example.eventsourcing.domain.order.OrderCreatedEvent;
import com.example.eventsourcing.domain.order.OrderItemAddedEvent;
import com.example.eventsourcing.exception.ConcurrencyException;
import com.example.eventsourcing.infrastructure.persistence.EventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;

import java.math.BigDecimal;
import java.util.List;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Multi-threaded concurrency tests for Requirement 2: Optimistic Locking.
 * Tests actual concurrent writes from multiple threads to verify that 
 * optimistic locking prevents concurrent modifications correctly.
 */
@SpringBootTest
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
@DisplayName("EventStore Concurrency Tests (Multi-Threaded)")
class EventStoreConcurrencyTest {

    @Autowired
    private EventStore eventStore;

    @Autowired
    private EventRepository eventRepository;

    @BeforeEach
    void cleanDatabase() {
        eventRepository.deleteAll();
    }

    @Nested
    @DisplayName("Concurrent Writes to Same Aggregate")
    class ConcurrentWritesToSameAggregateTests {

        @Test
        @DisplayName("Should allow only one of multiple concurrent writes to succeed")
        void shouldAllowOnlyOneConcurrentWriteToSucceed() throws InterruptedException {
            String aggregateId = "order-concurrent-1";

            // Create initial event
            eventStore.appendInitialEvent(aggregateId,
                    new OrderCreatedEvent(aggregateId, 1L, "customer-1", BigDecimal.ZERO)
            );

            int threadCount = 10;
            ExecutorService executor = Executors.newFixedThreadPool(threadCount);
            CountDownLatch startLatch = new CountDownLatch(1);
            CountDownLatch doneLatch = new CountDownLatch(threadCount);
            
            AtomicInteger successCount = new AtomicInteger(0);
            AtomicInteger concurrencyExceptionCount = new AtomicInteger(0);
            ConcurrentLinkedQueue<String> errors = new ConcurrentLinkedQueue<>();

            // All threads try to append to same aggregate simultaneously
            for (int i = 0; i < threadCount; i++) {
                final int threadNum = i;
                executor.submit(() -> {
                    try {
                        startLatch.await(); // Wait for signal to start

                        // All threads think current version is 1 (stale read)
                        Long currentVersion = 1L;
                        DomainEvent event = new OrderItemAddedEvent(
                                aggregateId, currentVersion + 1,
                                "product-" + threadNum, "Product " + threadNum,
                                1, BigDecimal.TEN, BigDecimal.TEN
                        );

                        eventStore.appendEvents(aggregateId, currentVersion, List.of(event));
                        successCount.incrementAndGet();
                        
                    } catch (ConcurrencyException e) {
                        concurrencyExceptionCount.incrementAndGet();
                    } catch (Exception e) {
                        errors.add("Thread " + threadNum + " failed with: " + e.getMessage());
                    } finally {
                        doneLatch.countDown();
                    }
                });
            }

            // Start all threads simultaneously
            startLatch.countDown();

            // Wait for completion
            assertTrue(doneLatch.await(30, TimeUnit.SECONDS), "All threads should complete");
            executor.shutdown();
            assertTrue(executor.awaitTermination(5, TimeUnit.SECONDS), "Executor should terminate");

            // Verify no unexpected errors
            assertTrue(errors.isEmpty(), "No unexpected errors should occur: " + errors);

            // Verify: Only ONE thread should succeed, rest should fail with ConcurrencyException
            assertEquals(1, successCount.get(), 
                "Only one thread should succeed in appending event");
            assertEquals(threadCount - 1, concurrencyExceptionCount.get(), 
                "All other threads should fail with ConcurrencyException");

            // Verify final state: should have exactly 2 events (initial + 1 successful append)
            List<DomainEvent> events = eventStore.loadEvents(aggregateId);
            assertEquals(2, events.size(), "Should have exactly 2 events");
            
            // Verify version sequence is correct
            assertEquals(1L, events.get(0).getVersion());
            assertEquals(2L, events.get(1).getVersion());
        }

        @Test
        @DisplayName("Should handle high contention with many threads writing to same aggregate")
        void shouldHandleHighContentionWithManyThreads() throws InterruptedException {
            String aggregateId = "order-high-contention";

            // Create initial event
            eventStore.appendInitialEvent(aggregateId,
                    new OrderCreatedEvent(aggregateId, 1L, "customer-1", BigDecimal.ZERO)
            );

            int threadCount = 50; // High contention scenario
            ExecutorService executor = Executors.newFixedThreadPool(threadCount);
            CountDownLatch startLatch = new CountDownLatch(1);
            CountDownLatch doneLatch = new CountDownLatch(threadCount);
            
            AtomicInteger successCount = new AtomicInteger(0);
            AtomicInteger failureCount = new AtomicInteger(0);

            for (int i = 0; i < threadCount; i++) {
                final int threadNum = i;
                executor.submit(() -> {
                    try {
                        startLatch.await();

                        // Simulate realistic scenario: read current version then try to append
                        Long currentVersion = eventStore.getCurrentVersion(aggregateId);
                        
                        DomainEvent event = new OrderItemAddedEvent(
                                aggregateId, currentVersion + 1,
                                "product-" + threadNum, "Product " + threadNum,
                                1, BigDecimal.ONE, BigDecimal.ONE
                        );

                        eventStore.appendEvents(aggregateId, currentVersion, List.of(event));
                        successCount.incrementAndGet();
                        
                    } catch (ConcurrencyException e) {
                        failureCount.incrementAndGet();
                    } catch (Exception e) {
                        fail("Unexpected exception: " + e.getMessage());
                    } finally {
                        doneLatch.countDown();
                    }
                });
            }

            startLatch.countDown();
            assertTrue(doneLatch.await(60, TimeUnit.SECONDS));
            executor.shutdown();

            // With many threads, some will succeed, most will fail
            assertTrue(successCount.get() >= 1, "At least one thread should succeed");
            assertTrue(failureCount.get() > 0, "Some threads should fail with conflicts");
            assertEquals(threadCount, successCount.get() + failureCount.get(),
                "All threads should either succeed or fail with ConcurrencyException");

            // Verify event count matches success count + initial event
            List<DomainEvent> events = eventStore.loadEvents(aggregateId);
            assertEquals(successCount.get() + 1, events.size(), 
                "Event count should match successful appends + initial event");
        }

        @Test
        @DisplayName("Should maintain version sequence integrity under concurrent writes")
        void shouldMaintainVersionSequenceIntegrityUnderConcurrentWrites() throws InterruptedException {
            String aggregateId = "order-version-integrity";

            // Create initial event
            eventStore.appendInitialEvent(aggregateId,
                    new OrderCreatedEvent(aggregateId, 1L, "customer-1", BigDecimal.ZERO)
            );

            int threadCount = 20;
            ExecutorService executor = Executors.newFixedThreadPool(threadCount);
            CyclicBarrier barrier = new CyclicBarrier(threadCount);
            
            AtomicInteger successCount = new AtomicInteger(0);

            for (int i = 0; i < threadCount; i++) {
                final int threadNum = i;
                executor.submit(() -> {
                    try {
                        barrier.await(); // All threads start at same time

                        Long currentVersion = eventStore.getCurrentVersion(aggregateId);
                        DomainEvent event = new OrderItemAddedEvent(
                                aggregateId, currentVersion + 1,
                                "product-" + threadNum, "Product " + threadNum,
                                1, BigDecimal.ONE, BigDecimal.ONE
                        );

                        eventStore.appendEvents(aggregateId, currentVersion, List.of(event));
                        successCount.incrementAndGet();
                        
                    } catch (ConcurrencyException e) {
                        // Expected for failed threads
                    } catch (Exception e) {
                        fail("Unexpected exception: " + e.getMessage());
                    }
                });
            }

            executor.shutdown();
            assertTrue(executor.awaitTermination(60, TimeUnit.SECONDS));

            // Verify version sequence is strictly sequential
            List<DomainEvent> events = eventStore.loadEvents(aggregateId);
            for (int i = 0; i < events.size(); i++) {
                assertEquals((long) (i + 1), events.get(i).getVersion(),
                    "Version at index " + i + " should be " + (i + 1));
            }

            // Verify no gaps in version sequence
            assertEquals(successCount.get() + 1, events.size());
        }
    }

    @Nested
    @DisplayName("Concurrent Writes to Different Aggregates")
    class ConcurrentWritesToDifferentAggregatesTests {

        @Test
        @DisplayName("Should allow concurrent writes to different aggregates")
        void shouldAllowConcurrentWritesToDifferentAggregates() throws InterruptedException {
            int aggregateCount = 10;
            ExecutorService executor = Executors.newFixedThreadPool(aggregateCount);
            CountDownLatch startLatch = new CountDownLatch(1);
            CountDownLatch doneLatch = new CountDownLatch(aggregateCount);
            
            AtomicInteger successCount = new AtomicInteger(0);
            ConcurrentLinkedQueue<String> errors = new ConcurrentLinkedQueue<>();

            for (int i = 0; i < aggregateCount; i++) {
                final String aggregateId = "order-parallel-" + i;
                executor.submit(() -> {
                    try {
                        startLatch.await();

                        // Each thread writes to its own aggregate
                        DomainEvent event = new OrderCreatedEvent(
                                aggregateId, 1L, "customer-" + aggregateId, BigDecimal.ZERO
                        );

                        eventStore.appendInitialEvent(aggregateId, event);
                        successCount.incrementAndGet();
                        
                    } catch (Exception e) {
                        errors.add("Failed for " + aggregateId + ": " + e.getMessage());
                    } finally {
                        doneLatch.countDown();
                    }
                });
            }

            startLatch.countDown();
            assertTrue(doneLatch.await(30, TimeUnit.SECONDS));
            executor.shutdown();

            assertTrue(errors.isEmpty(), "No errors should occur: " + errors);
            assertEquals(aggregateCount, successCount.get(), 
                "All writes to different aggregates should succeed");

            // Verify all aggregates have their events
            for (int i = 0; i < aggregateCount; i++) {
                String aggregateId = "order-parallel-" + i;
                assertEquals(1L, eventStore.getCurrentVersion(aggregateId),
                    "Aggregate " + aggregateId + " should have version 1");
            }
        }
    }

    @Nested
    @DisplayName("Race Condition Tests")
    class RaceConditionTests {

        @Test
        @DisplayName("Should prevent lost updates in race condition scenario")
        void shouldPreventLostUpdatesInRaceCondition() throws InterruptedException {
            String aggregateId = "order-lost-update";

            // Create initial event
            eventStore.appendInitialEvent(aggregateId,
                    new OrderCreatedEvent(aggregateId, 1L, "customer-1", BigDecimal.ZERO)
            );

            // Scenario: Two threads read version 1, both try to write version 2
            CountDownLatch readLatch = new CountDownLatch(2);
            CountDownLatch writeLatch = new CountDownLatch(2);
            
            AtomicInteger thread1Success = new AtomicInteger(0);
            AtomicInteger thread2Success = new AtomicInteger(0);
            AtomicInteger thread1Failure = new AtomicInteger(0);
            AtomicInteger thread2Failure = new AtomicInteger(0);

            // Thread 1
            Thread t1 = new Thread(() -> {
                try {
                    Long version = eventStore.getCurrentVersion(aggregateId);
                    readLatch.countDown();
                    readLatch.await(); // Wait for both threads to read

                    DomainEvent event = new OrderItemAddedEvent(
                            aggregateId, version + 1, "product-1", "Product 1",
                            1, BigDecimal.ONE, BigDecimal.ONE
                    );
                    eventStore.appendEvents(aggregateId, version, List.of(event));
                    thread1Success.incrementAndGet();
                } catch (ConcurrencyException e) {
                    thread1Failure.incrementAndGet();
                } catch (Exception e) {
                    fail("Thread 1 unexpected exception: " + e.getMessage());
                } finally {
                    writeLatch.countDown();
                }
            });

            // Thread 2
            Thread t2 = new Thread(() -> {
                try {
                    Long version = eventStore.getCurrentVersion(aggregateId);
                    readLatch.countDown();
                    readLatch.await(); // Wait for both threads to read

                    DomainEvent event = new OrderItemAddedEvent(
                            aggregateId, version + 1, "product-2", "Product 2",
                            1, BigDecimal.TEN, BigDecimal.TEN
                    );
                    eventStore.appendEvents(aggregateId, version, List.of(event));
                    thread2Success.incrementAndGet();
                } catch (ConcurrencyException e) {
                    thread2Failure.incrementAndGet();
                } catch (Exception e) {
                    fail("Thread 2 unexpected exception: " + e.getMessage());
                } finally {
                    writeLatch.countDown();
                }
            });

            t1.start();
            t2.start();

            assertTrue(writeLatch.await(30, TimeUnit.SECONDS));

            // Verify: Exactly one should succeed, one should fail
            assertEquals(1, thread1Success.get() + thread2Success.get(), 
                "Exactly one thread should succeed");
            assertEquals(1, thread1Failure.get() + thread2Failure.get(), 
                "Exactly one thread should fail");

            // Verify no lost update: should have 2 events total (initial + 1 successful)
            List<DomainEvent> events = eventStore.loadEvents(aggregateId);
            assertEquals(2, events.size(), "Should have exactly 2 events (no lost updates)");
        }
    }
}

