package main

import (
	"firecontrol"
	"testing"
)

func TestReq3HysteresisExplicitEpsilonHandling(t *testing.T) {
	system := firecontrol.NewFireControlSystem()
	
	// Test engagement at 85%
	system.Update(CreateTelemetry(5000, 85.0, 20))
	system.Update(CreateTelemetry(5000, 90.0, 20))
	fired := system.Update(CreateTelemetry(5000, 80.0, 20))
	if fired {
		t.Errorf("Should not fire immediately due to cooldown, but system should be active")
	}
	
	// Test disengagement at 75%
	system.Update(CreateTelemetry(5000, 75.0, 20))
	system.Update(CreateTelemetry(5000, 70.0, 20))
	
	// Test state preservation: inactive at 80%
	system.Update(CreateTelemetry(5000, 80.0, 20))
	fired = system.Update(CreateTelemetry(5000, 80.0, 20))
	if fired {
		t.Errorf("System should remain inactive at 80%% when previously inactive")
	}
	
	// Re-engage and test state preservation: active at 80%
	system.Update(CreateTelemetry(5000, 85.0, 20))
	system.Update(CreateTelemetry(5000, 80.0, 20))
	
	// Test boundary: 84.99% should not engage from inactive
	system2 := firecontrol.NewFireControlSystem()
	system2.Update(CreateTelemetry(5000, 84.99, 20))
	fired = system2.Update(CreateTelemetry(5000, 84.99, 20))
	if fired {
		t.Errorf("System should not engage at 84.99%% humidity")
	}
}
