import com.porthorizon.crane.*;
import org.junit.jupiter.api.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import static org.junit.jupiter.api.Assertions.*;

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
    @DisplayName("Test 1: High-concurrency - 2000+ updates/second")
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
        assertTrue(throughput >= 2000, 
            String.format("Expected >=2000 updates/s, got %.0f", throughput));
        
        System.out.println("Throughput: " + (int)throughput + " updates/second");
    }
    
    @Test
    @DisplayName("Test 2: 10ms HALT window - asserts wasProcessingWithinWindow")
    void test_2() {
        service.start();
        
        // Safe data first
        long baseTs = System.nanoTime();
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, baseTs));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 1000.0, baseTs));
        assertEquals(LiftState.LIFTING, service.getState());
        
        // Trigger fault (150mm > 100mm threshold)
        long faultTs = baseTs + 50_000_000L;
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 550.0, faultTs));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 400.0, faultTs));
        
        // Verify state transition
        assertEquals(LiftState.FAULT, service.getState());
        assertTrue(controllerA.hasReceivedHaltAll());
        assertTrue(controllerB.hasReceivedHaltAll());
        
        // CRITICAL: Assert the 10ms window using the service's timing methods
        long thresholdCrossed = service.getThresholdCrossedTimestamp();
        long haltIssued = service.getHaltIssuedTimestamp();
        
        assertTrue(thresholdCrossed > 0, "Threshold crossed timestamp must be recorded");
        assertTrue(haltIssued > 0, "HALT issued timestamp must be recorded");
        assertTrue(haltIssued >= thresholdCrossed, "HALT must be issued after threshold crossed");
        
        long processingTimeNs = service.getProcessingTimeNs();
        assertTrue(processingTimeNs > 0, "Processing time must be positive");
        assertTrue(processingTimeNs <= 10_000_000L,
            String.format("Processing time %.3fms exceeds 10ms limit", processingTimeNs / 1_000_000.0));
        
        // Use the dedicated method
        assertTrue(service.wasProcessingWithinWindow(), 
            "wasProcessingWithinWindow() must return true for valid safety interlock");
        
        System.out.println("Processing time: " + (processingTimeNs / 1000.0) + " µs");
    }
    
    @Test
    @DisplayName("Test 3: Atomic FAULT/reset - MOVE rejected after FAULT, accepted after reset")
    void test_3() {
        service.start();
        assertEquals(LiftState.LIFTING, service.getState());
        
        // Step 1: Trigger FAULT
        long ts = System.nanoTime();
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 600.0, ts));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 400.0, ts));
        assertEquals(LiftState.FAULT, service.getState(), "System should be in FAULT state");
        
        // Step 2: MOVE must be REJECTED in FAULT state
        controllerA.clearCommands();
        boolean moveResult1 = service.executeCommand(Command.move(TelemetryPulse.CRANE_A, 50.0));
        assertFalse(moveResult1, "MOVE command MUST be REJECTED when in FAULT state");
        assertFalse(controllerA.getReceivedCommands().stream()
            .anyMatch(c -> Command.MOVE.equals(c.type())), 
            "No MOVE command should reach controller in FAULT state");
        
        // Step 3: Manual reset
        service.reset();
        assertEquals(LiftState.IDLE, service.getState(), "System should be IDLE after reset");
        
        // Step 4: Restart the service
        service.start();
        assertEquals(LiftState.LIFTING, service.getState(), "System should be LIFTING after restart");
        
        // Step 5: Add synchronized telemetry (required for non-stale state)
        long ts2 = System.nanoTime();
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, ts2));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 1000.0, ts2));
        assertFalse(service.isStaleDataDetected(), "Data should not be stale after sync");
        
        // Step 6: MOVE must be ACCEPTED after reset
        controllerA.clearCommands();
        boolean moveResult2 = service.executeCommand(Command.move(TelemetryPulse.CRANE_A, 50.0));
        assertTrue(moveResult2, "MOVE command MUST be ACCEPTED after reset");
        assertTrue(controllerA.getReceivedCommands().stream()
            .anyMatch(c -> Command.MOVE.equals(c.type())), 
            "MOVE command should reach controller after reset");
        
        System.out.println("End-to-end FAULT->reset->MOVE flow verified");
    }
    
    @Test
    @DisplayName("Test 4: Liveness 150ms timeout triggers FAULT")
    void test_4() throws Exception {
        AtomicBoolean faultTriggered = new AtomicBoolean(false);
        AtomicReference<String> faultReason = new AtomicReference<>();
        
        service.setFaultListener(reason -> {
            faultTriggered.set(true);
            faultReason.set(reason);
        });
        
        service.start();
        
        long ts = System.nanoTime();
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, ts));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 1000.0, ts));
        assertEquals(LiftState.LIFTING, service.getState());
        
        for (int i = 0; i < 10; i++) {
            Thread.sleep(25);
            service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0 + i, System.nanoTime()));
        }
        
        Thread.sleep(50);
        
        assertEquals(LiftState.FAULT, service.getState());
        assertTrue(faultTriggered.get());
        assertTrue(faultReason.get().contains("timeout"));
        assertTrue(controllerA.hasReceivedHaltAll());
        assertTrue(controllerB.hasReceivedHaltAll());
    }
    
    @Test
    @DisplayName("Test 5: Clock drift resilience - systematic offset compensation")
    void test_5() {
        // Simulate Crane-A's clock running 50ms ahead of Crane-B
        long clockOffset = 50_000_000L;
        service.calibrateClockOffset(1_050_000_000L, 1_000_000_000L);
        
        assertTrue(service.isClockOffsetCalibrated());
        assertEquals(clockOffset, service.getClockOffsetNs());
        
        service.start();
        
        // Send pulses that appear misaligned by 50ms but are actually synchronized
        // Without drift compensation, these would be marked as stale (50ms > tolerance without adjustment)
        // With compensation, they should align properly
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, 2_050_000_000L));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 1010.0, 2_000_000_000L));
        
        // Should NOT be stale because drift compensation aligns the timestamps
        assertEquals(LiftState.LIFTING, service.getState());
        assertFalse(service.isStaleDataDetected(), "Should not be stale after clock drift calibration");
        
        // Verify the adjusted timestamp
        TelemetryPulse pulseA = service.getLatestPulse(TelemetryPulse.CRANE_A);
        long adjustedA = service.getAdjustedTimestamp(pulseA);
        assertEquals(2_000_000_000L, adjustedA, "Adjusted timestamp should match Crane-B's reference");
        
        System.out.println("Clock drift compensation verified: offset=" + clockOffset + "ns");
    }
}