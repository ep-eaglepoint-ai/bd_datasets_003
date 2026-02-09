package integration_test

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

func setupIntegrationServer(t *testing.T) (*echo.Echo, *service.Service) {
	t.Helper()
	logger := newTestLogger()
	cfg := &config.Config{
		Environment:      "test",
		WorkerCount:      2,
		BatchSize:        100,
		MaxProcs:         2,
		TargetRatePerSec: 100000,
	}

	svc, err := service.New(cfg, logger)
	if err != nil {
		t.Fatalf("service.New failed: %v", err)
	}
	h := handlers.New(svc, logger)
	tenantCache := middlewares.NewTenantCache(logger)

	e := echo.New()
	routes.Setup(e, h, tenantCache)
	return e, svc
}

// waitForMetrics polls the metrics endpoint until the condition 
func waitForMetrics(t *testing.T, e *echo.Echo, tenantID string, predicate func(clickhouse.CustomerMetricsSummary) bool) clickhouse.CustomerMetricsSummary {
	t.Helper()

	timeout := 2 * time.Second
	deadline := time.Now().Add(timeout)
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for time.Now().Before(deadline) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/metrics/"+tenantID, nil)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)

		if rec.Code == http.StatusOK {
			var summary clickhouse.CustomerMetricsSummary
			if err := json.NewDecoder(rec.Body).Decode(&summary); err == nil {
				if predicate(summary) {
					return summary
				}
			}
		}
		<-ticker.C
	}
	t.Fatalf("Timed out waiting for metrics condition for %s", tenantID)
	return clickhouse.CustomerMetricsSummary{}
}

func makeLogBatch(n int, tenantID string) string {
	logs := make([]types.LogEntry, n)
	now := time.Now().Unix()
	codes := []int{200, 200, 200, 301, 404, 500, 200}
	for i := 0; i < n; i++ {
		logs[i] = types.LogEntry{
			Timestamp:  now,
			CustomerID: tenantID,
			StatusCode: codes[i%len(codes)],
			BytesSent:  int64(512 + i%1024),
			IP:         fmt.Sprintf("198.51.100.%d", (i%254)+1),
		}
	}
	body := types.LogBatchRequest{Logs: logs}
	b, _ := json.Marshal(body)
	return string(b)
}

// Integration test: full pipeline ingestion → worker pool →
//   GeoIP enrichment → aggregator → metrics endpoint

func TestFullPipelineIngestToMetrics(t *testing.T) {
	e, svc := setupIntegrationServer(t)

	tenantID := "tenant-001"
	body := makeLogBatch(50, tenantID)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/logs", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Customer-ID", tenantID)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusAccepted {
		t.Fatalf("Ingestion failed: status %d, body %s", rec.Code, rec.Body.String())
	}

	var ingestResp map[string]interface{}
	json.NewDecoder(rec.Body).Decode(&ingestResp)
	if int(ingestResp["accepted"].(float64)) != 50 {
		t.Errorf("Expected 50 accepted, got %v", ingestResp["accepted"])
	}

	// Use waitForMetrics to ensure async processing is complete
	summary := waitForMetrics(t, e, tenantID, func(s clickhouse.CustomerMetricsSummary) bool {
		return s.TotalRequests >= 50
	})

	t.Logf("Pipeline result: requests=%d, 2xx=%d, 4xx=%d, 5xx=%d, rps=%.2f",
		summary.TotalRequests,
		summary.StatusBreakdown.Status2xx,
		summary.StatusBreakdown.Status4xx,
		summary.StatusBreakdown.Status5xx,
		summary.RequestsPerSecond,
	)

	if summary.TotalRequests == 0 {
		t.Error("Expected at least some requests to be reflected in metrics")
	}

	req3 := httptest.NewRequest(http.MethodGet, "/api/v1/admin/metrics", nil)
	rec3 := httptest.NewRecorder()
	e.ServeHTTP(rec3, req3)

	var adminMetrics map[string]interface{}
	json.NewDecoder(rec3.Body).Decode(&adminMetrics)

	if _, ok := adminMetrics["events_queued"]; !ok {
		t.Error("Expected events_queued in admin metrics")
	}

	ctx := context.Background()
	if err := svc.Shutdown(ctx); err != nil {
		t.Errorf("Shutdown failed: %v", err)
	}
}

// Integration: tenant isolation

func TestTenantIsolation(t *testing.T) {
	e, svc := setupIntegrationServer(t)

	body1 := makeLogBatch(30, "tenant-001")
	req1 := httptest.NewRequest(http.MethodPost, "/api/v1/logs", strings.NewReader(body1))
	req1.Header.Set("Content-Type", "application/json")
	req1.Header.Set("X-Customer-ID", "tenant-001")
	rec1 := httptest.NewRecorder()
	e.ServeHTTP(rec1, req1)
	if rec1.Code != http.StatusAccepted {
		t.Fatalf("Tenant-001 ingestion failed: %d", rec1.Code)
	}

	body2 := makeLogBatch(10, "tenant-002")
	req2 := httptest.NewRequest(http.MethodPost, "/api/v1/logs", strings.NewReader(body2))
	req2.Header.Set("Content-Type", "application/json")
	req2.Header.Set("X-Customer-ID", "tenant-002")
	rec2 := httptest.NewRecorder()
	e.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusAccepted {
		t.Fatalf("Tenant-002 ingestion failed: %d", rec2.Code)
	}

	// Replace sleep with polling
	summary1 := waitForMetrics(t, e, "tenant-001", func(s clickhouse.CustomerMetricsSummary) bool {
		return s.TotalRequests >= 30
	})
	summary2 := waitForMetrics(t, e, "tenant-002", func(s clickhouse.CustomerMetricsSummary) bool {
		return s.TotalRequests >= 10
	})

	t.Logf("Tenant-001: %d requests", summary1.TotalRequests)
	t.Logf("Tenant-002: %d requests", summary2.TotalRequests)

	if summary1.TotalRequests > 0 && summary2.TotalRequests > 0 {
		if summary1.TotalRequests <= summary2.TotalRequests {
			t.Errorf("Tenant-001 (%d) should have more requests than tenant-002 (%d)",
				summary1.TotalRequests, summary2.TotalRequests)
		}
	}

	svc.Shutdown(context.Background())
}

// Integration: health and readiness checks

func TestHealthAndReadiness(t *testing.T) {
	e, _ := setupIntegrationServer(t)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("Health check failed: %d", rec.Code)
	}

	var health map[string]string
	json.NewDecoder(rec.Body).Decode(&health)
	if health["status"] != "healthy" {
		t.Errorf("Expected status=healthy, got %s", health["status"])
	}

	req2 := httptest.NewRequest(http.MethodGet, "/ready", nil)
	rec2 := httptest.NewRecorder()
	e.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusOK {
		t.Errorf("Readiness check failed: %d", rec2.Code)
	}
}

// Integration: missing/bad tenant headers return correct errors

func TestIngestionRequiresTenantHeader(t *testing.T) {
	e, _ := setupIntegrationServer(t)

	body := makeLogBatch(5, "tenant-001")

	// No tenant header → 400
	req := httptest.NewRequest(http.MethodPost, "/api/v1/logs", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 for missing tenant header, got %d", rec.Code)
	}
}

func TestIngestionRejectsMalformedTenant(t *testing.T) {
	e, _ := setupIntegrationServer(t)

	body := makeLogBatch(5, "tenant-001")

	req := httptest.NewRequest(http.MethodPost, "/api/v1/logs", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Customer-ID", "badformat")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 for malformed tenant, got %d", rec.Code)
	}
}

func TestIngestionRejectsUnknownTenant(t *testing.T) {
	e, _ := setupIntegrationServer(t)

	body := makeLogBatch(5, "tenant-001")

	req := httptest.NewRequest(http.MethodPost, "/api/v1/logs", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Customer-ID", "tenant-999")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("Expected 401 for unknown tenant, got %d", rec.Code)
	}
}

func TestIngestionRejectsInactiveTenant(t *testing.T) {
	e, _ := setupIntegrationServer(t)

	body := makeLogBatch(5, "tenant-001")

	// tenant-004 is inactive
	req := httptest.NewRequest(http.MethodPost, "/api/v1/logs", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Customer-ID", "tenant-004")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("Expected 401 for inactive tenant, got %d", rec.Code)
	}
}

// Integration: empty and oversized batches

func TestIngestionRejectsEmptyBatch(t *testing.T) {
	e, _ := setupIntegrationServer(t)

	body := `{"logs": []}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/logs", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Customer-ID", "tenant-001")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 for empty batch, got %d", rec.Code)
	}
}

func TestIngestionRejectsOversizedBatch(t *testing.T) {
	e, _ := setupIntegrationServer(t)

	body := makeLogBatch(1001, "tenant-001")
	req := httptest.NewRequest(http.MethodPost, "/api/v1/logs", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Customer-ID", "tenant-001")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 for oversized batch, got %d", rec.Code)
	}
}

// Integration: concurrent ingestion with backpressure

func TestConcurrentIngestionWithBackpressure(t *testing.T) {
	e, svc := setupIntegrationServer(t)

	const (
		goroutines     = 30
		reqsPerRoutine = 20
		batchSize      = 50
	)

	var (
		success    atomic.Int64
		bp429      atomic.Int64
		otherError atomic.Int64
	)

	body := makeLogBatch(batchSize, "tenant-001")

	var wg sync.WaitGroup
	for g := 0; g < goroutines; g++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for r := 0; r < reqsPerRoutine; r++ {
				req := httptest.NewRequest(http.MethodPost, "/api/v1/logs", strings.NewReader(body))
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("X-Customer-ID", "tenant-001")
				rec := httptest.NewRecorder()
				e.ServeHTTP(rec, req)

				switch rec.Code {
				case http.StatusAccepted:
					success.Add(1)
				case http.StatusTooManyRequests:
					bp429.Add(1)
				default:
					otherError.Add(1)
				}
			}
		}()
	}

	wg.Wait()

	total := success.Load() + bp429.Load() + otherError.Load()
	t.Logf("Concurrent: %d total, %d success, %d backpressure, %d errors",
		total, success.Load(), bp429.Load(), otherError.Load())

	expected := int64(goroutines * reqsPerRoutine)
	if total != expected {
		t.Errorf("Expected %d total requests, got %d", expected, total)
	}
	maxTolerated := int64(float64(expected) * 0.05)
	if otherError.Load() > maxTolerated {
		t.Errorf("Expected at most %d hard errors (5%%), got %d", maxTolerated, otherError.Load())
	}

	svc.Shutdown(context.Background())
}

// Integration: admin metrics endpoint

func TestAdminMetricsIntegration(t *testing.T) {
	e, svc := setupIntegrationServer(t)

	body := makeLogBatch(20, "tenant-001")
	req := httptest.NewRequest(http.MethodPost, "/api/v1/logs", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Customer-ID", "tenant-001")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	// Use simpler polling for admin metrics
	deadline := time.Now().Add(2 * time.Second)
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	var metrics map[string]interface{}
	for time.Now().Before(deadline) {
		req2 := httptest.NewRequest(http.MethodGet, "/api/v1/admin/metrics", nil)
		rec2 := httptest.NewRecorder()
		e.ServeHTTP(rec2, req2)

		if rec2.Code == http.StatusOK {
			json.NewDecoder(rec2.Body).Decode(&metrics)
			if processed, ok := metrics["events_processed"].(float64); ok && processed > 0 {
				break
			}
		}
		<-ticker.C
	}

	essentialKeys := []string{
		"events_queued",
		"events_processed",
		"worker_count",
		"batch_size",
		"backpressure_active",
		"worker_pool_worker_count",
		"worker_pool_queue_utilization",
		"aggregator_tracked_customers",
		"batch_rows_appended",
		"rate_target_rate_per_sec",
		"rate_throttled",
	}

	for _, key := range essentialKeys {
		if _, ok := metrics[key]; !ok {
			t.Errorf("Missing key '%s' in admin metrics", key)
		}
	}

	svc.Shutdown(context.Background())
}

// Integration: X-Tenant-ID backward compatibility

func TestXTenantIDBackwardCompatibility(t *testing.T) {
	e, _ := setupIntegrationServer(t)

	body := makeLogBatch(5, "tenant-001")

	// Use legacy X-Tenant-ID header instead of X-Customer-ID
	req := httptest.NewRequest(http.MethodPost, "/api/v1/logs", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Tenant-ID", "tenant-001")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusAccepted {
		t.Errorf("Expected 202 with X-Tenant-ID header, got %d: %s", rec.Code, rec.Body.String())
	}
}

// Integration: graceful shutdown drains everything

func TestGracefulShutdownDrains(t *testing.T) {
	_, svc := setupIntegrationServer(t)

	agg := svc.GetAggregator()
	now := time.Now()
	for i := 0; i < 100; i++ {
		agg.Record("tenant-001", now, 200, 1024)
	}

	ctx := context.Background()
	err := svc.Shutdown(ctx)
	if err != nil {
		t.Errorf("Graceful shutdown returned error: %v", err)
	}
}

// Integration: rate monitor reflects in admin metrics

func TestRateMonitorReflectsInAdminMetrics(t *testing.T) {
	e, svc := setupIntegrationServer(t)

	rm := svc.GetRateMonitor()
	rm.RecordEvents(5000)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/metrics", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	var metrics map[string]interface{}
	json.NewDecoder(rec.Body).Decode(&metrics)

	totalIngested, ok := metrics["rate_total_ingested"]
	if !ok {
		t.Fatal("Missing rate_total_ingested in admin metrics")
	}
	if int64(totalIngested.(float64)) != 5000 {
		t.Errorf("Expected rate_total_ingested=5000, got %v", totalIngested)
	}

	svc.Shutdown(context.Background())
}

// Integration: metrics endpoint returns valid JSON structure

func TestMetricsEndpointJSONStructure(t *testing.T) {
	e, svc := setupIntegrationServer(t)

	// Seed data
	agg := svc.GetAggregator()
	now := time.Now()
	agg.Record("tenant-005", now, 200, 1024)
	agg.Record("tenant-005", now, 500, 256)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/metrics/tenant-005", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d", rec.Code)
	}

	// Unmarshal into concrete type to validate structure
	var summary clickhouse.CustomerMetricsSummary
	if err := json.NewDecoder(rec.Body).Decode(&summary); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	if summary.CustomerID != "tenant-005" {
		t.Errorf("Expected customer_id=tenant-005, got %s", summary.CustomerID)
	}
	if summary.WindowMinutes <= 0 {
		t.Errorf("Expected positive window_minutes, got %d", summary.WindowMinutes)
	}
	if summary.TotalRequests != 2 {
		t.Errorf("Expected 2 total requests, got %d", summary.TotalRequests)
	}

	svc.Shutdown(context.Background())
}
