package main

import (
	"firecontrol"
	"testing"
)

func TestReq4SafetyAltitudeInterlock(t *testing.T) {
	system := firecontrol.NewFireControlSystem()
	
	// Test below 4000 feet - should not fire
	fired := system.Update(CreateTelemetry(3999, 100.0, 20))
	if fired {
		t.Errorf("System should not fire when altitude is below 4000 feet")
	}
	
	// Test various altitudes below 4000
	testAltitudes := []float64{0, 1000, 2000, 3000, 3999.9}
	for _, altitude := range testAltitudes {
		fired := system.Update(CreateTelemetry(altitude, 100.0, 20))
		if fired {
			t.Errorf("System should not fire at altitude %.1f feet", altitude)
		}
	}
	
	// Test at 4000 feet - should allow
	system.Update(CreateTelemetry(4000, 90.0, 20))
	
	// Test above 4000 feet - should allow
	system.Update(CreateTelemetry(5000, 90.0, 20))
}
