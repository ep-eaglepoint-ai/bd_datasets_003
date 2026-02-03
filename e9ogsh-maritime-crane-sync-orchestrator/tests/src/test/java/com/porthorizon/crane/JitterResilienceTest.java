package com.porthorizon.crane;

import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Jitter Resilience Tests - Requirement 7
 * Tests handling of 100ms delayed telemetry data.
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
    @DisplayName("Test 1: Detects 100ms+ delayed telemetry as stale")
    void test_1() {
        long baseTime = 1000000000L;
        
        // Crane-B is on time
        TelemetryPulse pulseB = new TelemetryPulse(TelemetryPulse.CRANE_B, 1000.0, baseTime);
        
        // Crane-A is delayed by just over 100ms (exceeds MAX_ALIGNMENT_DELTA_NS)
        TelemetryPulse pulseA = new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, 
            baseTime - 100_000_001L); // 100ms + 1ns delay
        
        service.ingestTelemetrySync(pulseB);
        service.ingestTelemetrySync(pulseA);
        
        assertTrue(service.isStaleDataDetected(), 
            "100ms+ timestamp gap should be detected as stale");
    }
    
    @Test
    @DisplayName("Test 2: Blocks MOVE commands when data is stale")
    void test_2() {
        long baseTime = 1000000000L;
        service.start();
        
        // Create stale condition with 100ms+ delay
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 1000.0, baseTime));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, 
            baseTime - 100_000_001L));
        
        assertTrue(service.isStaleDataDetected());
        
        // Movement should be blocked
        boolean result = service.executeCommand(Command.move(TelemetryPulse.CRANE_A, 100.0));
        assertFalse(result, "MOVE should be blocked when data is stale");
    }
    
    @Test
    @DisplayName("Test 3: Allows movement when synchronized telemetry is restored")
    void test_3() {
        long baseTime = 1000000000L;
        service.start();
        
        // First: stale data
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, baseTime - 100_000_001L));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 1000.0, baseTime));
        assertTrue(service.isStaleDataDetected());
        
        // Now: synchronized data (within 100ms)
        long syncTime = baseTime + 200_000_000L;
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1010.0, syncTime));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 1010.0, syncTime + 10_000_000L));
        
        assertFalse(service.isStaleDataDetected(), "Stale flag should clear when synchronized");
        assertTrue(service.executeCommand(Command.move(TelemetryPulse.CRANE_A, 100.0)));
    }
    
    @Test
    @DisplayName("Test 4: Handles out-of-order telemetry - keeps newest by timestamp")
    void test_4() {
        long baseTime = 1000000000L;
        
        // Send newer pulse first
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1050.0, baseTime + 50_000_000L));
        
        // Send older pulse later (out of order arrival)
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, baseTime));
        
        // Should keep the NEWER pulse by timestamp, not the last arrived
        TelemetryPulse latest = service.getLatestPulse(TelemetryPulse.CRANE_A);
        assertEquals(1050.0, latest.zAxisMm(), 
            "Should keep pulse with newer timestamp, not last arrived");
    }
    
    @Test
    @DisplayName("Test 5: Data within 100ms is NOT marked as stale")
    void test_5() {
        long baseTime = 1000000000L;
        
        // Within 100ms alignment (99ms gap)
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, baseTime));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, 1000.0, baseTime + 99_000_000L));
        
        assertFalse(service.isStaleDataDetected(), "99ms gap should NOT be marked stale");
        
        AlignedTelemetryPair pair = service.getAlignedPair();
        assertNotNull(pair);
        assertTrue(pair.isWellAligned(TandemSyncService.MAX_ALIGNMENT_DELTA_NS));
    }
}