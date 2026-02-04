import com.porthorizon.crane.*;
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;

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
    @DisplayName("Test 1: 100ms+ timestamp skew detected as stale")
    void test_1() {
        long base = 1_000_000_000L;
        
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 1000.0, base));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, base - 100_000_001L));
        
        assertTrue(service.isStaleDataDetected(), "100ms+ timestamp gap should be stale");
    }
    
    @Test
    @DisplayName("Test 2: True arrival-time delay detected as stale")
    void test_2() {
        long sameTimestamp = 1_000_000_000L;
        long arrivalA = 1_000_000_000L;
        long arrivalB = arrivalA + 100_000_001L;
        
        service.ingestTelemetryWithArrival(
            new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, sameTimestamp),
            arrivalA
        );
        service.ingestTelemetryWithArrival(
            new TelemetryPulse(TelemetryPulse.CRANE_B, 1000.0, sameTimestamp),
            arrivalB
        );
        
        assertTrue(service.hasStaleArrivalData(), "Arrival time delay should be detected");
    }
    
    @Test
    @DisplayName("Test 3: MOVE blocked when stale")
    void test_3() {
        long base = 1_000_000_000L;
        service.start();
        
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 1000.0, base));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, base - 100_000_001L));
        
        assertTrue(service.isStaleDataDetected());
        assertFalse(service.executeCommand(Command.move(TelemetryPulse.CRANE_A, 100.0)),
            "MOVE should be rejected when stale");
    }
    
    @Test
    @DisplayName("Test 4: MOVE allowed when re-synchronized")
    void test_4() {
        long base = 1_000_000_000L;
        service.start();
        
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, base - 100_000_001L));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 1000.0, base));
        assertTrue(service.isStaleDataDetected());
        
        long sync = base + 200_000_000L;
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1010.0, sync));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 1010.0, sync + 5_000_000L));
        
        assertFalse(service.isStaleDataDetected());
        assertTrue(service.executeCommand(Command.move(TelemetryPulse.CRANE_A, 100.0)));
    }
    
    @Test
    @DisplayName("Test 5: Out-of-order delivery - newest timestamp kept")
    void test_5() {
        long base = 1_000_000_000L;
        
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1050.0, base + 50_000_000L));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, base));
        
        TelemetryPulse latest = service.getLatestPulse(TelemetryPulse.CRANE_A);
        assertEquals(1050.0, latest.zAxisMm());
        assertEquals(base + 50_000_000L, latest.timestampNs());
    }
}