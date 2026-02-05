package main

import (
	"firecontrol"
	"testing"
)

func TestReq6BetweenThresholdsActive(t *testing.T) {
	system := firecontrol.NewFireControlSystem()
	
	// Activate with high humidity
	system.Update(CreateTelemetry(5000, 90.0, 20))
	
	// Drop to 80% - should stay active
	system.Update(CreateTelemetry(5000, 80.0, 20))
	
	// Test multiple updates at 80%
	for i := 0; i < 5; i++ {
		system.Update(CreateTelemetry(5000, 80.0, 20))
	}
	
	// Test other values between thresholds
	betweenValues := []float64{76.0, 78.0, 80.0, 82.0, 84.0}
	for _, humidity := range betweenValues {
		system.Update(CreateTelemetry(5000, humidity, 20))
	}
	
	// Boundary: 75.01% should keep active
	system.Update(CreateTelemetry(5000, 75.01, 20))
	
	// Boundary: 84.99% should keep active
	system.Update(CreateTelemetry(5000, 84.99, 20))
}
