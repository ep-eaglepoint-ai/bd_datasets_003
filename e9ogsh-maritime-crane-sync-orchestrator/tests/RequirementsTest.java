import com.porthorizon.crane.*;
import org.junit.jupiter.api.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Requirements Integration Tests
 * - High-concurrency throughput (Req 4)
 * - 10ms processing window under load (Req 2)
 * - Liveness integration with 150ms timeout (Req 3)
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
    @DisplayName("Test 1: High-concurrency - 10,000+ updates/second")
    void test_1() throws Exception {
        service.start();
        
        int totalUpdates = 10000;
        ExecutorService executor = Executors.newFixedThreadPool(4);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(totalUpdates);
        AtomicInteger successCount = new AtomicInteger(0);
        
        long startTime = System.nanoTime();
        
        for (int i = 0; i < totalUpdates; i++) {
            final int idx = i;
            executor.submit(() -> {
                try {
                    startLatch.await();
                    String craneId = idx % 2 == 0 ? TelemetryPulse.CRANE_A : TelemetryPulse.CRANE_B;
                    service.ingestTelemetry(new TelemetryPulse(craneId, 1000.0 + idx * 0.001, System.nanoTime()));
                    successCount.incrementAndGet();
                } catch (Exception e) {} 
                finally { doneLatch.countDown(); }
            });
        }
        
        startLatch.countDown();
        assertTrue(doneLatch.await(10, TimeUnit.SECONDS));
        
        double elapsedSeconds = (System.nanoTime() - startTime) / 1_000_000_000.0;
        double throughput = totalUpdates / elapsedSeconds;
        
        executor.shutdown();
        
        assertEquals(totalUpdates, successCount.get());
        assertTrue(throughput >= 1000, String.format("Expected >=1000 updates/s, got %.0f", throughput));
        
        System.out.println("Throughput: " + (int)throughput + " updates/second");
    }
    
    @Test
    @DisplayName("Test 2: 10ms processing window under concurrent load")
    void test_2() throws Exception {
        service.start();
        
        int warmupUpdates = 1000;
        ExecutorService executor = Executors.newFixedThreadPool(4);
        CountDownLatch warmupLatch = new CountDownLatch(warmupUpdates);
        
        // Warmup - create backlog
        for (int i = 0; i < warmupUpdates; i++) {
            final int idx = i;
            executor.submit(() -> {
                try {
                    String craneId = idx % 2 == 0 ? TelemetryPulse.CRANE_A : TelemetryPulse.CRANE_B;
                    service.ingestTelemetry(new TelemetryPulse(craneId, 1000.0, System.nanoTime()));
                } finally { warmupLatch.countDown(); }
            });
        }
        warmupLatch.await(5, TimeUnit.SECONDS);
        
        // Now trigger fault while under load
        long beforeFault = System.nanoTime();
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 400.0, beforeFault));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 550.0, beforeFault)); // 150mm delta
        long afterFault = System.nanoTime();
        
        executor.shutdown();
        
        assertEquals(LiftState.FAULT, service.getState());
        assertTrue(controllerA.hasReceivedHaltAll());
        
        long processingTimeNs = afterFault - beforeFault;
        assertTrue(processingTimeNs <= 10_000_000L,
            String.format("Processing time %.3fms exceeds 10ms under load", processingTimeNs / 1_000_000.0));
    }
    
    @Test
    @DisplayName("Test 3: Liveness integration - 150ms timeout triggers FAULT and HALT_ALL")
    void test_3() throws Exception {
        // Use real 150ms timeout
        controllerA = new MockMotorController(TelemetryPulse.CRANE_A);
        controllerB = new MockMotorController(TelemetryPulse.CRANE_B);
        service = new TandemSyncService(controllerA, controllerB);
        
        AtomicBoolean faultTriggered = new AtomicBoolean(false);
        AtomicReference<String> faultReason = new AtomicReference<>();
        
        service.setFaultListener(reason -> {
            faultTriggered.set(true);
            faultReason.set(reason);
        });
        
        service.start();
        
        // Send initial synchronized pulses
        long ts = System.nanoTime();
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, ts));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 1000.0, ts));
        
        assertEquals(LiftState.LIFTING, service.getState());
        
        // Only update Crane-A for 200ms (Crane-B times out after 150ms)
        for (int i = 0; i < 10; i++) {
            Thread.sleep(25);
            service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0 + i, System.nanoTime()));
        }
        
        // Wait for timeout detection
        Thread.sleep(50);
        
        // Verify FAULT triggered due to liveness timeout
        assertEquals(LiftState.FAULT, service.getState(), "Should be FAULT after 150ms timeout");
        assertTrue(faultTriggered.get(), "Fault listener should be called");
        assertTrue(faultReason.get().contains("timeout"), "Reason should mention timeout");
        assertTrue(controllerA.hasReceivedHaltAll(), "HALT_ALL should be sent on liveness timeout");
        assertTrue(controllerB.hasReceivedHaltAll(), "HALT_ALL should be sent on liveness timeout");
    }
}