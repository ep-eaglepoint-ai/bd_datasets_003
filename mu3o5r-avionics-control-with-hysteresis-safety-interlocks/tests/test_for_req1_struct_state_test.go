package main

import (
	"firecontrol"
	"reflect"
	"testing"
	"time"
)

func TestReq1StructState(t *testing.T) {
	system := firecontrol.NewFireControlSystem()
	systemType := reflect.TypeOf(*system)
	
	requiredFields := map[string]reflect.Type{
		"lastFireTime":  reflect.TypeOf(time.Time{}),
		"active":        reflect.TypeOf(true),
		"cooldownPeriod": reflect.TypeOf(time.Duration(0)),
	}
	
	for fieldName, expectedType := range requiredFields {
		field, found := systemType.FieldByName(fieldName)
		if !found {
			t.Errorf("Required field %s not found in FireControlSystem struct", fieldName)
		} else if field.Type != expectedType {
			t.Errorf("Field %s should be of type %v, got %v", fieldName, expectedType, field.Type)
		}
	}
}
