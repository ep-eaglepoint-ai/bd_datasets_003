package metrics_endpoint_test

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/clickhouse"
	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/config"
	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/handlers"
	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/middlewares"
	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/routes"
	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/service"
	"github.com/labstack/echo/v5"
)

func newTestLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func setupTestServer(t *testing.T) (*echo.Echo, *service.Service) {
	t.Helper()
	logger := newTestLogger()
	cfg := &config.Config{
		WorkerCount:      2,
		BatchSize:        100,
		MaxProcs:         2,
		TargetRatePerSec: 50000,
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

func TestMetricsEndpointReturnsJSON(t *testing.T) {
	e, _ := setupTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/metrics/tenant-001", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var summary clickhouse.CustomerMetricsSummary
	if err := json.NewDecoder(rec.Body).Decode(&summary); err != nil {
		t.Fatalf("Failed to decode JSON: %v", err)
	}

	if summary.CustomerID != "tenant-001" {
		t.Errorf("Expected customer_id=tenant-001, got %s", summary.CustomerID)
	}
	if summary.WindowMinutes != 15 {
		t.Errorf("Expected window_minutes=15, got %d", summary.WindowMinutes)
	}
}

func TestMetricsEndpointCustomMinutes(t *testing.T) {
	e, _ := setupTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/metrics/tenant-001?minutes=5", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var summary clickhouse.CustomerMetricsSummary
	json.NewDecoder(rec.Body).Decode(&summary)

	if summary.WindowMinutes != 5 {
		t.Errorf("Expected window_minutes=5, got %d", summary.WindowMinutes)
	}
}

func TestMetricsEndpointClampsMinutes(t *testing.T) {
	e, _ := setupTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/metrics/tenant-001?minutes=30", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d", rec.Code)
	}

	var summary clickhouse.CustomerMetricsSummary
	json.NewDecoder(rec.Body).Decode(&summary)

	if summary.WindowMinutes != 15 {
		t.Errorf("Expected window_minutes=15 (clamped), got %d", summary.WindowMinutes)
	}
}

func TestMetricsEndpointReflectsIngestion(t *testing.T) {
	e, svc := setupTestServer(t)

	agg := svc.GetAggregator()
	now := time.Now()
	for i := 0; i < 100; i++ {
		agg.Record("tenant-001", now, 200, 1024)
	}
	for i := 0; i < 20; i++ {
		agg.Record("tenant-001", now, 404, 512)
	}
	for i := 0; i < 5; i++ {
		agg.Record("tenant-001", now, 500, 256)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/metrics/tenant-001", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var summary clickhouse.CustomerMetricsSummary
	json.NewDecoder(rec.Body).Decode(&summary)

	if summary.TotalRequests != 125 {
		t.Errorf("Expected 125 total requests, got %d", summary.TotalRequests)
	}
	if summary.StatusBreakdown.Status2xx != 100 {
		t.Errorf("Expected 100 2xx, got %d", summary.StatusBreakdown.Status2xx)
	}
	if summary.StatusBreakdown.Status4xx != 20 {
		t.Errorf("Expected 20 4xx, got %d", summary.StatusBreakdown.Status4xx)
	}
	if summary.StatusBreakdown.Status5xx != 5 {
		t.Errorf("Expected 5 5xx, got %d", summary.StatusBreakdown.Status5xx)
	}

	// Error rate: (20+5)/125 = 20%
	if summary.ErrorRate < 19.9 || summary.ErrorRate > 20.1 {
		t.Errorf("Expected error rate ~20%%, got %.2f%%", summary.ErrorRate)
	}
	if summary.StatusBreakdown.ErrorPct < 19.9 || summary.StatusBreakdown.ErrorPct > 20.1 {
		t.Errorf("Expected error_pct ~20%%, got %.2f%%", summary.StatusBreakdown.ErrorPct)
	}

	if summary.RequestsPerSecond <= 0 {
		t.Errorf("Expected positive requests_per_second, got %f", summary.RequestsPerSecond)
	}
}

// ---------------------------------------------------------------
// Metrics for unknown customer returns zero counts
// ---------------------------------------------------------------

func TestMetricsEndpointUnknownCustomer(t *testing.T) {
	e, _ := setupTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/metrics/tenant-999", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("Expected 200 even for unknown customer, got %d", rec.Code)
	}

	var summary clickhouse.CustomerMetricsSummary
	json.NewDecoder(rec.Body).Decode(&summary)

	if summary.TotalRequests != 0 {
		t.Errorf("Expected 0 requests for unknown customer, got %d", summary.TotalRequests)
	}
	if summary.ErrorRate != 0 {
		t.Errorf("Expected 0 error rate for unknown customer, got %f", summary.ErrorRate)
	}
}

// ---------------------------------------------------------------
// Metrics endpoint returns query_time_ms
// ---------------------------------------------------------------

func TestMetricsEndpointIncludesQueryTime(t *testing.T) {
	e, _ := setupTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/metrics/tenant-001", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	var raw map[string]interface{}
	json.NewDecoder(rec.Body).Decode(&raw)

	if _, ok := raw["query_time_ms"]; !ok {
		t.Error("Expected query_time_ms in response")
	}
}

// ---------------------------------------------------------------
// Metrics endpoint returns status_breakdown fields
// ---------------------------------------------------------------

func TestMetricsEndpointStatusBreakdownStructure(t *testing.T) {
	e, _ := setupTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/metrics/tenant-001", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	var raw map[string]interface{}
	json.NewDecoder(rec.Body).Decode(&raw)

	breakdown, ok := raw["status_breakdown"].(map[string]interface{})
	if !ok {
		t.Fatal("Expected status_breakdown object in response")
	}

	for _, key := range []string{"2xx", "3xx", "4xx", "5xx", "error_pct"} {
		if _, exists := breakdown[key]; !exists {
			t.Errorf("Expected key '%s' in status_breakdown", key)
		}
	}
}

func TestMockQueryServiceReturnsConfiguredResults(t *testing.T) {
	mock := clickhouse.NewMockQueryService()
	mock.Results["tenant-001"] = &clickhouse.CustomerMetricsSummary{
		CustomerID:    "tenant-001",
		TotalRequests: 500,
		ErrorRate:     2.5,
	}

	result, err := mock.QueryCustomerMetrics(context.TODO(), "tenant-001", 15)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if result.TotalRequests != 500 {
		t.Errorf("Expected 500, got %d", result.TotalRequests)
	}

	// Unknown customer
	result2, err := mock.QueryCustomerMetrics(context.TODO(), "tenant-999", 15)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if result2.TotalRequests != 0 {
		t.Errorf("Expected 0 for unknown, got %d", result2.TotalRequests)
	}

	if mock.CallCount != 2 {
		t.Errorf("Expected 2 calls, got %d", mock.CallCount)
	}
}

func TestClickHouseQueryServiceReturnsZeroSummary(t *testing.T) {
	mockConn := clickhouse.NewMockConnector()
	qs := clickhouse.NewClickHouseQueryService(mockConn)

	result, err := qs.QueryCustomerMetrics(context.TODO(), "tenant-001", 15)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if result.CustomerID != "tenant-001" {
		t.Errorf("Expected tenant-001, got %s", result.CustomerID)
	}
	if result.WindowMinutes != 15 {
		t.Errorf("Expected 15, got %d", result.WindowMinutes)
	}
}

func TestAdminMetricsIncludesRateMonitor(t *testing.T) {
	e, _ := setupTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/metrics", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d", rec.Code)
	}

	var metrics map[string]interface{}
	json.NewDecoder(rec.Body).Decode(&metrics)

	// Check for rate monitor keys
	expectedKeys := []string{
		"rate_target_rate_per_sec",
		"rate_throttled",
		"rate_total_ingested",
		"rate_gomaxprocs",
		"rate_num_goroutine",
	}

	for _, key := range expectedKeys {
		if _, ok := metrics[key]; !ok {
			t.Errorf("Expected key '%s' in admin metrics", key)
		}
	}

	// Check worker pool keys
	wpKeys := []string{
		"worker_pool_worker_count",
		"worker_pool_queue_utilization",
	}
	for _, key := range wpKeys {
		if _, ok := metrics[key]; !ok {
			t.Errorf("Expected key '%s' in admin metrics", key)
		}
	}
}
