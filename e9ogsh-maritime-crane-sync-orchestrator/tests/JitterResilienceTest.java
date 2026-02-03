import com.porthorizon.crane.*;
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Jitter Resilience Tests - Requirement 7
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
    @DisplayName("Test 1: 100ms+ delay detected as stale")
    void test_1() {
        long base = 1_000_000_000L;
        
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 1000.0, base));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, base - 100_000_001L));
        
        assertTrue(service.isStaleDataDetected());
    }
    
    @Test
    @DisplayName("Test 2: MOVE blocked when stale")
    void test_2() {
        long base = 1_000_000_000L;
        service.start();
        
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 1000.0, base));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, base - 100_000_001L));
        
        assertTrue(service.isStaleDataDetected());
        assertFalse(service.executeCommand(Command.move(TelemetryPulse.CRANE_A, 100.0)));
    }
    
    @Test
    @DisplayName("Test 3: MOVE allowed when synchronized")
    void test_3() {
        long base = 1_000_000_000L;
        service.start();
        
        // Stale first
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, base - 100_000_001L));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 1000.0, base));
        assertTrue(service.isStaleDataDetected());
        
        // Then synchronized
        long sync = base + 200_000_000L;
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1010.0, sync));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 1010.0, sync + 5_000_000L));
        
        assertFalse(service.isStaleDataDetected());
        assertTrue(service.executeCommand(Command.move(TelemetryPulse.CRANE_A, 100.0)));
    }
    
    @Test
    @DisplayName("Test 4: Out-of-order keeps newest")
    void test_4() {
        long base = 1_000_000_000L;
        
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1050.0, base + 50_000_000L));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, base));
        
        assertEquals(1050.0, service.getLatestPulse(TelemetryPulse.CRANE_A).zAxisMm());
    }
    
    @Test
    @DisplayName("Test 5: 99ms gap is NOT stale")
    void test_5() {
        long base = 1_000_000_000L;
        
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, base));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 1000.0, base + 99_000_000L));
        
        assertFalse(service.isStaleDataDetected());
    }
}