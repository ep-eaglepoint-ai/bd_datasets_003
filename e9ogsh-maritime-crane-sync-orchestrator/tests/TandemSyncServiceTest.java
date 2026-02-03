package com.porthorizon.crane;

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
    @DisplayName("Test 1: HALT_ALL is issued to both controllers (not two separate HALTs)")
    void test_1() {
        service.start();
        
        long timestamp = System.nanoTime();
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, timestamp));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 1200.0, timestamp));
        
        assertEquals(LiftState.FAULT, service.getState());
        
        // Both should receive HALT_ALL
        assertTrue(controllerA.hasReceivedHaltAll(), "Controller A should receive HALT_ALL");
        assertTrue(controllerB.hasReceivedHaltAll(), "Controller B should receive HALT_ALL");
        
        // Verify command type
        Command cmdA = controllerA.getReceivedCommands().stream()
            .filter(Command::isHaltAll).findFirst().orElse(null);
        assertNotNull(cmdA);
        assertEquals(Command.HALT_ALL, cmdA.type());
    }
    
    @Test
    @DisplayName("Test 2: Processing completes within 10ms window")
    void test_2() {
        service.start();
        
        long timestamp = System.nanoTime();
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, timestamp));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 1200.0, timestamp));
        
        assertEquals(LiftState.FAULT, service.getState());
        
        long processingTimeNs = service.getProcessingTimeNs();
        double processingTimeMs = processingTimeNs / 1_000_000.0;
        
        // Processing should be within 10ms
        assertTrue(processingTimeNs <= TandemSyncService.MAX_PROCESSING_WINDOW_NS,
            String.format("Processing time %.3fms should be <= 10ms", processingTimeMs));
    }
    
    @Test
    @DisplayName("Test 3: Uses most recent pulses by timestamp for alignment")
    void test_3() {
        long baseTime = 1000000L;
        
        // Send pulses with increasing timestamps
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, baseTime));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1010.0, baseTime + 50_000_000L));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1020.0, baseTime + 100_000_000L));
        
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 1005.0, baseTime + 95_000_000L));
        
        // Latest A should be 1020.0 (newest timestamp)
        TelemetryPulse latestA = service.getLatestPulse(TelemetryPulse.CRANE_A);
        assertEquals(1020.0, latestA.zAxisMm());
        
        // Aligned pair should use most recent from each
        AlignedTelemetryPair pair = service.getAlignedPair();
        assertNotNull(pair);
        assertEquals(1020.0, pair.pulseA().zAxisMm());
        assertEquals(1005.0, pair.pulseB().zAxisMm());
    }
}