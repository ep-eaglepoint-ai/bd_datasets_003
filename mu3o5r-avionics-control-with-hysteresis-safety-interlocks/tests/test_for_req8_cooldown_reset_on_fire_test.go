package main

import (
	"firecontrol"
	"testing"
	"time"
)

func TestReq8CooldownResetOnFire(t *testing.T) {
	system := firecontrol.NewFireControlSystem()
	
	firingTelemetry := CreateTelemetry(5000, 90.0, 20)
	noFireTelemetry := CreateTelemetry(3000, 90.0, 20)
	
	// First fire
	fired1 := system.Update(firingTelemetry)
	if !fired1 {
		t.Errorf("First fire should succeed")
	}
	
	time.Sleep(100 * time.Millisecond)
	
	// Failed fire attempt (altitude too low)
	fired2 := system.Update(noFireTelemetry)
	if fired2 {
		t.Errorf("Should not fire with low altitude")
	}
	
	time.Sleep(100 * time.Millisecond)
	
	// Multiple failed attempts
	for i := 0; i < 5; i++ {
		fired := system.Update(noFireTelemetry)
		if fired {
			t.Errorf("Fire attempt %d should fail", i+1)
		}
	}
	
	// Wait for cooldown
	time.Sleep(10 * time.Second)
	
	// Should fire successfully
	fired3 := system.Update(firingTelemetry)
	if !fired3 {
		t.Errorf("Should fire successfully after cooldown expires")
	}
}
