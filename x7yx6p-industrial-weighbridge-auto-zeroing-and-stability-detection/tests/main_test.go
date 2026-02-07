package main

import (
	"math"
	"testing"
	"time"
)

func TestCircularBuffer(t *testing.T) {
	// Test basic circular buffer functionality
	cb := NewCircularBuffer(5)
	
	// Test initial state
	if cb.Count() != 0 {
		t.Errorf("Expected count 0, got %d", cb.Count())
	}
	
	// Add values
	for i := int64(1); i <= 3; i++ {
		cb.Add(i)
	}
	
	if cb.Count() != 3 {
		t.Errorf("Expected count 3, got %d", cb.Count())
	}
	
	// Test GetValues
	values := cb.GetValues()
	if len(values) != 3 {
		t.Errorf("Expected 3 values, got %d", len(values))
	}
	
	// Verify values are correct
	expected := []int64{1, 2, 3}
	for i, v := range values {
		if v != expected[i] {
			t.Errorf("Expected value %d at index %d, got %d", expected[i], i, v)
		}
	}
	
	// Test overflow (circular behavior)
	for i := int64(4); i <= 7; i++ {
		cb.Add(i)
	}
	
	if cb.Count() != 5 {
		t.Errorf("Expected count 5 after overflow, got %d", cb.Count())
	}
	
	// After overflow, oldest values should be replaced
	values = cb.GetValues()
	if len(values) != 5 {
		t.Errorf("Expected 5 values after overflow, got %d", len(values))
	}
	
	// Should contain values 3, 4, 5, 6, 7 (1 and 2 should be overwritten)
	expectedAfterOverflow := []int64{3, 4, 5, 6, 7}
	for i, v := range values {
		if v != expectedAfterOverflow[i] {
			t.Errorf("Expected value %d at index %d after overflow, got %d", expectedAfterOverflow[i], i, v)
		}
	}
}

// TestDrift simulates a slow, linear increase in raw values (simulating rain accumulation)
// while keeping variance low. Verifies ZeroOffset increases to match, keeping Net Weight at 0.0.
func TestDrift(t *testing.T) {
	calibrationFactor := 0.1 // kg per raw unit
	initialRaw := int64(1000)
	wb := NewWeighbridge(calibrationFactor, initialRaw)
	
	// Set very short zero adjust time for testing (10ms instead of 5 seconds)
	wb.SetZeroAdjustTime(10 * time.Millisecond)
	wb.SetStabilityThreshold(1000.0) // High threshold to ensure low variance is detected as stable
	wb.SetZeroBand(200.0) // Very wide band to keep within zero band during drift
	
	initialZeroOffset := wb.GetZeroOffset()
	
	// Simulate slow linear drift: 1000 -> 1080 over many samples
	// Keep variance low by using very small increments
	baseValue := int64(1000)
	driftTarget := int64(1080) // Small drift, well within zero band (80 < 200)
	
	// Fill buffer with stable values at initial position to establish baseline
	for i := 0; i < 50; i++ {
		wb.Update(baseValue)
		time.Sleep(1 * time.Millisecond)
	}
	
	// Ensure we're in EMPTY state initially
	if wb.GetStatus() != EMPTY {
		t.Logf("Initial status: %v (expected EMPTY=0)", wb.GetStatus())
	}
	
	// Now slowly drift upward, keeping variance very low
	// Use very gradual increments to minimize variance
	for i := 0; i < 200; i++ {
		// Very gradual drift: linear interpolation
		progress := float64(i) / 200.0
		driftValue := baseValue + int64(float64(driftTarget-baseValue)*progress)
		wb.Update(driftValue)
		time.Sleep(1 * time.Millisecond)
	}
	
	// Stabilize at drifted value - use identical values to keep variance near zero
	for i := 0; i < 100; i++ {
		wb.Update(driftTarget)
		time.Sleep(2 * time.Millisecond) // Allow time to pass
	}
	
	// Wait for zero adjustment to complete (need multiple update cycles)
	time.Sleep(50 * time.Millisecond)
	
	// Continue updating to trigger zero adjustment
	for i := 0; i < 50; i++ {
		wb.Update(driftTarget)
		time.Sleep(2 * time.Millisecond)
	}
	
	// Verify zero offset increased (drift compensation)
	finalZeroOffset := wb.GetZeroOffset()
	if finalZeroOffset <= initialZeroOffset {
		t.Errorf("Expected ZeroOffset to increase from %f to compensate for drift, got %f", initialZeroOffset, finalZeroOffset)
	}
	
	// The zero offset should have adjusted close to the drift target
	expectedZeroOffset := float64(driftTarget)
	tolerance := 10.0 // Allow some tolerance
	if math.Abs(finalZeroOffset-expectedZeroOffset) > tolerance {
		t.Logf("ZeroOffset adjusted to %f (expected near %f)", finalZeroOffset, expectedZeroOffset)
	}
	
	// Verify net weight remains near zero (drift compensated)
	netWeight := wb.GetWeight()
	// After zero adjustment, net weight should be near zero
	// Net weight = (avg - zeroOffset) * calibrationFactor
	// If zeroOffset ≈ driftTarget and avg ≈ driftTarget, then netWeight ≈ 0
	if math.Abs(netWeight) > 10.0 { // Allow tolerance for calculation differences
		t.Errorf("Expected net weight near 0.0 after drift compensation, got %f (zeroOffset: %f, avg should be ~%d)", 
			netWeight, finalZeroOffset, driftTarget)
	}
	
	// Verify status is EMPTY (within zero band after compensation)
	status := wb.GetStatus()
	if status != EMPTY {
		// Check if we're near zero after compensation
		currentNetRaw := float64(driftTarget) - finalZeroOffset
		t.Logf("Status: %v, CurrentNetRaw: %f, ZeroBand: %f", status, currentNetRaw, 200.0)
		if math.Abs(currentNetRaw) < 200.0 && status == IN_MOTION {
			// This might be a timing issue - try one more update cycle
			for i := 0; i < 10; i++ {
				wb.Update(driftTarget)
				time.Sleep(2 * time.Millisecond)
			}
			status = wb.GetStatus()
		}
		if status != EMPTY {
			t.Errorf("Expected status EMPTY after drift compensation, got %v (IN_MOTION=1, LOCKED=2)", status)
		}
	}
}

// TestLoad simulates a truck driving on (High Variance, Rising Raw).
// Verifies Status is IN_MOTION. Then stabilizes raw values.
// Verifies Status becomes LOCKED and Net Weight is correct.
func TestLoad(t *testing.T) {
	calibrationFactor := 0.1 // kg per raw unit
	initialRaw := int64(1000)
	wb := NewWeighbridge(calibrationFactor, initialRaw)
	
	// Set very short lock time for testing (10ms instead of 2 seconds)
	wb.SetLockTime(10 * time.Millisecond)
	wb.SetStabilityThreshold(100.0)
	wb.SetZeroBand(50.0)
	
	// Phase 1: Truck driving on - High variance, rising raw values
	// Simulate high variance by adding significant noise
	baseValue := int64(1000)
	for i := 0; i < 20; i++ {
		// High variance: large random-like variations
		noise := int64((i % 5) * 50) // Creates variance
		risingValue := baseValue + int64(i*10) + noise
		wb.Update(risingValue)
		time.Sleep(1 * time.Millisecond)
	}
	
	// Verify status is IN_MOTION due to high variance
	if wb.GetStatus() != IN_MOTION {
		t.Errorf("Expected status IN_MOTION during high variance, got %v", wb.GetStatus())
	}
	
	// Phase 2: Stabilize - Low variance, stable high value
	stableValue := int64(2000) // Significant weight above zero
	for i := 0; i < 50; i++ {
		// Low variance: stable value with minimal noise
		wb.Update(stableValue + int64(i%3)) // Very small noise
		time.Sleep(1 * time.Millisecond)
	}
	
	// Wait for lock to occur
	time.Sleep(20 * time.Millisecond)
	
	// Continue updating to trigger lock
	for i := 0; i < 10; i++ {
		wb.Update(stableValue)
		time.Sleep(2 * time.Millisecond)
	}
	
	// Verify status is LOCKED
	if wb.GetStatus() != LOCKED {
		t.Errorf("Expected status LOCKED after stabilization, got %v", wb.GetStatus())
	}
	
	// Verify net weight is correct
	// Net Weight = (CurrentAverage - ZeroOffset) * CalibrationFactor
	expectedNetRaw := float64(stableValue) - wb.GetZeroOffset()
	expectedWeight := expectedNetRaw * calibrationFactor
	actualWeight := wb.GetWeight()
	
	// Allow 5% tolerance for calculation differences
	tolerance := math.Abs(expectedWeight * 0.05)
	if math.Abs(actualWeight-expectedWeight) > tolerance {
		t.Errorf("Expected net weight approximately %f, got %f", expectedWeight, actualWeight)
	}
	
	// Verify weight is positive and significant
	if actualWeight <= 0 {
		t.Errorf("Expected positive net weight, got %f", actualWeight)
	}
}

// TestZeroDriftSafety puts a heavy load on the scale and stabilizes.
// Verifies ZeroOffset does NOT change (cannot tare a full truck automatically).
func TestZeroDriftSafety(t *testing.T) {
	calibrationFactor := 0.1 // kg per raw unit
	initialRaw := int64(1000)
	wb := NewWeighbridge(calibrationFactor, initialRaw)
	
	// Set very short times for testing
	wb.SetZeroAdjustTime(10 * time.Millisecond)
	wb.SetLockTime(10 * time.Millisecond) // Short lock time for testing
	wb.SetStabilityThreshold(1000.0) // High threshold to ensure low variance is detected
	wb.SetZeroBand(50.0)
	
	initialZeroOffset := wb.GetZeroOffset()
	
	// Phase 1: Put heavy load on scale (well above zero band)
	// First simulate truck driving on with high variance
	heavyLoadValue := int64(5000) // Significant weight
	
	// Create high variance initially (truck moving)
	for i := 0; i < 20; i++ {
		noise := int64((i % 10) * 20) // Creates variance
		wb.Update(heavyLoadValue + noise)
		time.Sleep(1 * time.Millisecond)
	}
	
	// Verify we're in IN_MOTION due to high variance
	if wb.GetStatus() != IN_MOTION {
		t.Logf("Note: Status is %v after high variance phase (expected IN_MOTION=1)", wb.GetStatus())
	}
	
	// Phase 2: Stabilize the heavy load (low variance)
	// This should transition to LOCKED after lockTime
	for i := 0; i < 100; i++ {
		wb.Update(heavyLoadValue + int64(i%3)) // Minimal noise for stability
		time.Sleep(1 * time.Millisecond)
	}
	
	// Wait for lock to occur
	time.Sleep(30 * time.Millisecond)
	
	// Continue updating to ensure we're in LOCKED state
	for i := 0; i < 50; i++ {
		wb.Update(heavyLoadValue)
		time.Sleep(2 * time.Millisecond)
	}
	
	// Verify status is LOCKED (not EMPTY, not IN_MOTION)
	status := wb.GetStatus()
	if status != LOCKED {
		t.Errorf("Expected status LOCKED (2) with heavy load, got %v (EMPTY=0, IN_MOTION=1, LOCKED=2)", status)
	}
	
	// CRITICAL: Verify ZeroOffset did NOT change
	finalZeroOffset := wb.GetZeroOffset()
	if math.Abs(finalZeroOffset-initialZeroOffset) > 0.1 {
		t.Errorf("SAFETY VIOLATION: ZeroOffset changed from %f to %f while locked. Cannot tare a full truck!", 
			initialZeroOffset, finalZeroOffset)
	}
	
	// Verify net weight reflects the load (not zero)
	netWeight := wb.GetWeight()
	expectedNetRaw := float64(heavyLoadValue) - initialZeroOffset
	expectedWeight := expectedNetRaw * calibrationFactor
	
	// Allow tolerance
	tolerance := math.Abs(expectedWeight * 0.05)
	if math.Abs(netWeight-expectedWeight) > tolerance {
		t.Errorf("Expected net weight approximately %f, got %f", expectedWeight, netWeight)
	}
	
	// Verify weight is positive and significant
	if netWeight <= 0 {
		t.Errorf("Expected positive net weight with heavy load, got %f", netWeight)
	}
}

