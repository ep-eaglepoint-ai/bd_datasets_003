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
    @DisplayName("Test 1: HALT at exactly 5s threshold crossing (100mm/s vs 80mm/s)")
    void test_1() {
        service.start();
        
        // Crane-A: 100mm/s, Crane-B: 80mm/s
        // Drift rate: 20mm/s
        // Delta = 20 * t mm
        // At t=5.0s: delta = 100mm (exactly at threshold, should NOT fault since > 100mm required)
        // At t=5.0+ε: delta > 100mm (FAULT triggers)
        
        double velocityA = 100.0; // mm/s
        double velocityB = 80.0;  // mm/s
        
        // Use 1ms pulse intervals for precise threshold detection
        long pulseIntervalNs = 1_000_000L; // 1ms
        long faultTimeNs = -1;
        
        // Simulate from 4.9s to 5.1s with high resolution
        long startNs = 4_900_000_000L;
        long endNs = 5_100_000_000L;
        
        for (long t = startNs; t <= endNs; t += pulseIntervalNs) {
            double timeSeconds = t / 1_000_000_000.0;
            double posA = velocityA * timeSeconds;
            double posB = velocityB * timeSeconds;
            double delta = posA - posB;
            
            service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, posA, t));
            service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, posB, t));
            
            if (service.getState() == LiftState.FAULT) {
                faultTimeNs = t;
                System.out.println(String.format("FAULT at t=%.4fs, delta=%.2fmm", timeSeconds, delta));
                break;
            }
        }
        
        assertEquals(LiftState.FAULT, service.getState(), "Should enter FAULT state");
        assertTrue(controllerA.hasReceivedHaltAll(), "Crane-A should receive HALT_ALL");
        assertTrue(controllerB.hasReceivedHaltAll(), "Crane-B should receive HALT_ALL");
        
        // Verify HALT occurs at exactly 5.001s (first ms after 5s where delta > 100mm)
        double faultTimeSeconds = faultTimeNs / 1_000_000_000.0;
        
        // At t=5.0s: delta = 100.0mm (safe, threshold is > 100mm)
        // At t=5.001s: delta = 100.02mm (FAULT!)
        assertTrue(faultTimeSeconds > 5.0, 
            String.format("Fault must occur AFTER 5.0s (delta=100mm), got %.4fs", faultTimeSeconds));
        assertTrue(faultTimeSeconds <= 5.002, 
            String.format("Fault must occur within 2ms after 5.0s, got %.4fs", faultTimeSeconds));
        
        System.out.println("Exact threshold crossing verified at t=" + faultTimeSeconds + "s");
    }
    
    @Test
    @DisplayName("Test 2: No HALT at exactly 5.0s (delta=100mm, threshold is >100mm)")
    void test_2() {
        service.start();
        
        double velocityA = 100.0;
        double velocityB = 80.0;
        
        // At exactly 5.0s
        long ts = 5_000_000_000L;
        double posA = velocityA * 5.0; // 500mm
        double posB = velocityB * 5.0; // 400mm
        double delta = posA - posB;    // 100mm exactly
        
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, posA, ts));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, posB, ts));
        
        // Should NOT fault because delta=100mm and threshold is >100mm
        assertEquals(LiftState.LIFTING, service.getState(), 
            String.format("Should NOT fault at exactly 100mm (delta=%.2fmm)", delta));
        assertFalse(controllerA.hasReceivedHaltAll());
        assertEquals(100.0, service.calculateTiltDelta(), 0.01);
        
        System.out.println("Confirmed: No FAULT at delta=100mm (exactly at threshold boundary)");
    }
    
    @Test
    @DisplayName("Test 3: Continuous ascent simulation - 50ms intervals")
    void test_3() {
        service.start();
        
        double velocityA = 100.0;
        double velocityB = 80.0;
        long pulseIntervalNs = 50_000_000L; // 50ms standard interval
        
        long faultTimeNs = -1;
        
        // Run continuous simulation
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
        
        // With 50ms intervals:
        // t=5.00s: delta=100.0mm (safe)
        // t=5.05s: delta=101.0mm (FAULT)
        double faultTimeSeconds = faultTimeNs / 1_000_000_000.0;
        assertEquals(5.05, faultTimeSeconds, 0.001, 
            "With 50ms pulses, FAULT should occur at t=5.05s");
        
        System.out.println("50ms interval simulation: FAULT at t=" + faultTimeSeconds + "s");
    }
}