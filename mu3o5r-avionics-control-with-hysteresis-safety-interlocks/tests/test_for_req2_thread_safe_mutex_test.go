package main

import (
	"firecontrol"
	"reflect"
	"sync"
	"testing"
)

func TestReq2ThreadSafeMutex(t *testing.T) {
	system := firecontrol.NewFireControlSystem()
	systemType := reflect.TypeOf(*system)
	
	hasMutex := false
	for i := 0; i < systemType.NumField(); i++ {
		if systemType.Field(i).Type == reflect.TypeOf(sync.Mutex{}) {
			hasMutex = true
			break
		}
	}
	
	if !hasMutex {
		t.Errorf("FireControlSystem should contain a sync.Mutex field for thread safety")
	}
	
	telemetry := CreateTelemetry(5000, 90, 20)
	var wg sync.WaitGroup
	fireCount := 0
	var countMutex sync.Mutex
	
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				if system.Update(telemetry) {
					countMutex.Lock()
					fireCount++
					countMutex.Unlock()
				}
			}
		}()
	}
	
	wg.Wait()
	
	if fireCount > 5 {
		t.Errorf("Too many fires detected (%d), mutex protection may not be working properly", fireCount)
	}
}
