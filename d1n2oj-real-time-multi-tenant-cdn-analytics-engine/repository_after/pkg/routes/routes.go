package routes

import (
	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/handlers"
	pkgmw "github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/middlewares"
	"github.com/labstack/echo/v5"
)


func Setup(e *echo.Echo, h *handlers.Handler, tenantCache *pkgmw.TenantCache) {

	e.GET("/health", func(c *echo.Context) error { return h.HealthCheck(c) })
	e.GET("/ready", func(c *echo.Context) error { return h.ReadinessCheck(c) })

	v1 := e.Group("/api/v1")


	analytics := v1.Group("/analytics")
	analytics.Use(pkgmw.TenantValidation(tenantCache))
	{
		analytics.POST("/events", func(c *echo.Context) error { return h.IngestEvents(c) })
		analytics.GET("/stats", func(c *echo.Context) error { return h.GetStats(c) })
		analytics.GET("/traffic", func(c *echo.Context) error { return h.GetTrafficData(c) })
	}


	logs := v1.Group("/logs")
	logs.Use(pkgmw.TenantValidation(tenantCache))
	logs.POST("", func(c *echo.Context) error { return h.IngestLogs(c) })


	v1.GET("/metrics/:customer_id", func(c *echo.Context) error { return h.GetCustomerMetrics(c) })


	admin := v1.Group("/admin")
	{
		admin.GET("/tenants", func(c *echo.Context) error { return h.ListTenants(c) })
		admin.GET("/metrics", func(c *echo.Context) error { return h.GetMetrics(c) })
	}
}
