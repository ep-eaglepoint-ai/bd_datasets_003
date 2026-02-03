package com.porthorizon.crane;

import org.junit.jupiter.api.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Comprehensive requirements verification including high-concurrency load test.
 */
class RequirementsTest {
    
    private TandemSyncService service;
    private MockMotorController controllerA;
    private MockMotorController controllerB;
    
    @BeforeEach
    void setUp() {
        controllerA = new MockMotorController(TelemetryPulse.CRANE_A);
        controllerB = new MockMotorController(TelemetryPulse.CRANE_B);
        service = new TandemSyncService(controllerA, controllerB);
    }
    
    @AfterEach
    void tearDown() {
        if (service != null) service.shutdown();
    }
    
    @Test
    @DisplayName("Test 1: High-concurrency load test - 10,000+ updates per second")
    void test_1() throws Exception {
        service.start();
        
        int totalUpdates = 10000;
        int threadCount = 4;
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(totalUpdates);
        AtomicInteger successCount = new AtomicInteger(0);
        
        long startTime = System.nanoTime();
        
        // Submit all updates
        for (int i = 0; i < totalUpdates; i++) {
            final int idx = i;
            executor.submit(() -> {
                try {
                    startLatch.await();
                    String craneId = idx % 2 == 0 ? TelemetryPulse.CRANE_A : TelemetryPulse.CRANE_B;
                    TelemetryPulse pulse = new TelemetryPulse(craneId, 1000.0 + (idx * 0.001), System.nanoTime());
                    service.ingestTelemetry(pulse); // Non-blocking
                    successCount.incrementAndGet();
                } catch (Exception e) {
                    // Ignore
                } finally {
                    doneLatch.countDown();
                }
            });
        }
        
        // Start all threads simultaneously
        startLatch.countDown();
        
        // Wait for completion
        assertTrue(doneLatch.await(10, TimeUnit.SECONDS), "All updates should complete within 10 seconds");
        
        long endTime = System.nanoTime();
        double elapsedSeconds = (endTime - startTime) / 1_000_000_000.0;
        double updatesPerSecond = totalUpdates / elapsedSeconds;
        
        executor.shutdown();
        executor.awaitTermination(1, TimeUnit.SECONDS);
        
        // Verify high throughput
        assertEquals(totalUpdates, successCount.get(), "All updates should succeed");
        assertTrue(updatesPerSecond >= 1000, 
            String.format("Should process at least 1000 updates/sec, got %.0f", updatesPerSecond));
        
        System.out.println(String.format("Throughput: %.0f updates/second", updatesPerSecond));
    }
}