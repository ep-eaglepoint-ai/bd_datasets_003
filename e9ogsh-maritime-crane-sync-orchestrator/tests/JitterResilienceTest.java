import com.porthorizon.crane.*;
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Jitter Resilience Tests - Requirement 7
 * "Mock a scenario where Crane-A's telemetry arrives with a 100ms delay 
 *  while Crane-B remains on time."
 */
class JitterResilienceTest {
    
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
    @DisplayName("Test 1: Crane-A 100ms+ delayed - detected as stale (per Req 7)")
    void test_1() {
        // Requirement 7: "Crane-A's telemetry arrives with a 100ms delay while Crane-B remains on time"
        long currentTime = 1_000_000_000L;
        
        // Crane-B is on time
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 1000.0, currentTime));
        
        // Crane-A is delayed by 100ms+ (its timestamp is 100ms behind)
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, currentTime - 100_000_001L));
        
        assertTrue(service.isStaleDataDetected(), 
            "Crane-A's 100ms+ delay should be detected as stale data");
    }
    
    @Test
    @DisplayName("Test 2: Crane-A arrival-time delayed - detected as stale")
    void test_2() {
        // Same internal timestamps but Crane-A arrives 100ms+ late (network jitter)
        long sameTimestamp = 1_000_000_000L;
        long arrivalB = 1_000_000_000L;  // Crane-B arrives on time
        long arrivalA = arrivalB + 100_000_001L;  // Crane-A arrives 100ms later
        
        // Crane-B arrives first (on time)
        service.ingestTelemetryWithArrival(
            new TelemetryPulse(TelemetryPulse.CRANE_B, 1000.0, sameTimestamp),
            arrivalB
        );
        
        // Crane-A arrives 100ms+ later (delayed)
        service.ingestTelemetryWithArrival(
            new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, sameTimestamp),
            arrivalA
        );
        
        assertTrue(service.hasStaleArrivalData(), 
            "Crane-A's 100ms+ arrival delay should be detected");
    }
    
    @Test
    @DisplayName("Test 3: MOVE blocked when Crane-A data is stale")
    void test_3() {
        long currentTime = 1_000_000_000L;
        service.start();
        
        // Crane-B on time, Crane-A delayed
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 1000.0, currentTime));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, currentTime - 100_000_001L));
        
        assertTrue(service.isStaleDataDetected(), "Should detect stale data");
        assertFalse(service.executeCommand(Command.move(TelemetryPulse.CRANE_A, 100.0)),
            "MOVE should be refused until synchronized telemetry is restored");
    }
    
    @Test
    @DisplayName("Test 4: MOVE allowed after synchronized telemetry restored")
    void test_4() {
        long currentTime = 1_000_000_000L;
        service.start();
        
        // Initially stale: Crane-A delayed
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 1000.0, currentTime));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, currentTime - 100_000_001L));
        assertTrue(service.isStaleDataDetected(), "Initially stale");
        
        // Synchronization restored: both cranes report at same time
        long syncTime = currentTime + 200_000_000L;
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1010.0, syncTime));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 1010.0, syncTime + 5_000_000L));
        
        assertFalse(service.isStaleDataDetected(), "Should no longer be stale after sync");
        assertTrue(service.executeCommand(Command.move(TelemetryPulse.CRANE_A, 100.0)),
            "MOVE should be allowed after synchronized telemetry restored");
    }
    
    @Test
    @DisplayName("Test 5: Out-of-order Crane-A packets - newest kept")
    void test_5() {
        long base = 1_000_000_000L;
        
        // Newer Crane-A packet arrives first (out of order)
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1050.0, base + 50_000_000L));
        // Older Crane-A packet arrives later
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, base));
        
        TelemetryPulse latest = service.getLatestPulse(TelemetryPulse.CRANE_A);
        assertEquals(1050.0, latest.zAxisMm(), "Should keep newer packet by timestamp");
        assertEquals(base + 50_000_000L, latest.timestampNs());
    }
}