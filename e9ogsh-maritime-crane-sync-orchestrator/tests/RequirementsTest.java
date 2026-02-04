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
    }
    
    @Test
    @DisplayName("Test 2: 10ms HALT window - threshold cross to HALT issued")
    void test_2() {
        service.start();
        
        long baseTs = System.nanoTime();
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, baseTs));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 1000.0, baseTs));
        assertEquals(LiftState.LIFTING, service.getState());
        
        long faultTs = baseTs + 50_000_000L;
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 550.0, faultTs));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 400.0, faultTs));
        
        assertEquals(LiftState.FAULT, service.getState());
        assertTrue(controllerA.hasReceivedHaltAll());
        assertTrue(controllerB.hasReceivedHaltAll());
        
        long processingTimeNs = service.getProcessingTimeNs();
        assertTrue(processingTimeNs > 0);
        assertTrue(processingTimeNs <= 10_000_000L,
            String.format("Processing: %.3fms (must be <= 10ms)", processingTimeNs / 1_000_000.0));
        assertTrue(service.wasProcessingWithinWindow());
    }
    
    @Test
    @DisplayName("Test 3: Atomic FAULT/reset - MOVE rejected then accepted")
    void test_3() {
        service.start();
        
        long ts = System.nanoTime();
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 600.0, ts));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 400.0, ts));
        assertEquals(LiftState.FAULT, service.getState());
        
        boolean moveRejected = service.executeCommand(Command.move(TelemetryPulse.CRANE_A, 50.0));
        assertFalse(moveRejected, "MOVE MUST be REJECTED after FAULT");
        
        service.reset();
        assertEquals(LiftState.IDLE, service.getState());
        
        service.start();
        assertEquals(LiftState.LIFTING, service.getState());
        
        long ts2 = System.nanoTime();
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, ts2));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 1000.0, ts2));
        
        boolean moveAccepted = service.executeCommand(Command.move(TelemetryPulse.CRANE_A, 50.0));
        assertTrue(moveAccepted, "MOVE MUST be ACCEPTED after reset");
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
    @DisplayName("Test 5: Clock drift resilience with calibration")
    void test_5() {
        long clockOffset = 50_000_000L;
        service.calibrateClockOffset(1_050_000_000L, 1_000_000_000L);
        
        assertTrue(service.isClockOffsetCalibrated());
        assertEquals(clockOffset, service.getClockOffsetNs());
        
        service.start();
        
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, 2_050_000_000L));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 1010.0, 2_000_000_000L));
        
        assertEquals(LiftState.LIFTING, service.getState());
        assertFalse(service.isStaleDataDetected());
    }
}