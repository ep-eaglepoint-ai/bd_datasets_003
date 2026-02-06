package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"webhook-delivery-system/internal/database"
	"webhook-delivery-system/internal/delivery"
	"webhook-delivery-system/internal/metrics"
	"webhook-delivery-system/internal/models"
	"webhook-delivery-system/internal/queue"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type Handler struct {
	db              *database.DB
	queue           *queue.RedisQueue
	deliveryService *delivery.Service
	metrics         *metrics.Collector
}

func New(db *database.DB, q *queue.RedisQueue, ds *delivery.Service, m *metrics.Collector) *Handler {
	return &Handler{
		db:              db,
		queue:           q,
		deliveryService: ds,
		metrics:         m,
	}
}

type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message,omitempty"`
}

type SuccessResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, err string, message string) {
	writeJSON(w, status, ErrorResponse{Error: err, Message: message})
}

type CreateWebhookRequest struct {
	CustomerID string `json:"customer_id"`
	URL        string `json:"url"`
	Secret     string `json:"secret"`
}

type WebhookResponse struct {
	ID         string    `json:"id"`
	CustomerID string    `json:"customer_id"`
	URL        string    `json:"url"`
	CreatedAt  time.Time `json:"created_at"`
	IsActive   bool      `json:"is_active"`
}

func (h *Handler) CreateWebhook(w http.ResponseWriter, r *http.Request) {
	var req CreateWebhookRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "Invalid JSON body")
		return
	}

	if req.CustomerID == "" || req.URL == "" || req.Secret == "" {
		writeError(w, http.StatusBadRequest, "missing_fields", "customer_id, url, and secret are required")
		return
	}

	webhook := &models.Webhook{
		ID:         uuid.New().String(),
		CustomerID: req.CustomerID,
		URL:        req.URL,
		Secret:     req.Secret,
		CreatedAt:  time.Now(),
		IsActive:   true,
	}

	if err := h.db.CreateWebhook(r.Context(), webhook); err != nil {
		writeError(w, http.StatusInternalServerError, "database_error", "Failed to create webhook")
		return
	}

	writeJSON(w, http.StatusCreated, SuccessResponse{
		Success: true,
		Data: WebhookResponse{
			ID:         webhook.ID,
			CustomerID: webhook.CustomerID,
			URL:        webhook.URL,
			CreatedAt:  webhook.CreatedAt,
			IsActive:   webhook.IsActive,
		},
	})
}

func (h *Handler) GetWebhook(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	
	webhook, err := h.db.GetWebhook(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "Webhook not found")
		return
	}

	writeJSON(w, http.StatusOK, SuccessResponse{
		Success: true,
		Data: WebhookResponse{
			ID:         webhook.ID,
			CustomerID: webhook.CustomerID,
			URL:        webhook.URL,
			CreatedAt:  webhook.CreatedAt,
			IsActive:   webhook.IsActive,
		},
	})
}

type UpdateWebhookRequest struct {
	URL      string `json:"url,omitempty"`
	Secret   string `json:"secret,omitempty"`
	IsActive *bool  `json:"is_active,omitempty"`
}

func (h *Handler) UpdateWebhook(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	
	webhook, err := h.db.GetWebhook(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "Webhook not found")
		return
	}

	var req UpdateWebhookRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "Invalid JSON body")
		return
	}

	if req.URL != "" {
		webhook.URL = req.URL
	}
	if req.Secret != "" {
		webhook.Secret = req.Secret
	}
	if req.IsActive != nil {
		webhook.IsActive = *req.IsActive
	}

	if err := h.db.UpdateWebhook(r.Context(), webhook); err != nil {
		writeError(w, http.StatusInternalServerError, "database_error", "Failed to update webhook")
		return
	}

	writeJSON(w, http.StatusOK, SuccessResponse{
		Success: true,
		Data: WebhookResponse{
			ID:         webhook.ID,
			CustomerID: webhook.CustomerID,
			URL:        webhook.URL,
			CreatedAt:  webhook.CreatedAt,
			IsActive:   webhook.IsActive,
		},
	})
}

func (h *Handler) DeleteWebhook(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	
	if err := h.db.DeleteWebhook(r.Context(), id); err != nil {
		writeError(w, http.StatusNotFound, "not_found", "Webhook not found")
		return
	}

	writeJSON(w, http.StatusOK, SuccessResponse{Success: true})
}

func (h *Handler) ListWebhooks(w http.ResponseWriter, r *http.Request) {
	customerID := r.URL.Query().Get("customer_id")
	
	webhooks, err := h.db.ListWebhooks(r.Context(), customerID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database_error", "Failed to list webhooks")
		return
	}

	var response []WebhookResponse
	for _, w := range webhooks {
		response = append(response, WebhookResponse{
			ID:         w.ID,
			CustomerID: w.CustomerID,
			URL:        w.URL,
			CreatedAt:  w.CreatedAt,
			IsActive:   w.IsActive,
		})
	}

	writeJSON(w, http.StatusOK, SuccessResponse{Success: true, Data: response})
}

type CreateEventRequest struct {
	WebhookID string          `json:"webhook_id"`
	EventType string          `json:"event_type"`
	Payload   json.RawMessage `json:"payload"`
}

type EventResponse struct {
	ID        string          `json:"id"`
	WebhookID string          `json:"webhook_id"`
	EventType string          `json:"event_type"`
	Payload   json.RawMessage `json:"payload"`
	CreatedAt time.Time       `json:"created_at"`
}

type DeliveryResponse struct {
	ID            string    `json:"id"`
	EventID       string    `json:"event_id"`
	AttemptNumber int       `json:"attempt_number"`
	Status        string    `json:"status"`
	CreatedAt     time.Time `json:"created_at"`
}

func (h *Handler) CreateEvent(w http.ResponseWriter, r *http.Request) {
	var req CreateEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "Invalid JSON body")
		return
	}

	if req.WebhookID == "" || req.EventType == "" || len(req.Payload) == 0 {
		writeError(w, http.StatusBadRequest, "missing_fields", "webhook_id, event_type, and payload are required")
		return
	}

	webhook, err := h.db.GetWebhook(r.Context(), req.WebhookID)
	if err != nil {
		writeError(w, http.StatusNotFound, "webhook_not_found", "Webhook not found")
		return
	}

	if !webhook.IsActive {
		writeError(w, http.StatusBadRequest, "webhook_inactive", "Webhook is not active")
		return
	}

	event := &models.Event{
		WebhookID: req.WebhookID,
		EventType: req.EventType,
		Payload:   req.Payload,
	}

	del, err := h.deliveryService.CreateEventAndEnqueue(r.Context(), event)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "delivery_error", "Failed to create event and delivery")
		return
	}

	writeJSON(w, http.StatusCreated, SuccessResponse{
		Success: true,
		Data: map[string]interface{}{
			"event": EventResponse{
				ID:        event.ID,
				WebhookID: event.WebhookID,
				EventType: event.EventType,
				Payload:   event.Payload,
				CreatedAt: event.CreatedAt,
			},
			"delivery": DeliveryResponse{
				ID:            del.ID,
				EventID:       del.EventID,
				AttemptNumber: del.AttemptNumber,
				Status:        string(del.Status),
				CreatedAt:     del.CreatedAt,
			},
		},
	})
}

func (h *Handler) GetEvent(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	
	event, err := h.db.GetEvent(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "Event not found")
		return
	}

	deliveries, err := h.db.GetDeliveriesByEventID(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database_error", "Failed to get deliveries")
		return
	}

	var deliveryResponses []DeliveryResponse
	for _, d := range deliveries {
		deliveryResponses = append(deliveryResponses, DeliveryResponse{
			ID:            d.ID,
			EventID:       d.EventID,
			AttemptNumber: d.AttemptNumber,
			Status:        string(d.Status),
			CreatedAt:     d.CreatedAt,
		})
	}

	writeJSON(w, http.StatusOK, SuccessResponse{
		Success: true,
		Data: map[string]interface{}{
			"event": EventResponse{
				ID:        event.ID,
				WebhookID: event.WebhookID,
				EventType: event.EventType,
				Payload:   event.Payload,
				CreatedAt: event.CreatedAt,
			},
			"deliveries": deliveryResponses,
		},
	})
}

type DeliveryDetailResponse struct {
	ID             string     `json:"id"`
	EventID        string     `json:"event_id"`
	AttemptNumber  int        `json:"attempt_number"`
	Status         string     `json:"status"`
	RequestHeaders string     `json:"request_headers,omitempty"`
	RequestBody    string     `json:"request_body,omitempty"`
	ResponseStatus int        `json:"response_status,omitempty"`
	ResponseBody   string     `json:"response_body,omitempty"`
	ResponseTimeMs int64      `json:"response_time_ms,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	NextRetryAt    *time.Time `json:"next_retry_at,omitempty"`
}

func (h *Handler) GetDelivery(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	
	del, err := h.db.GetDelivery(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "Delivery not found")
		return
	}

	writeJSON(w, http.StatusOK, SuccessResponse{
		Success: true,
		Data: DeliveryDetailResponse{
			ID:             del.ID,
			EventID:        del.EventID,
			AttemptNumber:  del.AttemptNumber,
			Status:         string(del.Status),
			RequestHeaders: del.RequestHeaders,
			RequestBody:    del.RequestBody,
			ResponseStatus: del.ResponseStatus,
			ResponseBody:   del.ResponseBody,
			ResponseTimeMs: del.ResponseTimeMs,
			CreatedAt:      del.CreatedAt,
			NextRetryAt:    del.NextRetryAt,
		},
	})
}

func (h *Handler) GetDeliveryLogs(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	
	logs, err := h.db.GetDeliveryLogs(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "Delivery not found")
		return
	}

	writeJSON(w, http.StatusOK, SuccessResponse{Success: true, Data: logs})
}

func (h *Handler) ReplayDelivery(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	
	newDelivery, err := h.deliveryService.ReplayDelivery(r.Context(), id)
	if err != nil {
		// Check if it's a status restriction error
		errStr := err.Error()
		if len(errStr) > 20 && errStr[:20] == "can only replay fail" {
			writeError(w, http.StatusBadRequest, "invalid_status", err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "replay_error", "Failed to replay delivery")
		return
	}

	writeJSON(w, http.StatusCreated, SuccessResponse{
		Success: true,
		Data: DeliveryResponse{
			ID:            newDelivery.ID,
			EventID:       newDelivery.EventID,
			AttemptNumber: newDelivery.AttemptNumber,
			Status:        string(newDelivery.Status),
			CreatedAt:     newDelivery.CreatedAt,
		},
	})
}

type DeadLetterResponse struct {
	ID         string    `json:"id"`
	DeliveryID string    `json:"delivery_id"`
	Reason     string    `json:"reason"`
	CreatedAt  time.Time `json:"created_at"`
}

func (h *Handler) ListDeadLetters(w http.ResponseWriter, r *http.Request) {
	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")
	
	limit := 50
	offset := 0
	
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}
	if offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
			offset = o
		}
	}

	deadLetters, err := h.db.ListDeadLetters(r.Context(), limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database_error", "Failed to list dead letters")
		return
	}

	var response []DeadLetterResponse
	for _, dl := range deadLetters {
		response = append(response, DeadLetterResponse{
			ID:         dl.ID,
			DeliveryID: dl.DeliveryID,
			Reason:     dl.Reason,
			CreatedAt:  dl.CreatedAt,
		})
	}

	writeJSON(w, http.StatusOK, SuccessResponse{Success: true, Data: response})
}

func (h *Handler) ReplayDeadLetter(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	
	newDelivery, err := h.deliveryService.ReplayDeadLetter(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "replay_error", "Failed to replay dead letter")
		return
	}

	writeJSON(w, http.StatusCreated, SuccessResponse{
		Success: true,
		Data: DeliveryResponse{
			ID:            newDelivery.ID,
			EventID:       newDelivery.EventID,
			AttemptNumber: newDelivery.AttemptNumber,
			Status:        string(newDelivery.Status),
			CreatedAt:     newDelivery.CreatedAt,
		},
	})
}

func (h *Handler) GetMetrics(w http.ResponseWriter, r *http.Request) {
	stats := h.metrics.GetStats()
	
	deadLetterCount, err := h.db.CountDeadLetters(r.Context())
	if err == nil {
		stats.DeadLetterCount = deadLetterCount
	}

	writeJSON(w, http.StatusOK, SuccessResponse{Success: true, Data: stats})
}

func (h *Handler) HealthCheck(w http.ResponseWriter, r *http.Request) {
	queueSize, _ := h.queue.Size(r.Context())
	processingCount, _ := h.queue.ProcessingCount(r.Context())

	writeJSON(w, http.StatusOK, SuccessResponse{
		Success: true,
		Data: map[string]interface{}{
			"status":           "healthy",
			"queue_size":       queueSize,
			"processing_count": processingCount,
			"timestamp":        time.Now().Unix(),
		},
	})
}
