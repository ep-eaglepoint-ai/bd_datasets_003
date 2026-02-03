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
    @DisplayName("Test 1: HALT triggered at 5 seconds with 100mm/s vs 80mm/s drift")
    void test_1() {
        service.start();
        
        // At t=5.0s: delta=100mm - NO FAULT
        sendBothPulses(5_000_000_000L, 500.0, 400.0);
        assertEquals(LiftState.LIFTING, service.getState());
        
        // At t=5.05s: delta=101mm - FAULT!
        sendBothPulses(5_050_000_000L, 505.0, 404.0);
        assertEquals(LiftState.FAULT, service.getState());
        
        assertTrue(controllerA.hasReceivedHaltAll());
        assertTrue(controllerB.hasReceivedHaltAll());
    }
    
    @Test
    @DisplayName("Test 2: No HALT before threshold is reached")
    void test_2() {
        service.start();
        
        sendBothPulses(4_000_000_000L, 400.0, 320.0);
        
        assertEquals(LiftState.LIFTING, service.getState());
        assertEquals(80.0, service.calculateTiltDelta(), 0.1);
    }
    
    @Test
    @DisplayName("Test 3: Verifies exact threshold boundary")
    void test_3() {
        service.start();
        
        // 100mm delta - NO FAULT
        sendBothPulses(1_000_000_000L, 1000.0, 1100.0);
        assertEquals(LiftState.LIFTING, service.getState());
        
        // 100.1mm delta - FAULT
        // Must be newer than previous to ensure it's picked by buffer logic
        sendBothPulses(1_050_000_000L, 1000.0, 1100.1);
        assertEquals(LiftState.FAULT, service.getState());
    }
    
    private void sendBothPulses(long timestampNs, double posA, double posB) {
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, posB, timestampNs));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, posA, timestampNs));
    }
}