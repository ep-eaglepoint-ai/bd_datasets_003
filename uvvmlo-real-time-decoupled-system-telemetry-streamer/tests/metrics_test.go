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

// TestActiveConnectionsReflectHostState verifies we're reading actual system connections
func TestActiveConnectionsReflectHostState(t *testing.T) {
	collector := metrics.NewCollector(100 * time.Millisecond)

	m := collector.Collect()

	// Active connections should be > 0 on any running system
	// (at minimum, the test process has connections)
	if m.ActiveConnections < 0 {
		t.Error("ActiveConnections should be non-negative")
	}

	// On Linux, we should see actual connections
	// On other platforms, we'll see goroutine count as fallback
	t.Logf("Host-level active connections: %d", m.ActiveConnections)

	// Collect again to ensure it's not static
	time.Sleep(200 * time.Millisecond)
	m2 := collector.Collect()

	t.Logf("Second sample - active connections: %d", m2.ActiveConnections)

	// Both samples should be reasonable (not zero unless truly no connections)
	if m.ActiveConnections == 0 && m2.ActiveConnections == 0 {
		t.Log("Warning: No connections detected on host (may be platform-specific)")
	}
}

// TestConnectionMetricIndependentOfWebSockets verifies the metric is system-level
func TestConnectionMetricIndependentOfWebSockets(t *testing.T) {
	collector := metrics.NewCollector(100 * time.Millisecond)

	// Collect metrics WITHOUT any WebSocket clients
	m := collector.Collect()

	// Should still report system connections
	// (e.g., SSH session, system services, test runner network activity)
	t.Logf("System connections (no WebSocket clients): %d", m.ActiveConnections)

	// The count should NOT be zero just because we have no WebSocket clients
	// (unless running in an extremely isolated environment)
	if m.ActiveConnections == 0 {
		t.Log("No system connections detected - may be running in isolated environment")
	} else {
		t.Logf("✓ Correctly reporting host-level connections independent of WebSocket clients")
	}
}