package com.porthorizon.crane;

import org.junit.jupiter.api.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Comprehensive tests for TandemSyncService.
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
        if (service != null) {
            service.shutdown();
        }
    }
    
    @Test
    @DisplayName("Test 1: Aligns telemetry from both cranes correctly")
    void test_1() {
        long baseTime = System.nanoTime();
        
        TelemetryPulse pulseA = new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, baseTime);
        TelemetryPulse pulseB = new TelemetryPulse(TelemetryPulse.CRANE_B, 1000.0, baseTime + 1000);
        
        service.ingestTelemetrySync(pulseA);
        service.ingestTelemetrySync(pulseB);
        
        AlignedTelemetryPair pair = service.getAlignedPair();
        assertNotNull(pair);
        assertTrue(pair.isWellAligned(TandemSyncService.MAX_ALIGNMENT_DELTA_NS));
    }
    
    @Test
    @DisplayName("Test 2: Detects stale data when timestamps differ too much")
    void test_2() {
        long baseTime = System.nanoTime();
        
        // 200ms difference - exceeds 100ms threshold
        TelemetryPulse pulseA = new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, baseTime);
        TelemetryPulse pulseB = new TelemetryPulse(TelemetryPulse.CRANE_B, 1000.0, 
                                                    baseTime + 200_000_000L);
        
        service.ingestTelemetrySync(pulseA);
        service.ingestTelemetrySync(pulseB);
        
        assertTrue(service.isStaleDataDetected());
    }
    
    @Test
    @DisplayName("Test 3: Uses most recent pulses for alignment")
    void test_3() {
        long baseTime = System.nanoTime();
        
        // Send old pulse
        TelemetryPulse oldPulseA = new TelemetryPulse(TelemetryPulse.CRANE_A, 500.0, baseTime);
        service.ingestTelemetrySync(oldPulseA);
        
        // Send newer pulse
        TelemetryPulse newPulseA = new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, 
                                                      baseTime + 50_000_000L);
        service.ingestTelemetrySync(newPulseA);
        
        TelemetryPulse latest = service.getLatestPulse(TelemetryPulse.CRANE_A);
        assertEquals(1000.0, latest.zAxisMm());
    }
}