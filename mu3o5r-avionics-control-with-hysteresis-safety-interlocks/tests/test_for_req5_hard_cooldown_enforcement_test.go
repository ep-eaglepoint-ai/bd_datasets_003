package main

import (
	"firecontrol"
	"testing"
	"time"
)

func TestReq5HardCooldownEnforcement(t *testing.T) {
	system := firecontrol.NewFireControlSystem()
	telemetry := CreateTelemetry(5000, 90.0, 20)
	
	// First fire should succeed
	fired1 := system.Update(telemetry)
	if !fired1 {
		t.Errorf("First fire should succeed when conditions are met")
	}
	
	// Immediate attempts should fail
	for i := 0; i < 5; i++ {
		fired := system.Update(telemetry)
		if fired {
			t.Errorf("Fire attempt %d should fail during cooldown period", i+2)
		}
	}
	
	// Wait for cooldown
	time.Sleep(10 * time.Second)
	
	// Should fire again after cooldown
	fired2 := system.Update(telemetry)
	if !fired2 {
		t.Errorf("Fire should succeed after cooldown period expires")
	}
}
