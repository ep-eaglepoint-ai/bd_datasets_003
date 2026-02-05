package com.example.cache;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;

import java.lang.reflect.Field;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.BrokenBarrierException;
import java.util.concurrent.atomic.AtomicInteger;

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

    @Test
    public void testConsistencyUnderLoad() throws InterruptedException, NoSuchFieldException, IllegalAccessException {
        int capacity = 100;
        LRUCache<Integer, Integer> cache = new LRUCache<>(new CacheConfig(capacity));
        int numThreads = 20;
        int operationsPerThread = 5000;
        ExecutorService executor = Executors.newFixedThreadPool(numThreads);
        AtomicInteger errors = new AtomicInteger(0);
        CountDownLatch latch = new CountDownLatch(numThreads);

        for (int i = 0; i < numThreads; i++) {
            executor.submit(() -> {
                try {
                    for (int j = 0; j < operationsPerThread; j++) {
                        int key = j % 50; 
                        
                        // Mix of put, get, remove
                        double action = Math.random();
                        if (action < 0.3) {
                            cache.put(key, j);
                        } else if (action < 0.7) {
                            cache.get(key);
                        } else {
                            cache.remove(key);
                        }
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                    errors.incrementAndGet();
                } finally {
                    latch.countDown();
                }
            });
        }

        boolean completed = latch.await(30, TimeUnit.SECONDS);
        executor.shutdownNow();
        
        // Final consistency check
        Field mapField = LRUCache.class.getDeclaredField("cache");
        mapField.setAccessible(true);
        Map<?, ?> map = (Map<?, ?>) mapField.get(cache);
        
        Field headField = LRUCache.class.getDeclaredField("head");
        headField.setAccessible(true);
        Field tailField = LRUCache.class.getDeclaredField("tail");
        tailField.setAccessible(true);
        Field sizeField = LRUCache.class.getDeclaredField("size");
        sizeField.setAccessible(true);

        int mapSize = map.size();
        int reportedSize = (int) sizeField.get(cache); 

        // Walk the linked list
        int listCount = 0;
        Object current = headField.get(cache);
        while (current != null) {
            listCount++;
            Field nextField = current.getClass().getDeclaredField("next");
            nextField.setAccessible(true);
            current = nextField.get(current);
            
            if (listCount > capacity * 5) {
                fail("Cycle detected in linked list or list too long");
            }
        }
        
        assertEquals(0, errors.get(), "Exceptions occurred during threads execution");
        assertTrue(completed, "Test timed out - Possible Deadlock");

        assertEquals(mapSize, reportedSize, "Reported size must match internal map size (Low Level Check)");
        assertEquals(mapSize, listCount, "Linked list size must match map size (List Corruption Detected)");
        assertTrue(mapSize <= capacity, "Map grew larger than capacity! Eviction failed.");
    }
}
