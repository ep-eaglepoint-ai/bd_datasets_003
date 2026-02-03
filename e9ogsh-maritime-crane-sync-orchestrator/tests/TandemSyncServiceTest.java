import com.porthorizon.crane.*;
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Core TandemSyncService tests.
 */
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
        
        // Verify command type
        assertTrue(controllerA.getReceivedCommands().stream().anyMatch(c -> Command.HALT_ALL.equals(c.type())));
    }
    
    @Test
    @DisplayName("Test 2: Closest temporal pair selected from buffer")
    void test_2() {
        long base = 1_000_000_000L;
        
        // Add pulses with varying timestamps
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 100.0, base));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 110.0, base + 100_000_000L));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 105.0, base + 95_000_000L));
        
        AlignedTelemetryPair pair = service.findClosestAlignedPair();
        assertNotNull(pair);
        
        // Closest pair: A@100ms and B@95ms (5ms gap)
        assertTrue(pair.alignmentDeltaNs() <= 10_000_000L, "Should select closest pair");
    }
    
    @Test
    @DisplayName("Test 3: Out-of-order keeps newest by timestamp")
    void test_3() {
        long base = 1_000_000_000L;
        
        // Send newer first
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 200.0, base + 50_000_000L));
        // Send older later
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 100.0, base));
        
        TelemetryPulse latest = service.getLatestPulse(TelemetryPulse.CRANE_A);
        assertEquals(200.0, latest.zAxisMm(), "Should keep newer by timestamp");
    }
}