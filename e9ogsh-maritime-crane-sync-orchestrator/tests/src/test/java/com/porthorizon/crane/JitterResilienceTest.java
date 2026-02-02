package com.porthorizon.crane;

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
        if (service != null) {
            service.shutdown();
        }
    }
    
    @Test
    @DisplayName("Test 1: Detects 100ms delayed telemetry as stale")
    void test_1() {
        long baseTime = System.nanoTime();
        
        TelemetryPulse pulseB = new TelemetryPulse(TelemetryPulse.CRANE_B, 1000.0, baseTime);
        TelemetryPulse pulseA = new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, 
                                                    baseTime - 150_000_000L);
        
        service.ingestTelemetrySync(pulseB);
        service.ingestTelemetrySync(pulseA);
        
        assertTrue(service.isStaleDataDetected());
    }
    
    @Test
    @DisplayName("Test 2: Blocks MOVE commands when data is stale")
    void test_2() {
        long baseTime = System.nanoTime();
        
        service.start();
        
        TelemetryPulse pulseB = new TelemetryPulse(TelemetryPulse.CRANE_B, 1000.0, baseTime);
        TelemetryPulse pulseA = new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, 
                                                    baseTime - 150_000_000L);
        
        service.ingestTelemetrySync(pulseB);
        service.ingestTelemetrySync(pulseA);
        
        assertTrue(service.isStaleDataDetected());
        
        boolean result = service.executeCommand(Command.move(TelemetryPulse.CRANE_A, 100.0));
        assertFalse(result);
    }
    
    @Test
    @DisplayName("Test 3: Allows movement when synchronized telemetry is restored")
    void test_3() {
        long baseTime = System.nanoTime();
        
        service.start();
        
        TelemetryPulse staleA = new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, 
                                                    baseTime - 150_000_000L);
        TelemetryPulse pulseB = new TelemetryPulse(TelemetryPulse.CRANE_B, 1000.0, baseTime);
        
        service.ingestTelemetrySync(staleA);
        service.ingestTelemetrySync(pulseB);
        
        assertTrue(service.isStaleDataDetected());
        
        TelemetryPulse syncedA = new TelemetryPulse(TelemetryPulse.CRANE_A, 1010.0, baseTime + 50_000_000L);
        TelemetryPulse syncedB = new TelemetryPulse(TelemetryPulse.CRANE_B, 1010.0, baseTime + 50_000_000L);
        
        service.ingestTelemetrySync(syncedA);
        service.ingestTelemetrySync(syncedB);
        
        assertFalse(service.isStaleDataDetected());
        
        boolean result = service.executeCommand(Command.move(TelemetryPulse.CRANE_A, 100.0));
        assertTrue(result);
    }
    
    @Test
    @DisplayName("Test 4: Handles out-of-order telemetry correctly")
    void test_4() {
        long baseTime = System.nanoTime();
        
        TelemetryPulse newerA = new TelemetryPulse(TelemetryPulse.CRANE_A, 1050.0, baseTime + 50_000_000L);
        service.ingestTelemetrySync(newerA);
        
        TelemetryPulse olderA = new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, baseTime);
        service.ingestTelemetrySync(olderA);
        
        TelemetryPulse latest = service.getLatestPulse(TelemetryPulse.CRANE_A);
        assertEquals(1000.0, latest.zAxisMm());
    }
    
    @Test
    @DisplayName("Test 5: Correctly identifies well-aligned data")
    void test_5() {
        long baseTime = System.nanoTime();
        
        TelemetryPulse pulseA = new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, baseTime);
        TelemetryPulse pulseB = new TelemetryPulse(TelemetryPulse.CRANE_B, 1000.0, 
                                                    baseTime + 10_000_000L);
        
        service.ingestTelemetrySync(pulseA);
        service.ingestTelemetrySync(pulseB);
        
        assertFalse(service.isStaleDataDetected());
        
        AlignedTelemetryPair pair = service.getAlignedPair();
        assertNotNull(pair);
        assertTrue(pair.isWellAligned(TandemSyncService.MAX_ALIGNMENT_DELTA_NS));
    }
}