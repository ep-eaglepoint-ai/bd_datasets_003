package geoip_enrichment_test

import (
	"log/slog"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/geoip"
	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/types"
)

func setupLogger() *slog.Logger {
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelError, // Reduce test noise
	}))
}

func TestMockEnricher(t *testing.T) {
	enricher := geoip.NewMockEnricher(10 * time.Microsecond)

	logEntry := &types.LogEntry{
		Timestamp:  time.Now().Unix(),
		CustomerID: "tenant-001",
		StatusCode: 200,
		BytesSent:  1024,
		IP:         "8.8.8.8",
	}

	err := enricher.Enrich(logEntry)
	if err != nil {
		t.Fatalf("Mock enrichment failed: %v", err)
	}

	if logEntry.GeoIP == nil {
		t.Error("Expected GeoIP data to be populated")
	}

	// Verify enrichment result structure
	if geoData, ok := logEntry.GeoIP.(*geoip.EnrichmentResult); ok {
		if geoData.Country == "" {
			t.Error("Expected country to be populated")
		}
		if geoData.CountryCode == "" {
			t.Error("Expected country code to be populated")
		}
	} else {
		t.Error("Expected GeoIP data to be EnrichmentResult type")
	}
}

func TestMockEnricherError(t *testing.T) {
	enricher := geoip.NewMockEnricher(1 * time.Microsecond)
	enricher.SetShouldError(true)

	logEntry := &types.LogEntry{
		Timestamp:  time.Now().Unix(),
		CustomerID: "tenant-001",
		StatusCode: 200,
		BytesSent:  1024,
		IP:         "8.8.8.8",
	}

	err := enricher.Enrich(logEntry)
	if err == nil {
		t.Error("Expected enrichment error but got none")
	}

	// Reset error state
	enricher.SetShouldError(false)

	err = enricher.Enrich(logEntry)
	if err != nil {
		t.Errorf("Expected successful enrichment after reset: %v", err)
	}
}

func TestMockEnricherMetrics(t *testing.T) {
	enricher := geoip.NewMockEnricher(5 * time.Microsecond)

	// Process some entries
	for i := 0; i < 5; i++ {
		logEntry := &types.LogEntry{
			Timestamp:  time.Now().Unix(),
			CustomerID: "tenant-001",
			StatusCode: 200,
			BytesSent:  1024,
			IP:         "8.8.8.8",
		}
		enricher.Enrich(logEntry)
	}

	// Process some errors
	enricher.SetShouldError(true)
	for i := 0; i < 2; i++ {
		logEntry := &types.LogEntry{
			Timestamp:  time.Now().Unix(),
			CustomerID: "tenant-001",
			StatusCode: 200,
			BytesSent:  1024,
			IP:         "8.8.8.8",
		}
		enricher.Enrich(logEntry)
	}

	metrics := enricher.GetMetrics()

	if metrics["total_enrichments"] != int64(5) {
		t.Errorf("Expected 5 successful enrichments, got %v", metrics["total_enrichments"])
	}

	if metrics["total_errors"] != int64(2) {
		t.Errorf("Expected 2 errors, got %v", metrics["total_errors"])
	}

	if metrics["mock"] != true {
		t.Error("Expected mock flag to be true")
	}
}

func TestEnricherPrivateIPs(t *testing.T) {
	enricher := geoip.NewMockEnricher(1 * time.Microsecond)

	privateIPs := []string{
		"192.168.1.1",
		"10.0.0.1",
		"172.16.0.1",
		"127.0.0.1",
	}

	for _, ip := range privateIPs {
		logEntry := &types.LogEntry{
			Timestamp:  time.Now().Unix(),
			CustomerID: "tenant-001",
			StatusCode: 200,
			BytesSent:  1024,
			IP:         ip,
		}

		err := enricher.Enrich(logEntry)
		if err != nil {
			t.Errorf("Enrichment failed for private IP %s: %v", ip, err)
		}

		// For mock enricher, private IPs should still get enriched
		if logEntry.GeoIP == nil {
			t.Errorf("Expected GeoIP data for private IP %s", ip)
		}
	}
}

func TestEnricherInvalidIPs(t *testing.T) {
	enricher := geoip.NewMockEnricher(1 * time.Microsecond)

	invalidIPs := []string{
		"not.an.ip",
		"999.999.999.999",
		"256.1.1.1",
		"",
		"invalid",
	}

	for _, ip := range invalidIPs {
		logEntry := &types.LogEntry{
			Timestamp:  time.Now().Unix(),
			CustomerID: "tenant-001",
			StatusCode: 200,
			BytesSent:  1024,
			IP:         ip,
		}

		// Mock enricher should still succeed (it doesn't validate IPs)
		err := enricher.Enrich(logEntry)
		if err != nil {
			t.Errorf("Mock enrichment failed for IP %s: %v", ip, err)
		}
	}
}

func TestEnricherConcurrency(t *testing.T) {
	enricher := geoip.NewMockEnricher(1 * time.Microsecond)

	numGoroutines := 50
	numRequestsPerGoroutine := 20

	var wg sync.WaitGroup
	errors := make(chan error, numGoroutines*numRequestsPerGoroutine)

	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func(goroutineID int) {
			defer wg.Done()

			for j := 0; j < numRequestsPerGoroutine; j++ {
				logEntry := &types.LogEntry{
					Timestamp:  time.Now().Unix(),
					CustomerID: "tenant-001",
					StatusCode: 200,
					BytesSent:  int64(1024 + goroutineID*1000 + j),
					IP:         "8.8.8.8",
				}

				if err := enricher.Enrich(logEntry); err != nil {
					errors <- err
				}
			}
		}(i)
	}

	wg.Wait()
	close(errors)

	// Check for any errors
	for err := range errors {
		t.Errorf("Concurrent enrichment error: %v", err)
	}

	// Verify metrics
	metrics := enricher.GetMetrics()
	expected := int64(numGoroutines * numRequestsPerGoroutine)
	if metrics["total_enrichments"] != expected {
		t.Errorf("Expected %d enrichments, got %v", expected, metrics["total_enrichments"])
	}
}

func BenchmarkEnrichment(b *testing.B) {
	enricher := geoip.NewMockEnricher(1 * time.Microsecond)

	logEntry := &types.LogEntry{
		Timestamp:  time.Now().Unix(),
		CustomerID: "tenant-001",
		StatusCode: 200,
		BytesSent:  1024,
		IP:         "8.8.8.8",
	}

	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			enricher.Enrich(logEntry)
		}
	})
}

func BenchmarkEnrichmentWithDelay(b *testing.B) {
	// Test with realistic delay
	enricher := geoip.NewMockEnricher(50 * time.Microsecond)

	logEntry := &types.LogEntry{
		Timestamp:  time.Now().Unix(),
		CustomerID: "tenant-001",
		StatusCode: 200,
		BytesSent:  1024,
		IP:         "8.8.8.8",
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		enricher.Enrich(logEntry)
	}
}

func TestEnrichmentPerformance(t *testing.T) {
	enricher := geoip.NewMockEnricher(50 * time.Microsecond) // 50μs target

	logEntry := &types.LogEntry{
		Timestamp:  time.Now().Unix(),
		CustomerID: "tenant-001",
		StatusCode: 200,
		BytesSent:  1024,
		IP:         "8.8.8.8",
	}

	// Warm up
	for i := 0; i < 10; i++ {
		enricher.Enrich(logEntry)
	}

	// Measure performance
	numTests := 100
	start := time.Now()

	for i := 0; i < numTests; i++ {
		err := enricher.Enrich(logEntry)
		if err != nil {
			t.Fatalf("Enrichment failed: %v", err)
		}
	}

	duration := time.Since(start)
	avgDuration := duration / time.Duration(numTests)

	t.Logf("Average enrichment time: %v", avgDuration)

	// Generous threshold: time.Sleep(50μs) is inaccurate on most kernels
	// (timer granularity ~100-200μs) and the -race detector adds overhead.
	// We only want to catch gross regressions, not micro-benchmark precision.
	if avgDuration > 2*time.Millisecond {
		t.Errorf("Enrichment too slow: %v > 2ms", avgDuration)
	}
}

func TestEnricherClose(t *testing.T) {
	enricher := geoip.NewMockEnricher(1 * time.Microsecond)

	err := enricher.Close()
	if err != nil {
		t.Errorf("Mock enricher close failed: %v", err)
	}

	// Should still work after close for mock
	logEntry := &types.LogEntry{
		Timestamp:  time.Now().Unix(),
		CustomerID: "tenant-001",
		StatusCode: 200,
		BytesSent:  1024,
		IP:         "8.8.8.8",
	}

	err = enricher.Enrich(logEntry)
	if err != nil {
		t.Errorf("Enrichment after close failed: %v", err)
	}
}

// Test real GeoIP enricher if database file exists
func TestRealEnricherIfAvailable(t *testing.T) {
	logger := setupLogger()
	config := geoip.DefaultConfig()

	// Try to create real enricher
	enricher, err := geoip.NewEnricher(config, logger)
	if err != nil {
		t.Skipf("Skipping real GeoIP test - database not available: %v", err)
		return
	}
	defer enricher.Close()

	logEntry := &types.LogEntry{
		Timestamp:  time.Now().Unix(),
		CustomerID: "tenant-001",
		StatusCode: 200,
		BytesSent:  1024,
		IP:         "8.8.8.8", // Google DNS
	}

	start := time.Now()
	err = enricher.Enrich(logEntry)
	duration := time.Since(start)

	if err != nil {
		t.Errorf("Real enrichment failed: %v", err)
	}

	if logEntry.GeoIP == nil {
		t.Error("Expected GeoIP data to be populated")
	}

	t.Logf("Real enrichment took: %v", duration)

	// Should be fast
	if duration > 1*time.Millisecond {
		t.Errorf("Real enrichment too slow: %v", duration)
	}

	// Check metrics
	metrics := enricher.GetMetrics()
	if metrics["total_enrichments"].(int64) != 1 {
		t.Errorf("Expected 1 enrichment, got %v", metrics["total_enrichments"])
	}
}
