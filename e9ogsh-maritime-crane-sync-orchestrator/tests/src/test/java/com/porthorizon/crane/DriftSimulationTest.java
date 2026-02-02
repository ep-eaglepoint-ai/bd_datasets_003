package com.porthorizon.crane;

import org.junit.jupiter.api.*;
import java.util.concurrent.atomic.*;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Drift Simulation Tests - Requirement 6
 * Tests that HALT is triggered at the right moment when cranes drift apart.
 */
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
        if (service != null) {
            service.shutdown();
        }
    }
    
    @Test
    @DisplayName("Test 1: HALT triggered around 5 seconds with 100mm/s vs 80mm/s drift")
    void test_1() {
        service.start();
        
        double velocityA = 100.0; // mm/s
        double velocityB = 80.0;  // mm/s
        int pulseIntervalMs = 50;
        double pulseIntervalS = pulseIntervalMs / 1000.0;
        
        double positionA = 0.0;
        double positionB = 0.0;
        int pulseCount = 0;
        double lastDelta = 0.0;
        
        while (service.getState() != LiftState.FAULT && pulseCount < 200) {
            long timestamp = System.nanoTime();
            
            positionA += velocityA * pulseIntervalS;
            positionB += velocityB * pulseIntervalS;
            lastDelta = Math.abs(positionA - positionB);
            
            TelemetryPulse pulseA = new TelemetryPulse(TelemetryPulse.CRANE_A, positionA, timestamp);
            TelemetryPulse pulseB = new TelemetryPulse(TelemetryPulse.CRANE_B, positionB, timestamp);
            
            service.ingestTelemetrySync(pulseA);
            service.ingestTelemetrySync(pulseB);
            
            pulseCount++;
        }
        
        // Verify fault occurred
        assertEquals(LiftState.FAULT, service.getState(), 
            "System should be in FAULT state after threshold exceeded");
        
        // Verify HALT commands were sent
        assertTrue(controllerA.hasReceivedHalt(), "Crane-A should receive HALT");
        assertTrue(controllerB.hasReceivedHalt(), "Crane-B should receive HALT");
        
        // Allow tolerance for timing variations
        int expectedMinPulse = 95;
        int expectedMaxPulse = 115;
        
        assertTrue(pulseCount >= expectedMinPulse && pulseCount <= expectedMaxPulse,
            String.format("Fault should occur between pulse %d and %d, but occurred at pulse %d (delta=%.1fmm)", 
                         expectedMinPulse, expectedMaxPulse, pulseCount, lastDelta));
    }
    
    @Test
    @DisplayName("Test 2: No HALT before threshold is reached")
    void test_2() {
        service.start();
        
        double velocityA = 100.0;
        double velocityB = 80.0;
        int pulseIntervalMs = 50;
        double pulseIntervalS = pulseIntervalMs / 1000.0;
        
        double positionA = 0.0;
        double positionB = 0.0;
        
        // Simulate 4 seconds (80 pulses) - should stay within threshold
        for (int i = 0; i < 80; i++) {
            long timestamp = System.nanoTime();
            
            positionA += velocityA * pulseIntervalS;
            positionB += velocityB * pulseIntervalS;
            
            TelemetryPulse pulseA = new TelemetryPulse(TelemetryPulse.CRANE_A, positionA, timestamp);
            TelemetryPulse pulseB = new TelemetryPulse(TelemetryPulse.CRANE_B, positionB, timestamp);
            
            service.ingestTelemetrySync(pulseA);
            service.ingestTelemetrySync(pulseB);
        }
        
        assertEquals(LiftState.LIFTING, service.getState(), 
            "System should still be LIFTING when under threshold");
        assertTrue(service.calculateTiltDelta() <= 100.0, 
            "Tilt delta should be <= 100mm");
    }
    
    @Test
    @DisplayName("Test 3: Verifies exact threshold boundary")
    void test_3() {
        service.start();
        
        long timestamp = System.nanoTime();
        
        // Exactly at threshold (100mm difference) - should NOT fault
        TelemetryPulse pulseA1 = new TelemetryPulse(TelemetryPulse.CRANE_A, 1000.0, timestamp);
        TelemetryPulse pulseB1 = new TelemetryPulse(TelemetryPulse.CRANE_B, 1100.0, timestamp);
        
        service.ingestTelemetrySync(pulseA1);
        service.ingestTelemetrySync(pulseB1);
        
        assertEquals(LiftState.LIFTING, service.getState(), 
            "System should still be LIFTING at exactly 100mm threshold");
        
        // Now exceed by 1mm - should fault
        TelemetryPulse pulseB2 = new TelemetryPulse(TelemetryPulse.CRANE_B, 1101.0, timestamp + 1000);
        service.ingestTelemetrySync(pulseB2);
        
        assertEquals(LiftState.FAULT, service.getState(), 
            "System should FAULT when threshold exceeded (> 100mm)");
        assertTrue(controllerA.hasReceivedHalt(), "Crane-A should receive HALT on fault");
        assertTrue(controllerB.hasReceivedHalt(), "Crane-B should receive HALT on fault");
    }
}
