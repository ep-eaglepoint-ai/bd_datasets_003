package worker_pool_test

import (
	"log/slog"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/geoip"
	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/types"
	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/workers"
)

func setupLogger() *slog.Logger {
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelError, // Reduce test noise
	}))
}

func TestWorkerPoolBasicOperation(t *testing.T) {
	logger := setupLogger()
	enricher := geoip.NewMockEnricher(10 * time.Microsecond)

	config := workers.DefaultConfig()
	config.WorkerCount = 2
	config.JobQueueSize = 10

	pool := workers.NewWorkerPool(config, logger, enricher)
	pool.Start()
	defer pool.Shutdown(5 * time.Second)

	// Submit test jobs
	logEntry := &types.LogEntry{
		Timestamp:  time.Now().Unix(),
		CustomerID: "tenant-001",
		StatusCode: 200,
		BytesSent:  1024,
		IP:         "8.8.8.8",
	}

	err := pool.SubmitJob(logEntry, "tenant-001")
	if err != nil {
		t.Fatalf("Failed to submit job: %v", err)
	}

	// Wait for processing
	time.Sleep(100 * time.Millisecond)

	// Check metrics
	metrics := pool.GetMetrics()
	if metrics["jobs_queued"].(int64) == 0 {
		t.Error("Expected jobs to be queued")
	}
}

func TestWorkerPoolConcurrency(t *testing.T) {
	logger := setupLogger()
	enricher := geoip.NewMockEnricher(1 * time.Microsecond)

	config := workers.DefaultConfig()
	config.WorkerCount = 4
	config.JobQueueSize = 1000

	pool := workers.NewWorkerPool(config, logger, enricher)
	pool.Start()
	defer pool.Shutdown(5 * time.Second)

	// Submit jobs concurrently
	numJobs := 100
	var wg sync.WaitGroup

	for i := 0; i < numJobs; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()

			logEntry := &types.LogEntry{
				Timestamp:  time.Now().Unix(),
				CustomerID: "tenant-001",
				StatusCode: 200,
				BytesSent:  int64(1024 + i),
				IP:         "8.8.8.8",
			}

			if err := pool.SubmitJob(logEntry, "tenant-001"); err != nil {
				t.Errorf("Failed to submit job %d: %v", i, err)
			}
		}(i)
	}

	wg.Wait()

	// Wait for processing
	time.Sleep(500 * time.Millisecond)

	metrics := pool.GetMetrics()
	queued := metrics["jobs_queued"].(int64)
	if queued != int64(numJobs) {
		t.Errorf("Expected %d jobs queued, got %d", numJobs, queued)
	}
}

func TestWorkerPoolQueueUtilization(t *testing.T) {
	logger := setupLogger()
	enricher := geoip.NewMockEnricher(50 * time.Millisecond) // Slow processing

	config := workers.DefaultConfig()
	config.WorkerCount = 1
	config.JobQueueSize = 10

	pool := workers.NewWorkerPool(config, logger, enricher)
	pool.Start()
	defer pool.Shutdown(5 * time.Second)

	// Fill the queue
	for i := 0; i < 5; i++ {
		logEntry := &types.LogEntry{
			Timestamp:  time.Now().Unix(),
			CustomerID: "tenant-001",
			StatusCode: 200,
			BytesSent:  int64(1024 + i),
			IP:         "8.8.8.8",
		}

		pool.SubmitJob(logEntry, "tenant-001")
	}

	utilization := pool.GetQueueUtilization()
	if utilization == 0 {
		t.Error("Expected non-zero queue utilization")
	}

	t.Logf("Queue utilization: %.2f", utilization)
}

func TestWorkerPoolGracefulShutdown(t *testing.T) {
	logger := setupLogger()
	enricher := geoip.NewMockEnricher(10 * time.Millisecond)

	config := workers.DefaultConfig()
	config.WorkerCount = 2

	pool := workers.NewWorkerPool(config, logger, enricher)
	pool.Start()

	// Submit some jobs
	for i := 0; i < 5; i++ {
		logEntry := &types.LogEntry{
			Timestamp:  time.Now().Unix(),
			CustomerID: "tenant-001",
			StatusCode: 200,
			BytesSent:  int64(1024 + i),
			IP:         "8.8.8.8",
		}

		pool.SubmitJob(logEntry, "tenant-001")
	}

	// Shutdown with timeout
	start := time.Now()
	err := pool.Shutdown(2 * time.Second)
	duration := time.Since(start)

	if err != nil {
		t.Errorf("Shutdown failed: %v", err)
	}

	if duration > 3*time.Second {
		t.Errorf("Shutdown took too long: %v", duration)
	}

	// Verify no new jobs can be submitted
	logEntry := &types.LogEntry{
		Timestamp:  time.Now().Unix(),
		CustomerID: "tenant-001",
		StatusCode: 200,
		BytesSent:  1024,
		IP:         "8.8.8.8",
	}

	err = pool.SubmitJob(logEntry, "tenant-001")
	if err == nil {
		t.Error("Expected error when submitting job to shutdown pool")
	}
}

func TestWorkerPoolEnrichmentError(t *testing.T) {
	logger := setupLogger()
	enricher := geoip.NewMockEnricher(10 * time.Microsecond)

	// Make enricher return errors
	enricher.SetShouldError(true)

	config := workers.DefaultConfig()
	config.WorkerCount = 1

	pool := workers.NewWorkerPool(config, logger, enricher)
	pool.Start()
	defer pool.Shutdown(5 * time.Second)

	// Submit job that will cause enrichment error
	logEntry := &types.LogEntry{
		Timestamp:  time.Now().Unix(),
		CustomerID: "tenant-001",
		StatusCode: 200,
		BytesSent:  1024,
		IP:         "invalid-ip", // This will cause enrichment to fail
	}

	err := pool.SubmitJob(logEntry, "tenant-001")
	if err != nil {
		t.Fatalf("Failed to submit job: %v", err)
	}

	// Wait for processing
	time.Sleep(100 * time.Millisecond)

	// Jobs should still be processed (errors are handled gracefully)
	metrics := pool.GetMetrics()
	if metrics["jobs_queued"].(int64) == 0 {
		t.Error("Expected jobs to be queued")
	}
}

func BenchmarkWorkerPoolThroughput(b *testing.B) {
	logger := setupLogger()
	enricher := geoip.NewMockEnricher(1 * time.Microsecond)

	config := workers.DefaultConfig()
	config.WorkerCount = 4
	config.JobQueueSize = 10000

	pool := workers.NewWorkerPool(config, logger, enricher)
	pool.Start()
	defer pool.Shutdown(5 * time.Second)

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
			pool.SubmitJob(logEntry, "tenant-001")
		}
	})
}

func TestWorkerPoolMetrics(t *testing.T) {
	logger := setupLogger()
	enricher := geoip.NewMockEnricher(10 * time.Microsecond)

	config := workers.DefaultConfig()
	pool := workers.NewWorkerPool(config, logger, enricher)
	pool.Start()
	defer pool.Shutdown(5 * time.Second)

	metrics := pool.GetMetrics()

	// Check required metrics fields
	requiredFields := []string{
		"worker_count",
		"jobs_queued",
		"jobs_processed",
		"jobs_in_progress",
		"queue_utilization",
		"queue_size",
		"queue_capacity",
	}

	for _, field := range requiredFields {
		if _, exists := metrics[field]; !exists {
			t.Errorf("Missing metric field: %s", field)
		}
	}

	// Verify some basic values
	if metrics["worker_count"] != config.WorkerCount {
		t.Errorf("Expected worker_count %d, got %v", config.WorkerCount, metrics["worker_count"])
	}

	if metrics["queue_capacity"] != config.JobQueueSize {
		t.Errorf("Expected queue_capacity %d, got %v", config.JobQueueSize, metrics["queue_capacity"])
	}
}

func TestWorkerPoolQueueFull(t *testing.T) {
	logger := setupLogger()
	enricher := geoip.NewMockEnricher(100 * time.Millisecond) // Very slow processing

	config := workers.DefaultConfig()
	config.WorkerCount = 1
	config.JobQueueSize = 2 // Very small queue

	pool := workers.NewWorkerPool(config, logger, enricher)
	pool.Start()
	defer pool.Shutdown(5 * time.Second)

	// Fill the queue beyond capacity
	var lastErr error
	for i := 0; i < 10; i++ {
		logEntry := &types.LogEntry{
			Timestamp:  time.Now().Unix(),
			CustomerID: "tenant-001",
			StatusCode: 200,
			BytesSent:  int64(1024 + i),
			IP:         "8.8.8.8",
		}

		err := pool.SubmitJob(logEntry, "tenant-001")
		if err != nil {
			lastErr = err
			break
		}
	}

	if lastErr == nil {
		t.Error("Expected queue full error but got none")
	}

	if lastErr != workers.ErrQueueFull {
		t.Errorf("Expected ErrQueueFull, got %v", lastErr)
	}
}
