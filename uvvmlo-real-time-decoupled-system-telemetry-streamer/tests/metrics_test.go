package tests

import (
	"encoding/json"
	"testing"
	"time"

	"telemetry-streamer/pkg/metrics"
)

func TestMetricsCollector(t *testing.T) {
	collector := metrics.NewCollector(100 * time.Millisecond)

	m := collector.Collect()

	if m.Timestamp == 0 {
		t.Error("Timestamp should not be zero")
	}

	if m.NumGoroutines <= 0 {
		t.Error("NumGoroutines should be positive")
	}

	// Verify JSON serialization works
	data, err := json.Marshal(m)
	if err != nil {
		t.Errorf("Failed to marshal metrics: %v", err)
	}

	if len(data) == 0 {
		t.Error("Marshaled data should not be empty")
	}

	t.Logf("Collected metrics: %s", string(data))
}

func TestMetricsCollectorBroadcast(t *testing.T) {
	collector := metrics.NewCollector(50 * time.Millisecond)
	
	received := make(chan []byte, 10)
	
	go collector.Start(func(data []byte) {
		select {
		case received <- data:
		default:
		}
	})

	// Wait for at least one broadcast
	select {
	case data := <-received:
		var m metrics.SystemMetrics
		if err := json.Unmarshal(data, &m); err != nil {
			t.Errorf("Failed to unmarshal metrics: %v", err)
		}
		if m.Timestamp == 0 {
			t.Error("Received metrics should have valid timestamp")
		}
	case <-time.After(500 * time.Millisecond):
		t.Error("Did not receive metrics within timeout")
	}

	collector.Stop()
}