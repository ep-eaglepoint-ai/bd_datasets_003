package middlewares

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/labstack/echo/v5/middleware"
)

func Setup(e *echo.Echo, logger *slog.Logger) {

	e.Use(middleware.Recover())
	e.Use(middleware.RequestID())
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{"*"},
		AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodOptions},
		AllowHeaders: []string{echo.HeaderContentType, echo.HeaderAuthorization, "X-Tenant-ID"},
	}))
	e.Use(RequestLogger(logger))
}

func RequestLogger(logger *slog.Logger) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			start := time.Now()

			err := next(c)

			req := (*c).Request()

			logger.Info("request",
				"method", req.Method,
				"uri", req.RequestURI,
				"latency_ms", time.Since(start).Milliseconds(),
				"request_id", (*c).Response().Header().Get(echo.HeaderXRequestID),
				"remote_ip", (*c).RealIP(),
			)

			return err
		}
	}
}
