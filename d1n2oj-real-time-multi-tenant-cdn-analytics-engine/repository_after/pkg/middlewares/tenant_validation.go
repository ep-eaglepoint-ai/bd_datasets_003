package middlewares

import (
	"log/slog"
	"net/http"
	"regexp"
	"sync"
	"time"

	"github.com/labstack/echo/v5"
)


type TenantCache struct {
	mu            sync.RWMutex
	tenants       map[string]*TenantInfo
	lastRefresh   time.Time
	refreshPeriod time.Duration
	logger        *slog.Logger
}


type TenantInfo struct {
	ID        string
	Name      string
	Active    bool
	RateLimit int
	CachedAt  time.Time
}


func NewTenantCache(logger *slog.Logger) *TenantCache {
	tc := &TenantCache{
		tenants:       make(map[string]*TenantInfo),
		refreshPeriod: 5 * time.Minute,
		logger:        logger,
	}
	tc.loadMockTenants()
	go tc.backgroundRefresh()

	return tc
}

func (tc *TenantCache) loadMockTenants() {
	tc.mu.Lock()
	defer tc.mu.Unlock()

	now := time.Now()
	mockTenants := []TenantInfo{
		{ID: "tenant-001", Name: "Acme Corp", Active: true, RateLimit: 10000},
		{ID: "tenant-002", Name: "Beta Inc", Active: true, RateLimit: 5000},
		{ID: "tenant-003", Name: "Gamma LLC", Active: true, RateLimit: 8000},
		{ID: "tenant-004", Name: "Delta Co", Active: false, RateLimit: 3000},
		{ID: "tenant-005", Name: "Epsilon Ltd", Active: true, RateLimit: 15000},
	}

	for i := 6; i <= 55; i++ {
		mockTenants = append(mockTenants, TenantInfo{
			ID:        generateTenantID(i),
			Name:      generateTenantName(i),
			Active:    i%10 != 0,
			RateLimit: 5000 + (i * 100),
		})
	}

	tc.tenants = make(map[string]*TenantInfo, len(mockTenants))
	for _, t := range mockTenants {
		tenant := t
		tenant.CachedAt = now
		tc.tenants[t.ID] = &tenant
	}

	tc.lastRefresh = now
	tc.logger.Info("tenant cache refreshed",
		"tenant_count", len(tc.tenants),
		"refresh_time", now.Format(time.RFC3339),
	)
}

func generateTenantID(n int) string {
	return "tenant-" + padNumber(n)
}

func generateTenantName(n int) string {
	return "Company " + padNumber(n)
}

func padNumber(n int) string {
	if n < 10 {
		return "00" + itoa(n)
	} else if n < 100 {
		return "0" + itoa(n)
	}
	return itoa(n)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var digits []byte
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	return string(digits)
}

func (tc *TenantCache) backgroundRefresh() {
	ticker := time.NewTicker(tc.refreshPeriod)
	defer ticker.Stop()

	for range ticker.C {
		tc.loadMockTenants()
	}
}

func (tc *TenantCache) Validate(tenantID string) (bool, *TenantInfo, error) {
	tc.mu.RLock()
	defer tc.mu.RUnlock()

	tenant, exists := tc.tenants[tenantID]
	if !exists {
		return false, nil, nil
	}

	if !tenant.Active {
		return false, tenant, nil
	}

	return true, tenant, nil
}

func (tc *TenantCache) GetAllTenants() []*TenantInfo {
	tc.mu.RLock()
	defer tc.mu.RUnlock()

	result := make([]*TenantInfo, 0, len(tc.tenants))
	for _, t := range tc.tenants {
		result = append(result, t)
	}
	return result
}


func (tc *TenantCache) TenantCount() int {
	tc.mu.RLock()
	defer tc.mu.RUnlock()
	return len(tc.tenants)
}


func (tc *TenantCache) LastRefreshTime() time.Time {
	tc.mu.RLock()
	defer tc.mu.RUnlock()
	return tc.lastRefresh
}

var tenantIDRegex = regexp.MustCompile(`^tenant-\d{3,}$`)


func TenantValidation(cache *TenantCache) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			tenantID := (*c).Request().Header.Get("X-Customer-ID")


			if tenantID == "" {
				tenantID = (*c).Request().Header.Get("X-Tenant-ID")
			}

			if tenantID == "" {
				return (*c).JSON(http.StatusBadRequest, map[string]interface{}{
					"error":   "missing_customer_id",
					"message": "X-Customer-ID header is required",
				})
			}

			if !tenantIDRegex.MatchString(tenantID) {
				cache.logger.Warn("malformed tenant ID received",
					"tenant_id", tenantID,
					"remote_ip", (*c).RealIP(),
				)
				return (*c).JSON(http.StatusBadRequest, map[string]interface{}{
					"error":   "invalid_customer_id_format",
					"message": "Customer ID must match format: tenant-XXX",
				})
			}
			valid, tenant, err := cache.Validate(tenantID)
			if err != nil {
				cache.logger.Error("tenant validation error",
					"tenant_id", tenantID,
					"error", err,
				)
				return (*c).JSON(http.StatusInternalServerError, map[string]interface{}{
					"error":   "validation_error",
					"message": "Unable to validate customer ID",
				})
			}

			if tenant == nil {
				cache.logger.Warn("unknown tenant ID",
					"tenant_id", tenantID,
					"remote_ip", (*c).RealIP(),
				)
				return (*c).JSON(http.StatusUnauthorized, map[string]interface{}{
					"error":   "unknown_customer",
					"message": "Customer ID not found",
				})
			}

			if !valid {
				cache.logger.Warn("inactive tenant attempted access",
					"tenant_id", tenantID,
					"tenant_name", tenant.Name,
					"remote_ip", (*c).RealIP(),
				)
				return (*c).JSON(http.StatusUnauthorized, map[string]interface{}{
					"error":   "inactive_customer",
					"message": "Customer account is inactive",
				})
			}

			(*c).Set("tenant_id", tenantID)
			(*c).Set("tenant_info", tenant)

			return next(c)
		}
	}
}

func GetTenantID(c *echo.Context) string {
	if tenantID, ok := (*c).Get("tenant_id").(string); ok {
		return tenantID
	}
	return ""
}

// GetTenantInfo retrieves tenant info from Echo context
func GetTenantInfo(c *echo.Context) *TenantInfo {
	if info, ok := (*c).Get("tenant_info").(*TenantInfo); ok {
		return info
	}
	return nil
}
