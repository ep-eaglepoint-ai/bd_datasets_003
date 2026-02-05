package com.example.cache;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.BrokenBarrierException;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Aggressive stress test designed to expose concurrency bugs in the original LRUCache.
 * This test uses a CyclicBarrier to ensure threads hit the critical section simultaneously.
 */
public class DeadlockStressTest {
    
    @Test
    public void testDeadlockWithBarrier() throws InterruptedException {
        LRUCache<Integer, Integer> cache = new LRUCache<>(new CacheConfig(10));
        
        // Pre-populate cache
        for (int i = 0; i < 5; i++) {
            cache.put(i, i);
        }
        
        int numThreads = 20;
        CyclicBarrier barrier = new CyclicBarrier(numThreads);
        ExecutorService executor = Executors.newFixedThreadPool(numThreads);
        CountDownLatch latch = new CountDownLatch(numThreads);
        
        // Half the threads will do get() (mapLock -> listLock)
        // Half will do put() (listLock -> mapLock)
        // Using a barrier ensures they all hit the locks at the same time
        
        for (int i = 0; i < numThreads; i++) {
            final int threadId = i;
            executor.submit(() -> {
                try {
                    barrier.await(); // Wait for all threads to be ready
                    
                    for (int j = 0; j < 1000; j++) {
                        if (threadId % 2 == 0) {
                            // Thread does get (mapLock -> listLock)
                            cache.get(j % 5);
                        } else {
                            // Thread does put (listLock -> mapLock)
                            cache.put(j % 10, j);
                        }
                    }
                } catch (InterruptedException | BrokenBarrierException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    latch.countDown();
                }
            });
        }
        
        // Wait with a timeout - if it times out, we have a deadlock
        boolean completed = latch.await(5, TimeUnit.SECONDS);
        executor.shutdownNow();
        
        assertTrue(completed, "DEADLOCK DETECTED: Test timed out waiting for threads to complete");
    }
}
