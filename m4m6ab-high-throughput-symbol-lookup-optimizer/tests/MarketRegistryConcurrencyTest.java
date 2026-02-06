package com.quantflow.tests;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Basic concurrency test to validate that multiple threads can query the
 * registry while it is being updated via loadSymbols without throwing
 * exceptions or returning obviously inconsistent data.
 *
 * This is a pragmatic, black-box confirmation of the thread-safety
 * requirement rather than a full formal proof.
 */
public class MarketRegistryConcurrencyTest {

    @Test
    void supportsConcurrentReadsAndSymbolLoads() throws Exception {
        RegistryTestSupport.LoadedRegistry loaded = RegistryTestSupport.loadRegistry();

        Object registry = loaded.registryInstance;
        Method loadSymbols = loaded.registryClass.getMethod("loadSymbols", List.class);
        Method getTickerById = loaded.registryClass.getMethod("getTickerById", String.class);
        Method getSize = loaded.registryClass.getMethod("getSize");

        int initialCount = 10_000;
        List<Object> initialRecords = new ArrayList<>();
        for (int i = 0; i < initialCount; i++) {
            initialRecords.add(RegistryTestSupport.newSymbolRecord(loaded, "ID-" + i, "TICK" + i));
        }
        loadSymbols.invoke(registry, initialRecords);

        int writerBatches = 20;
        int batchSize = 1_000;

        ExecutorService executor = Executors.newFixedThreadPool(8);
        CountDownLatch startLatch = new CountDownLatch(1);

        // Writer: repeatedly load additional symbols.
        Future<?> writerFuture = executor.submit(() -> {
            try {
                startLatch.await();
                for (int b = 0; b < writerBatches; b++) {
                    List<Object> batch = new ArrayList<>();
                    int base = initialCount + b * batchSize;
                    for (int i = 0; i < batchSize; i++) {
                        int idx = base + i;
                        batch.add(RegistryTestSupport.newSymbolRecord(loaded, "ID-" + idx, "TICK" + idx));
                    }
                    loadSymbols.invoke(registry, batch);
                }
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });

        // Readers: hammer getTickerById while writer is running.
        int readerThreads = 6;
        List<Future<Boolean>> readerFutures = new ArrayList<>();
        for (int t = 0; t < readerThreads; t++) {
            Future<Boolean> f = executor.submit(() -> {
                startLatch.await();
                try {
                    for (int i = 0; i < 50_000; i++) {
                        String id = "ID-" + (i % initialCount);
                        Object ticker = getTickerById.invoke(registry, id);
                        if (ticker != null && !ticker.toString().startsWith("TICK")) {
                            return false;
                        }
                    }
                    return true;
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            });
            readerFutures.add(f);
        }

        // Start all workers.
        startLatch.countDown();

        writerFuture.get();
        for (Future<Boolean> f : readerFutures) {
            assertTrue(f.get(), "Reader observed an inconsistent ticker value");
        }

        executor.shutdownNow();

        // At least the initial symbols plus all batches should be present.
        int expectedMinimumSize = initialCount + writerBatches * batchSize;
        int actualSize = ((Number) getSize.invoke(registry)).intValue();
        assertTrue(actualSize >= expectedMinimumSize, "Registry size should reflect loaded symbols");

        // Sanity: a known recently inserted ID should be resolvable.
        String lastId = "ID-" + (initialCount + writerBatches * batchSize - 1);
        Object lastTicker = getTickerById.invoke(registry, lastId);
        assertEquals("TICK" + (initialCount + writerBatches * batchSize - 1), lastTicker);
    }
}


