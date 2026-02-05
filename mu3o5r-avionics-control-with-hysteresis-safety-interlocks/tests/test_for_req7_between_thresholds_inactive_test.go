package main

import (
	"firecontrol"
	"testing"
)

func TestReq7BetweenThresholdsInactive(t *testing.T) {
	system := firecontrol.NewFireControlSystem()
	
	// Start inactive with low humidity
	system.Update(CreateTelemetry(5000, 70.0, 20))
	
	// Raise to 80% - should stay inactive
	system.Update(CreateTelemetry(5000, 80.0, 20))
	
	// Test multiple updates at 80%
	for i := 0; i < 5; i++ {
		fired := system.Update(CreateTelemetry(5000, 80.0, 20))
		if fired {
			t.Errorf("System should remain inactive at 80%% humidity")
		}
	}
	
	// Test other values between thresholds
	betweenValues := []float64{76.0, 78.0, 80.0, 82.0, 84.0}
	for _, humidity := range betweenValues {
		fired := system.Update(CreateTelemetry(5000, humidity, 20))
		if fired {
			t.Errorf("System should remain inactive at %.1f%% humidity", humidity)
		}
	}
	
	// Boundary: 75.01% should stay inactive
	fired := system.Update(CreateTelemetry(5000, 75.01, 20))
	if fired {
		t.Errorf("System should remain inactive at 75.01%% humidity")
	}
	
	// Boundary: 84.99% should stay inactive
	fired = system.Update(CreateTelemetry(5000, 84.99, 20))
	if fired {
		t.Errorf("System should remain inactive at 84.99%% humidity")
	}
	
	// Should activate at 85%
	system.Update(CreateTelemetry(5000, 85.0, 20))
}
