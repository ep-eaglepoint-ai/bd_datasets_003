import com.porthorizon.crane.*;
import org.junit.jupiter.api.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import static org.junit.jupiter.api.Assertions.*;

class TandemSyncServiceTest {
    
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
    @DisplayName("Test 1: HALT_ALL sent to both controllers")
    void test_1() {
        service.start();
        long ts = System.nanoTime();
        
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 400.0, ts));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 550.0, ts));
        
        assertEquals(LiftState.FAULT, service.getState());
        assertTrue(controllerA.hasReceivedHaltAll());
        assertTrue(controllerB.hasReceivedHaltAll());
        assertTrue(controllerA.getReceivedCommands().stream().anyMatch(c -> Command.HALT_ALL.equals(c.type())));
    }
    
    @Test
    @DisplayName("Test 2: Closest temporal pair selected from buffer")
    void test_2() {
        long base = 1_000_000_000L;
        
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 100.0, base));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 110.0, base + 100_000_000L));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 105.0, base + 95_000_000L));
        
        AlignedTelemetryPair pair = service.findClosestAlignedPair();
        assertNotNull(pair);
        assertTrue(pair.alignmentDeltaNs() <= 10_000_000L);
    }
    
    @Test
    @DisplayName("Test 3: Non-blocking backlog - latest evaluated promptly")
    void test_3() throws Exception {
        service.start();
        
        ExecutorService executor = Executors.newFixedThreadPool(4);
        CountDownLatch startLatch = new CountDownLatch(1);
        int backlogSize = 1000;
        
        for (int i = 0; i < backlogSize; i++) {
            final int idx = i;
            executor.submit(() -> {
                try {
                    startLatch.await();
                    String craneId = idx % 2 == 0 ? TelemetryPulse.CRANE_A : TelemetryPulse.CRANE_B;
                    service.ingestTelemetry(new TelemetryPulse(craneId, 1000.0, System.nanoTime()));
                } catch (Exception e) {}
            });
        }
        
        startLatch.countDown();
        Thread.sleep(50);
        
        long criticalTime = System.nanoTime();
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1200.0, criticalTime));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 1000.0, criticalTime));
        long afterCritical = System.nanoTime();
        
        executor.shutdown();
        
        assertEquals(LiftState.FAULT, service.getState());
        
        long processingTime = afterCritical - criticalTime;
        assertTrue(processingTime <= 10_000_000L,
            String.format("Backlog should not delay. Took %.3fms", processingTime / 1_000_000.0));
    }
    
    @Test
    @DisplayName("Test 4: Out-of-order keeps newest by timestamp")
    void test_4() {
        long base = 1_000_000_000L;
        
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 200.0, base + 50_000_000L));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 100.0, base));
        
        TelemetryPulse latest = service.getLatestPulse(TelemetryPulse.CRANE_A);
        assertEquals(200.0, latest.zAxisMm());
    }
}