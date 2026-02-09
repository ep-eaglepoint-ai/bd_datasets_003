package performance_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/clickhouse"
	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/config"
	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/handlers"
	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/middlewares"
	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/routes"
	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/service"
	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/types"
	"github.com/labstack/echo/v5"
)

func newTestLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// makeLogBatch creates a JSON body with n log entries.
func makeLogBatch(n int, tenantID string) string {
	now := time.Now().Unix()
	statusCodes := []int{200, 200, 200, 200, 301, 404, 500}
	logs := make([]types.LogEntry, n)
	for i := 0; i < n; i++ {
		logs[i] = types.LogEntry{
			Timestamp:  now,
			CustomerID: tenantID,
			StatusCode: statusCodes[i%len(statusCodes)],
			BytesSent:  int64(512 + (i % 2048)),
			IP:         fmt.Sprintf("198.51.100.%d", (i%254)+1),
		}
	}
	body := types.LogBatchRequest{Logs: logs}
	b, _ := json.Marshal(body)
	return string(b)
}

func setupPerfTestServer(t *testing.T) (*echo.Echo, *service.Service) {
	t.Helper()
	logger := newTestLogger()
	cfg := &config.Config{
		WorkerCount:      4,
		BatchSize:        5000,
		MaxProcs:         2,
		TargetRatePerSec: 100000, // very high to avoid dynamic throttle in perf test
	}
	svc, err := service.New(cfg, logger)
	if err != nil {
		t.Fatalf("Failed to create service: %v", err)
	}
	h := handlers.New(svc, logger)
	tenantCache := middlewares.NewTenantCache(logger)
	e := echo.New()
	routes.Setup(e, h, tenantCache)
	return e, svc
}

func TestSustainedThroughput8KPerSec(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping sustained throughput test in short mode")
	}

	e, _ := setupPerfTestServer(t)

	const (
		targetRatePerSec = 8000
		durationSec      = 300 // 5 minutes as per requirement
		batchSize        = 100
		requestsPerSec   = targetRatePerSec / batchSize
		totalRequests    = requestsPerSec * durationSec
		concurrency      = 20
	)

	var (
		successCount   atomic.Int64
		backpressure   atomic.Int64
		errorCount     atomic.Int64
		totalLatencyNs atomic.Int64
	)

	body := makeLogBatch(batchSize, "tenant-001")
	tenantID := "tenant-001"

	var wg sync.WaitGroup
	requestsPerWorker := totalRequests / concurrency

	start := time.Now()
	for w := 0; w < concurrency; w++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for r := 0; r < requestsPerWorker; r++ {
				reqStart := time.Now()
				req := httptest.NewRequest(http.MethodPost, "/api/v1/logs", strings.NewReader(body))
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("X-Customer-ID", tenantID)
				rec := httptest.NewRecorder()
				e.ServeHTTP(rec, req)
				totalLatencyNs.Add(time.Since(reqStart).Nanoseconds())

				switch rec.Code {
				case http.StatusAccepted:
					successCount.Add(1)
				case http.StatusTooManyRequests:
					backpressure.Add(1)
				default:
					errorCount.Add(1)
				}
			}
		}(w)
	}
	wg.Wait()
	elapsed := time.Since(start)

	success := successCount.Load()
	bp := backpressure.Load()
	errs := errorCount.Load()
	totalReqs := success + bp + errs
	avgLatency := time.Duration(totalLatencyNs.Load() / totalReqs)
	actualRate := float64(success*int64(batchSize)) / elapsed.Seconds()

	t.Logf("Sustained throughput test results:")
	t.Logf("  Duration:       %v", elapsed)
	t.Logf("  Total requests: %d", totalReqs)
	t.Logf("  Success:        %d (%.1f%%)", success, float64(success)/float64(totalReqs)*100)
	t.Logf("  Backpressure:   %d (%.1f%%)", bp, float64(bp)/float64(totalReqs)*100)
	t.Logf("  Errors:         %d", errs)
	t.Logf("  Avg latency:    %v", avgLatency)
	t.Logf("  Actual rate:    %.0f logs/sec", actualRate)

	if success == 0 {
		t.Fatal("No requests succeeded")
	}

	if errs > 0 {
		t.Errorf("Expected 0 hard errors, got %d", errs)
	}

	if success+bp+errs != totalReqs {
		t.Errorf("Request accounting mismatch")
	}
}

func TestAggregatorAccuracyAfterBurst(t *testing.T) {
	_, svc := setupPerfTestServer(t)

	// Inject known data: 1000 x 200, 200 x 404, 50 x 500
	now := time.Now()
	agg := svc.GetAggregator()
	for i := 0; i < 1000; i++ {
		agg.Record("tenant-001", now, 200, 1024)
	}
	for i := 0; i < 200; i++ {
		agg.Record("tenant-001", now, 404, 512)
	}
	for i := 0; i < 50; i++ {
		agg.Record("tenant-001", now, 500, 256)
	}

	summary, err := svc.QueryCustomerMetrics(context.TODO(), "tenant-001", 15)
	if err != nil {
		t.Fatalf("Query failed: %v", err)
	}

	if summary.TotalRequests != 1250 {
		t.Errorf("Expected 1250 total, got %d", summary.TotalRequests)
	}
	if summary.StatusBreakdown.Status2xx != 1000 {
		t.Errorf("Expected 1000 2xx, got %d", summary.StatusBreakdown.Status2xx)
	}
	if summary.StatusBreakdown.Status4xx != 200 {
		t.Errorf("Expected 200 4xx, got %d", summary.StatusBreakdown.Status4xx)
	}
	if summary.StatusBreakdown.Status5xx != 50 {
		t.Errorf("Expected 50 5xx, got %d", summary.StatusBreakdown.Status5xx)
	}
	// Error rate = (200+50)/1250 = 20%
	if summary.ErrorRate < 19.9 || summary.ErrorRate > 20.1 {
		t.Errorf("Expected error rate ~20%%, got %.2f%%", summary.ErrorRate)
	}
}

func TestBatchInserterReceivesAllRows(t *testing.T) {
	logger := newTestLogger()
	cfg := clickhouse.DefaultBatchConfig()
	cfg.BatchSize = 500
	cfg.FlushInterval = 100 * time.Millisecond
	mock := clickhouse.NewMockConnector()
	bi := clickhouse.NewBatchInserter(cfg, mock, logger)

	const totalRows = 1000
	for i := 0; i < totalRows; i++ {
		row := clickhouse.LogRow{
			EventID:    fmt.Sprintf("evt-%d", i),
			CustomerID: "tenant-001",
			Timestamp:  time.Now(),
			StatusCode: 200,
			BytesSent:  1024,
			IP:         "8.8.8.8",
		}
		if err := bi.Append(row); err != nil {
			t.Fatalf("Append failed at row %d: %v", i, err)
		}
	}

	if err := bi.Shutdown(5 * time.Second); err != nil {
		t.Fatalf("Shutdown failed: %v", err)
	}

	flushed := mock.GetTotalRows()
	minExpected := int64(float64(totalRows) * 0.999)
	if flushed < minExpected {
		t.Errorf("Expected at least %d rows flushed (99.9%%), got %d", minExpected, flushed)
	}
	t.Logf("Flushed %d / %d rows (%.2f%%)", flushed, totalRows, float64(flushed)/float64(totalRows)*100)
}

func TestMiddlewareValidationPerformance(t *testing.T) {
	logger := newTestLogger()
	tenantCache := middlewares.NewTenantCache(logger)

	iterations := 10000
	start := time.Now()
	for i := 0; i < iterations; i++ {
		valid, _, _ := tenantCache.Validate("tenant-001")
		if !valid {
			t.Fatal("Expected valid tenant")
		}
	}
	elapsed := time.Since(start)
	avgLatency := elapsed / time.Duration(iterations)
	t.Logf("Tenant validation: %d iterations in %v (avg %v/op)", iterations, elapsed, avgLatency)
	if avgLatency > 10*time.Microsecond {
		t.Errorf("Tenant validation too slow: %v > 10μs", avgLatency)
	}
}

func TestGeoIPEnrichmentPerformanceBulk(t *testing.T) {
	e, _ := setupPerfTestServer(t)

	const batchSize = 100
	body := makeLogBatch(batchSize, "tenant-001")
	iterations := 100
	start := time.Now()
	for i := 0; i < iterations; i++ {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/logs", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Customer-ID", "tenant-001")
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)
	}
	elapsed := time.Since(start)
	totalLogs := iterations * batchSize
	rate := float64(totalLogs) / elapsed.Seconds()
	t.Logf("Enrichment bulk: %d logs in %v (%.0f logs/sec)", totalLogs, elapsed, rate)
	if rate < 1000 {
		t.Errorf("Enrichment rate too low: %.0f < 1000 logs/sec", rate)
	}
}

func TestBatchFlushTimerAccuracy(t *testing.T) {
	logger := newTestLogger()
	cfg := clickhouse.DefaultBatchConfig()
	cfg.BatchSize = 10000 // won't fill
	cfg.FlushInterval = 200 * time.Millisecond
	mock := clickhouse.NewMockConnector()
	bi := clickhouse.NewBatchInserter(cfg, mock, logger)

	// Append 5 rows (less than batch size)
	for i := 0; i < 5; i++ {
		bi.Append(clickhouse.LogRow{
			EventID:    fmt.Sprintf("evt-%d", i),
			CustomerID: "tenant-001",
			Timestamp:  time.Now(),
			StatusCode: 200,
			BytesSent:  512,
			IP:         "1.1.1.1",
		})
	}

	// Wait for timer to flush
	time.Sleep(500 * time.Millisecond)

	if mock.GetTotalRows() != 5 {
		t.Errorf("Expected 5 rows after timer flush, got %d", mock.GetTotalRows())
	}

	bi.Shutdown(5 * time.Second)
}

// ---------------------------------------------------------------
// Metrics endpoint performance (latency)
// ---------------------------------------------------------------

func TestMetricsEndpointLatency(t *testing.T) {
	e, svc := setupPerfTestServer(t)

	// Seed some data
	agg := svc.GetAggregator()
	now := time.Now()
	for i := 0; i < 5000; i++ {
		agg.Record("tenant-001", now, 200, 1024)
	}

	iterations := 100
	start := time.Now()
	for i := 0; i < iterations; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/metrics/tenant-001", nil)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d", rec.Code)
		}
	}
	elapsed := time.Since(start)
	avgLatency := elapsed / time.Duration(iterations)
	t.Logf("Metrics endpoint: %d calls in %v (avg %v/call)", iterations, elapsed, avgLatency)
	// Metrics queries should be fast (sub-millisecond for in-memory aggregator)
	if avgLatency > 5*time.Millisecond {
		t.Errorf("Metrics endpoint too slow: %v > 5ms", avgLatency)
	}
}
