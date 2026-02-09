package handlers

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/middlewares"
	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/service"
	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/types"
	"github.com/labstack/echo/v5"
)

type Handler struct {
	svc    *service.Service
	logger *slog.Logger
}


func New(svc *service.Service, logger *slog.Logger) *Handler {
	return &Handler{
		svc:    svc,
		logger: logger,
	}
}


func (h *Handler) GetCustomerMetrics(c *echo.Context) error {
	customerID := (*c).Param("customer_id")
	if customerID == "" {
		return (*c).JSON(http.StatusBadRequest, map[string]string{
			"error":   "missing_customer_id",
			"message": "customer_id path parameter is required",
		})
	}

		// Optional query param: minutes (default 15)
	minutesStr := (*c).QueryParam("minutes")
	minutes := 15
	if minutesStr != "" {
		if m, err := strconv.Atoi(minutesStr); err == nil && m > 0 && m <= 15 {
			minutes = m
		}
	}

	summary, err := h.svc.QueryCustomerMetrics((*c).Request().Context(), customerID, minutes)
	if err != nil {
		h.logger.Error("failed to query customer metrics",
			"customer_id", customerID,
			"error", err,
		)
		return (*c).JSON(http.StatusInternalServerError, map[string]string{
			"error":   "query_failed",
			"message": "Failed to retrieve customer metrics",
		})
	}

	return (*c).JSON(http.StatusOK, summary)
}


func (h *Handler) HealthCheck(c *echo.Context) error {
	return (*c).JSON(http.StatusOK, map[string]string{
		"status": "healthy",
	})
}


func (h *Handler) ReadinessCheck(c *echo.Context) error {
	ready := h.svc.IsReady()
	status := http.StatusOK
	if !ready {
		status = http.StatusServiceUnavailable
	}

	return (*c).JSON(status, map[string]interface{}{
		"ready":      ready,
		"clickhouse": h.svc.IsClickHouseReady(),
		"geoip":      h.svc.IsGeoIPReady(),
	})
}


func (h *Handler) IngestEvents(c *echo.Context) error {
	tenantID := middlewares.GetTenantID(c)

	var events []map[string]interface{}
	if err := (*c).Bind(&events); err != nil {
		return (*c).JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	count, err := h.svc.IngestEvents((*c).Request().Context(), tenantID, events)
	if err != nil {
		h.logger.Error("failed to ingest events", "error", err, "tenant_id", tenantID)
		return (*c).JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to process events",
		})
	}

	return (*c).JSON(http.StatusAccepted, map[string]interface{}{
		"accepted": count,
		"message":  "events queued for processing",
	})
}


func (h *Handler) IngestLogs(c *echo.Context) error {
	tenantID := middlewares.GetTenantID(c)


	if h.svc.IsBackpressureTriggered() {
		utilization := h.svc.GetBufferUtilization()
		h.logger.Warn("backpressure triggered - rejecting request",
			"tenant_id", tenantID,
			"buffer_utilization", utilization,
			"remote_ip", (*c).RealIP(),
		)

		response := types.BackpressureResponse{
			Error:       "rate_limited",
			RetryAfter:  5,
			Utilization: utilization,
			Message:     "Server is under high load. Please retry after specified seconds.",
		}

		(*c).Response().Header().Set("Retry-After", strconv.Itoa(response.RetryAfter))
		return (*c).JSON(http.StatusTooManyRequests, response)
	}


	var req types.LogBatchRequest
	if err := (*c).Bind(&req); err != nil {
		h.logger.Debug("invalid request body", "error", err, "tenant_id", tenantID)
		return (*c).JSON(http.StatusBadRequest, map[string]string{
			"error":   "invalid_request_body",
			"message": "Request body must be valid JSON with 'logs' array",
		})
	}


	if len(req.Logs) == 0 {
		return (*c).JSON(http.StatusBadRequest, map[string]string{
			"error":   "empty_batch",
			"message": "Logs array cannot be empty",
		})
	}

	if len(req.Logs) > 1000 {
		return (*c).JSON(http.StatusBadRequest, map[string]string{
			"error":   "batch_too_large",
			"message": "Maximum batch size is 1000 logs",
		})
	}


	for i, log := range req.Logs {
		if err := h.validateLogEntry(&log); err != nil {
			return (*c).JSON(http.StatusBadRequest, map[string]interface{}{
				"error":     "validation_failed",
				"message":   err.Error(),
				"log_index": i,
			})
		}
	}


	err := h.svc.IngestLogs((*c).Request().Context(), tenantID, req.Logs)
	if err != nil {
		if err.Error() == "backpressure_triggered" || err.Error() == "buffer_full" || err.Error() == "rate_limited" {

			utilization := h.svc.GetBufferUtilization()
			h.logger.Warn("backpressure during ingestion",
				"error", err,
				"tenant_id", tenantID,
				"batch_size", len(req.Logs),
				"buffer_utilization", utilization,
			)

			response := types.BackpressureResponse{
				Error:       "rate_limited",
				RetryAfter:  5,
				Utilization: utilization,
				Message:     "Buffer capacity exceeded. Please retry after specified seconds.",
			}

			(*c).Response().Header().Set("Retry-After", strconv.Itoa(response.RetryAfter))
			return (*c).JSON(http.StatusTooManyRequests, response)
		}


		h.logger.Error("failed to ingest logs", "error", err, "tenant_id", tenantID)
		return (*c).JSON(http.StatusInternalServerError, map[string]string{
			"error":   "ingestion_failed",
			"message": "Failed to process log batch",
		})
	}


	return (*c).JSON(http.StatusAccepted, map[string]interface{}{
		"accepted":           len(req.Logs),
		"message":            "logs queued for processing",
		"buffer_utilization": h.svc.GetBufferUtilization(),
	})
}


func (h *Handler) GetStats(c *echo.Context) error {
	tenantID := middlewares.GetTenantID(c)

	stats, err := h.svc.GetStats((*c).Request().Context(), tenantID)
	if err != nil {
		h.logger.Error("failed to get stats", "error", err, "tenant_id", tenantID)
		return (*c).JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to retrieve stats",
		})
	}

	return (*c).JSON(http.StatusOK, stats)
}


func (h *Handler) GetTrafficData(c *echo.Context) error {
	tenantID := middlewares.GetTenantID(c)

	data, err := h.svc.GetTrafficData((*c).Request().Context(), tenantID)
	if err != nil {
		h.logger.Error("failed to get traffic data", "error", err, "tenant_id", tenantID)
		return (*c).JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to retrieve traffic data",
		})
	}

	return (*c).JSON(http.StatusOK, data)
}


func (h *Handler) ListTenants(c *echo.Context) error {
	tenants, err := h.svc.ListTenants((*c).Request().Context())
	if err != nil {
		h.logger.Error("failed to list tenants", "error", err)
		return (*c).JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to list tenants",
		})
	}

	return (*c).JSON(http.StatusOK, tenants)
}


func (h *Handler) GetMetrics(c *echo.Context) error {
	metrics := h.svc.GetMetrics()
	return (*c).JSON(http.StatusOK, metrics)
}


func (h *Handler) validateLogEntry(log *types.LogEntry) error {

	if log.Timestamp <= 0 {
		return errors.New("timestamp must be positive")
	}

	if log.CustomerID == "" {
		return errors.New("customer_id is required")
	}

	if log.StatusCode < 100 || log.StatusCode > 599 {
		return errors.New("status_code must be between 100-599")
	}

	if log.BytesSent < 0 {
		return errors.New("bytes_sent must be non-negative")
	}

	if log.IP == "" {
		return errors.New("ip is required")
	}

	if len(log.IP) < 7 || len(log.IP) > 45 {
		return errors.New("invalid ip format")
	}

	return nil
}
