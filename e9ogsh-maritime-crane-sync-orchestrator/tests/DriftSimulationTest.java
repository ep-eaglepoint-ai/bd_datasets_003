import com.porthorizon.crane.*;
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;

class DriftSimulationTest {
    
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
    @DisplayName("Test 1: Continuous ascent - HALT at ~5s when 100mm drift exceeded")
    void test_1() {
        service.start();
        
        double velocityA = 100.0;
        double velocityB = 80.0;
        long pulseIntervalNs = 50_000_000L;
        
        long faultTimeNs = -1;
        
        for (long t = 0; t <= 6_000_000_000L; t += pulseIntervalNs) {
            double timeSeconds = t / 1_000_000_000.0;
            double posA = velocityA * timeSeconds;
            double posB = velocityB * timeSeconds;
            
            service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, posA, t));
            service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, posB, t));
            
            if (service.getState() == LiftState.FAULT) {
                faultTimeNs = t;
                break;
            }
        }
        
        assertEquals(LiftState.FAULT, service.getState());
        assertTrue(controllerA.hasReceivedHaltAll());
        assertTrue(controllerB.hasReceivedHaltAll());
        
        double faultTimeSeconds = faultTimeNs / 1_000_000_000.0;
        assertTrue(faultTimeSeconds >= 5.0 && faultTimeSeconds <= 5.1,
            String.format("Fault should occur around 5s, got %.3fs", faultTimeSeconds));
    }
    
    @Test
    @DisplayName("Test 2: No HALT before threshold - 4 seconds of safe operation")
    void test_2() {
        service.start();
        
        double velocityA = 100.0;
        double velocityB = 80.0;
        long pulseIntervalNs = 50_000_000L;
        
        for (long t = 0; t <= 4_000_000_000L; t += pulseIntervalNs) {
            double timeSeconds = t / 1_000_000_000.0;
            double posA = velocityA * timeSeconds;
            double posB = velocityB * timeSeconds;
            
            service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, posA, t));
            service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, posB, t));
        }
        
        assertEquals(LiftState.LIFTING, service.getState());
        assertFalse(controllerA.hasReceivedHaltAll());
        assertEquals(80.0, service.calculateTiltDelta(), 1.0);
    }
    
    @Test
    @DisplayName("Test 3: Exact threshold boundary - 100mm safe, 100.1mm faults")
    void test_3() {
        service.start();
        
        long ts1 = 5_000_000_000L;
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 500.0, ts1));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 400.0, ts1));
        assertEquals(LiftState.LIFTING, service.getState());
        
        long ts2 = 5_050_000_000L;
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 500.1, ts2));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 400.0, ts2));
        assertEquals(LiftState.FAULT, service.getState());
    }
}