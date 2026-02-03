package com.porthorizon.crane;

import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Drift Simulation Tests - Requirement 6
 * Verifies HALT is triggered at exactly 5 seconds with 100mm/s vs 80mm/s drift.
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
        if (service != null) service.shutdown();
    }
    
    @Test
    @DisplayName("Test 1: HALT triggered at 5 seconds with 100mm/s vs 80mm/s drift")
    void test_1() {
        service.start();
        
        // Simulate synchronized pulses every 50ms
        // At 100mm/s vs 80mm/s, delta increases by 1mm per 50ms pulse
        // delta > 100mm triggers FAULT (threshold is strictly >100, not >=100)
        
        // At t=4.9s: A=490mm, B=392mm, delta=98mm - NO FAULT
        sendBothPulses(4_900_000_000L, 490.0, 392.0);
        assertEquals(LiftState.LIFTING, service.getState(), 
            "At t=4.9s, delta=98mm should NOT fault");
        
        // At t=5.0s: A=500mm, B=400mm, delta=100mm exactly - NO FAULT (>100 not >=100)
        sendBothPulses(5_000_000_000L, 500.0, 400.0);
        assertEquals(LiftState.LIFTING, service.getState(), 
            "At t=5.0s, delta=100mm exactly should NOT fault");
        assertEquals(100.0, service.calculateTiltDelta(), 0.01);
        
        // At t=5.05s: A=505mm, B=404mm, delta=101mm - FAULT!
        sendBothPulses(5_050_000_000L, 505.0, 404.0);
        assertEquals(LiftState.FAULT, service.getState(), 
            "At t=5.05s, delta=101mm should trigger fault");
        
        // Verify HALT_ALL sent to both controllers
        assertTrue(controllerA.hasReceivedHaltAll(), "Crane-A should receive HALT_ALL");
        assertTrue(controllerB.hasReceivedHaltAll(), "Crane-B should receive HALT_ALL");
    }
    
    @Test
    @DisplayName("Test 2: No HALT before threshold is reached")
    void test_2() {
        service.start();
        
        // At t=4.0s: A=400mm, B=320mm, delta=80mm
        sendBothPulses(4_000_000_000L, 400.0, 320.0);
        
        assertEquals(LiftState.LIFTING, service.getState(), 
            "At 4 seconds, system should still be LIFTING");
        assertEquals(80.0, service.calculateTiltDelta(), 0.1, 
            "Delta should be 80mm at 4 seconds");
    }
    
    @Test
    @DisplayName("Test 3: Verifies exact threshold boundary")
    void test_3() {
        service.start();
        
        // 100mm exactly - should NOT fault
        sendBothPulses(1_000_000_000L, 1000.0, 1100.0);
        assertEquals(LiftState.LIFTING, service.getState(), 
            "100mm exactly should NOT trigger fault");
        
        // 100.1mm - should FAULT
        sendBothPulses(1_050_000_000L, 1000.0, 1100.1);
        assertEquals(LiftState.FAULT, service.getState(), 
            ">100mm should trigger fault");
        
        assertTrue(controllerA.hasReceivedHaltAll());
        assertTrue(controllerB.hasReceivedHaltAll());
    }
    
    /**
     * Sends synchronized pulses for both cranes with the SAME timestamp.
     * This ensures both updates are applied before safety evaluation triggers fault.
     */
    private void sendBothPulses(long timestampNs, double posA, double posB) {
        // Send both pulses with same timestamp - order matters!
        // Send the one that WON'T trigger evaluation to a fault state first
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_B, posB, timestampNs));
        service.ingestTelemetrySync(new TelemetryPulse(TelemetryPulse.CRANE_A, posA, timestampNs));
    }
}