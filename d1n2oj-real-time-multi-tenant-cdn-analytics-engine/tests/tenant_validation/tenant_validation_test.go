package tenant_validation_test

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/middlewares"
	"github.com/labstack/echo/v5"
)

func newTestLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func setupEchoWithMiddleware(cache *middlewares.TenantCache) *echo.Echo {
	e := echo.New()
	e.Use(middlewares.TenantValidation(cache))
	e.GET("/test", func(c *echo.Context) error {
		tenantID := middlewares.GetTenantID(c)
		return (*c).JSON(http.StatusOK, map[string]string{
			"tenant_id": tenantID,
			"status":    "ok",
		})
	})
	return e
}

// TestMissingCustomerIDHeader tests that missing X-Customer-ID returns 400
func TestMissingCustomerIDHeader(t *testing.T) {
	logger := newTestLogger()
	cache := middlewares.NewTenantCache(logger)
	e := setupEchoWithMiddleware(cache)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, rec.Code)
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if resp["error"] != "missing_customer_id" {
		t.Errorf("expected error 'missing_customer_id', got '%v'", resp["error"])
	}
}

// TestMalformedCustomerIDFormat tests that invalid format returns 400
func TestMalformedCustomerIDFormat(t *testing.T) {
	logger := newTestLogger()
	cache := middlewares.NewTenantCache(logger)
	e := setupEchoWithMiddleware(cache)

	testCases := []struct {
		name     string
		tenantID string
	}{
		{"wrong_format", "customer-001"},
		{"sql_injection", "tenant-001'; DROP TABLE--"},
		{"too_short", "tenant-01"},
		{"special_chars", "tenant-@#$"},
		{"spaces", "tenant- 001"},
		{"unicode", "tenant-日本語"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/test", nil)
			req.Header.Set("X-Customer-ID", tc.tenantID)
			rec := httptest.NewRecorder()
			e.ServeHTTP(rec, req)

			if rec.Code != http.StatusBadRequest {
				t.Errorf("expected status %d for '%s', got %d", http.StatusBadRequest, tc.tenantID, rec.Code)
			}
		})
	}
}

// TestUnknownTenantReturns401 tests that unknown tenant returns 401
func TestUnknownTenantReturns401(t *testing.T) {
	logger := newTestLogger()
	cache := middlewares.NewTenantCache(logger)
	e := setupEchoWithMiddleware(cache)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("X-Customer-ID", "tenant-999")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected status %d, got %d", http.StatusUnauthorized, rec.Code)
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if resp["error"] != "unknown_customer" {
		t.Errorf("expected error 'unknown_customer', got '%v'", resp["error"])
	}
}

// TestInactiveTenantReturns401 tests that inactive tenant returns 401
func TestInactiveTenantReturns401(t *testing.T) {
	logger := newTestLogger()
	cache := middlewares.NewTenantCache(logger)
	e := setupEchoWithMiddleware(cache)

	// tenant-004 is configured as inactive in mock data
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("X-Customer-ID", "tenant-004")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected status %d, got %d", http.StatusUnauthorized, rec.Code)
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if resp["error"] != "inactive_customer" {
		t.Errorf("expected error 'inactive_customer', got '%v'", resp["error"])
	}
}

// TestValidTenantAllowed tests that valid tenant passes through
func TestValidTenantAllowed(t *testing.T) {
	logger := newTestLogger()
	cache := middlewares.NewTenantCache(logger)
	e := setupEchoWithMiddleware(cache)

	// tenant-001 is configured as active in mock data
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("X-Customer-ID", "tenant-001")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d: %s", http.StatusOK, rec.Code, rec.Body.String())
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if resp["tenant_id"] != "tenant-001" {
		t.Errorf("expected tenant_id 'tenant-001', got '%v'", resp["tenant_id"])
	}
}

// TestBackwardsCompatibilityWithXTenantID tests X-Tenant-ID fallback
func TestBackwardsCompatibilityWithXTenantID(t *testing.T) {
	logger := newTestLogger()
	cache := middlewares.NewTenantCache(logger)
	e := setupEchoWithMiddleware(cache)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("X-Tenant-ID", "tenant-002")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d: %s", http.StatusOK, rec.Code, rec.Body.String())
	}
}

// TestCacheHas50PlusTenants verifies cache holds 50+ tenants
func TestCacheHas50PlusTenants(t *testing.T) {
	logger := newTestLogger()
	cache := middlewares.NewTenantCache(logger)

	count := cache.TenantCount()
	if count < 50 {
		t.Errorf("expected at least 50 tenants, got %d", count)
	}

	t.Logf("Cache contains %d tenants", count)
}

// TestConcurrentValidation tests thread-safety under concurrent access
func TestConcurrentValidation(t *testing.T) {
	logger := newTestLogger()
	cache := middlewares.NewTenantCache(logger)
	e := setupEchoWithMiddleware(cache)

	const numGoroutines = 100
	const requestsPerGoroutine = 50

	var wg sync.WaitGroup
	errCount := 0
	var errMu sync.Mutex

	tenantIDs := []string{"tenant-001", "tenant-002", "tenant-003", "tenant-005"}

	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for j := 0; j < requestsPerGoroutine; j++ {
				tenantID := tenantIDs[(id+j)%len(tenantIDs)]
				req := httptest.NewRequest(http.MethodGet, "/test", nil)
				req.Header.Set("X-Customer-ID", tenantID)
				rec := httptest.NewRecorder()
				e.ServeHTTP(rec, req)

				if rec.Code != http.StatusOK {
					errMu.Lock()
					errCount++
					errMu.Unlock()
				}
			}
		}(i)
	}

	wg.Wait()

	if errCount > 0 {
		t.Errorf("total failed requests: %d out of %d", errCount, numGoroutines*requestsPerGoroutine)
	}
}

// BenchmarkTenantValidation benchmarks validation performance
func BenchmarkTenantValidation(b *testing.B) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	cache := middlewares.NewTenantCache(logger)
	e := setupEchoWithMiddleware(cache)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("X-Customer-ID", "tenant-001")

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)
	}
}

// TestCacheRefreshTime verifies last refresh time is set
func TestCacheRefreshTime(t *testing.T) {
	logger := newTestLogger()
	before := time.Now()
	cache := middlewares.NewTenantCache(logger)
	after := time.Now()

	refreshTime := cache.LastRefreshTime()

	if refreshTime.Before(before) || refreshTime.After(after) {
		t.Errorf("refresh time %v not between %v and %v", refreshTime, before, after)
	}
}


func TestMain(m *testing.M) {
	os.Exit(m.Run())
}
