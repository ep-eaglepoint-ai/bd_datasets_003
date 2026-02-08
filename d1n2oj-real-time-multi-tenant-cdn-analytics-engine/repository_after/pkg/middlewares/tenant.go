package middlewares

import (
	"net/http"

	"github.com/labstack/echo/v5"
)


func TenantContext() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			tenantID := (*c).Request().Header.Get("X-Tenant-ID")
			if tenantID == "" {
				return (*c).JSON(http.StatusBadRequest, map[string]string{
					"error": "X-Tenant-ID header is required",
				})
			}
			(*c).Set("tenant_id", tenantID)

			return next(c)
		}
	}
}
