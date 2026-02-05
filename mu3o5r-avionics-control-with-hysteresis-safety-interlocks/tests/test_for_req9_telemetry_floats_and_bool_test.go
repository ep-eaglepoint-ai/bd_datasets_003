package main

import (
	"firecontrol"
	"reflect"
	"testing"
)

func TestReq9TelemetryFloatsAndBool(t *testing.T) {
	telemetry := firecontrol.Telemetry{}
	telemetryType := reflect.TypeOf(telemetry)
	
	expectedFields := map[string]reflect.Type{
		"Altitude":         reflect.TypeOf(float64(0)),
		"RelativeHumidity": reflect.TypeOf(float64(0)),
		"Temperature":      reflect.TypeOf(float64(0)),
	}
	
	for fieldName, expectedType := range expectedFields {
		field, exists := telemetryType.FieldByName(fieldName)
		if !exists {
			t.Errorf("Telemetry struct should have field %s", fieldName)
		} else if field.Type != expectedType {
			t.Errorf("Telemetry field %s should be of type %v, got %v", fieldName, expectedType, field.Type)
		}
	}
	
	system := firecontrol.NewFireControlSystem()
	testTelemetry := firecontrol.Telemetry{
		Altitude:         5000.5,
		RelativeHumidity: 85.7,
		Temperature:      20.3,
	}
	
	result := system.Update(testTelemetry)
	if reflect.TypeOf(result) != reflect.TypeOf(true) {
		t.Errorf("Update() should return bool, got %v", reflect.TypeOf(result))
	}
}
