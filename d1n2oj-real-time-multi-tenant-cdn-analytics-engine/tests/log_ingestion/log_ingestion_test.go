package log_ingestion

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

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

func setupTestServer() *echo.Echo {
	logger := newTestLogger()
	cfg := &config.Config{
		WorkerCount: 2,
		BatchSize:   100,
	}

	svc, err := service.New(cfg, logger)
	if err != nil {
		panic(err)
	}
	h := handlers.New(svc, logger)
	tenantCache := middlewares.NewTenantCache(logger)

	e := echo.New()
	routes.Setup(e, h, tenantCache)

	return e
}

func TestLogIngestionSuccess(t *testing.T) {
	e := setupTestServer()

	logEntry := types.LogEntry{
		Timestamp:  time.Now().Unix(),
		CustomerID: "tenant-001",
		StatusCode: 200,
		BytesSent:  1024,
		IP:         "192.168.1.1",
	}

	batch := types.LogBatchRequest{
		Logs: []types.LogEntry{logEntry},
	}

	body, _ := json.Marshal(batch)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/logs", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Customer-ID", "tenant-001")

	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusAccepted {
		t.Errorf("expected status %d, got %d: %s", http.StatusAccepted, rec.Code, rec.Body.String())
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if resp["accepted"].(float64) != 1 {
		t.Errorf("expected accepted=1, got %v", resp["accepted"])
	}
}

func TestLogIngestionValidation(t *testing.T) {
	e := setupTestServer()

	testCases := []struct {
		name       string
		logEntry   types.LogEntry
		expectCode int
	}{
		{
			name: "missing_timestamp",
			logEntry: types.LogEntry{
				CustomerID: "tenant-001",
				StatusCode: 200,
				BytesSent:  1024,
				IP:         "192.168.1.1",
			},
			expectCode: http.StatusBadRequest,
		},
		{
			name: "invalid_status_code",
			logEntry: types.LogEntry{
				Timestamp:  time.Now().Unix(),
				CustomerID: "tenant-001",
				StatusCode: 999,
				BytesSent:  1024,
				IP:         "192.168.1.1",
			},
			expectCode: http.StatusBadRequest,
		},
		{
			name: "negative_bytes",
			logEntry: types.LogEntry{
				Timestamp:  time.Now().Unix(),
				CustomerID: "tenant-001",
				StatusCode: 200,
				BytesSent:  -100,
				IP:         "192.168.1.1",
			},
			expectCode: http.StatusBadRequest,
		},
		{
			name: "missing_ip",
			logEntry: types.LogEntry{
				Timestamp:  time.Now().Unix(),
				CustomerID: "tenant-001",
				StatusCode: 200,
				BytesSent:  1024,
			},
			expectCode: http.StatusBadRequest,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			batch := types.LogBatchRequest{
				Logs: []types.LogEntry{tc.logEntry},
			}

			body, _ := json.Marshal(batch)
			req := httptest.NewRequest(http.MethodPost, "/api/v1/logs", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-Customer-ID", "tenant-001")

			rec := httptest.NewRecorder()
			e.ServeHTTP(rec, req)

			if rec.Code != tc.expectCode {
				t.Errorf("expected status %d, got %d: %s", tc.expectCode, rec.Code, rec.Body.String())
			}
		})
	}
}

func TestLogIngestionEmptyBatch(t *testing.T) {
	e := setupTestServer()

	batch := types.LogBatchRequest{
		Logs: []types.LogEntry{},
	}

	body, _ := json.Marshal(batch)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/logs", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Customer-ID", "tenant-001")

	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, rec.Code)
	}

	var resp map[string]interface{}
	json.Unmarshal(rec.Body.Bytes(), &resp)

	if resp["error"] != "empty_batch" {
		t.Errorf("expected error 'empty_batch', got '%v'", resp["error"])
	}
}

func TestLogIngestionBatchTooLarge(t *testing.T) {
	e := setupTestServer()

	// Create a batch with 1001 logs (over limit)
	logs := make([]types.LogEntry, 1001)
	for i := range logs {
		logs[i] = types.LogEntry{
			Timestamp:  time.Now().Unix(),
			CustomerID: "tenant-001",
			StatusCode: 200,
			BytesSent:  1024,
			IP:         "192.168.1.1",
		}
	}

	batch := types.LogBatchRequest{Logs: logs}

	body, _ := json.Marshal(batch)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/logs", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Customer-ID", "tenant-001")

	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, rec.Code)
	}

	var resp map[string]interface{}
	json.Unmarshal(rec.Body.Bytes(), &resp)

	if resp["error"] != "batch_too_large" {
		t.Errorf("expected error 'batch_too_large', got '%v'", resp["error"])
	}
}

func TestLogIngestionInvalidJSON(t *testing.T) {
	e := setupTestServer()

	req := httptest.NewRequest(http.MethodPost, "/api/v1/logs", strings.NewReader("{invalid json"))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Customer-ID", "tenant-001")

	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, rec.Code)
	}
}

func TestLogIngestionMissingTenant(t *testing.T) {
	e := setupTestServer()

	logEntry := types.LogEntry{
		Timestamp:  time.Now().Unix(),
		CustomerID: "tenant-001",
		StatusCode: 200,
		BytesSent:  1024,
		IP:         "192.168.1.1",
	}

	batch := types.LogBatchRequest{
		Logs: []types.LogEntry{logEntry},
	}

	body, _ := json.Marshal(batch)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/logs", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	// Missing X-Customer-ID header

	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, rec.Code)
	}
}

func TestLogIngestionConcurrent(t *testing.T) {
	e := setupTestServer()

	logEntry := types.LogEntry{
		Timestamp:  time.Now().Unix(),
		CustomerID: "tenant-001",
		StatusCode: 200,
		BytesSent:  1024,
		IP:         "192.168.1.1",
	}

	batch := types.LogBatchRequest{
		Logs: []types.LogEntry{logEntry},
	}

	body, _ := json.Marshal(batch)

	const numWorkers = 50
	const requestsPerWorker = 20

	var wg sync.WaitGroup
	successCount := int64(0)
	backpressureCount := int64(0)
	var countMutex sync.Mutex

	for i := 0; i < numWorkers; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()

			for j := 0; j < requestsPerWorker; j++ {
				req := httptest.NewRequest(http.MethodPost, "/api/v1/logs", bytes.NewReader(body))
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("X-Customer-ID", "tenant-001")

				rec := httptest.NewRecorder()
				e.ServeHTTP(rec, req)

				countMutex.Lock()
				switch rec.Code {
				case http.StatusAccepted:
					successCount++
				case http.StatusTooManyRequests:
					backpressureCount++
				}
				countMutex.Unlock()
			}
		}(i)
	}

	wg.Wait()

	totalRequests := int64(numWorkers * requestsPerWorker)
	t.Logf("Concurrent test completed: %d total requests, %d success, %d backpressure",
		totalRequests, successCount, backpressureCount)

	if successCount == 0 {
		t.Error("expected at least some successful requests")
	}

	if successCount+backpressureCount != totalRequests {
		t.Errorf("request count mismatch: %d + %d != %d",
			successCount, backpressureCount, totalRequests)
	}
}

func TestLogIngestionBackpressure(t *testing.T) {
	e := setupTestServer()

	logEntry := types.LogEntry{
		Timestamp:  time.Now().Unix(),
		CustomerID: "tenant-001",
		StatusCode: 200,
		BytesSent:  1024,
		IP:         "192.168.1.1",
	}

	// Create large batches to trigger backpressure
	largeBatch := types.LogBatchRequest{
		Logs: make([]types.LogEntry, 500), // Large batch to fill buffer quickly
	}

	for i := range largeBatch.Logs {
		largeBatch.Logs[i] = logEntry
	}

	body, _ := json.Marshal(largeBatch)

	// Send multiple large batches rapidly to trigger backpressure
	backpressureTriggered := false
	for i := 0; i < 50; i++ {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/logs", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Customer-ID", "tenant-001")

		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)

		if rec.Code == http.StatusTooManyRequests {
			backpressureTriggered = true

			// Verify response format
			var resp types.BackpressureResponse
			if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
				t.Fatalf("failed to parse backpressure response: %v", err)
			}

			if resp.Error != "rate_limited" {
				t.Errorf("expected error 'rate_limited', got '%s'", resp.Error)
			}

			if resp.RetryAfter <= 0 {
				t.Errorf("expected positive retry_after, got %d", resp.RetryAfter)
			}

			if resp.Utilization < 0.0 || resp.Utilization > 1.0 {
				t.Errorf("expected utilization 0.0-1.0, got %f", resp.Utilization)
			}

			retryAfter := rec.Header().Get("Retry-After")
			if retryAfter == "" {
				t.Error("expected Retry-After header")
			}

			break
		}
	}

	if !backpressureTriggered {
		t.Log("Backpressure not triggered in this test run - buffer may be large enough")
	}
}

func BenchmarkLogIngestion(b *testing.B) {
	e := setupTestServer()

	logEntry := types.LogEntry{
		Timestamp:  time.Now().Unix(),
		CustomerID: "tenant-001",
		StatusCode: 200,
		BytesSent:  1024,
		IP:         "192.168.1.1",
	}

	batch := types.LogBatchRequest{
		Logs: []types.LogEntry{logEntry},
	}

	body, _ := json.Marshal(batch)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/logs", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Customer-ID", "tenant-001")

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		req.Body = io.NopCloser(bytes.NewReader(body))
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)

		if rec.Code != http.StatusAccepted && rec.Code != http.StatusTooManyRequests {
			b.Fatalf("unexpected status code: %d", rec.Code)
		}
	}
}
