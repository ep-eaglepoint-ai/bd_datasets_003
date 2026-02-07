package delivery

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"webhook-delivery-system/internal/database"
	"webhook-delivery-system/internal/metrics"
	"webhook-delivery-system/internal/models"
	"webhook-delivery-system/internal/queue"

	"github.com/google/uuid"
)

const (
	maxRetries           = 10
	maxBackoffDuration   = time.Hour
	httpTimeout          = 30 * time.Second
	workerPollInterval   = 100 * time.Millisecond
	maxResponseBodySize  = 64 * 1024
)

type Service struct {
	db             *database.DB
	queue          *queue.RedisQueue
	metrics        *metrics.Collector
	circuitBreaker *CircuitBreaker
	rateLimiter    *RateLimiter
	httpClient     *http.Client
}

func NewService(db *database.DB, q *queue.RedisQueue, m *metrics.Collector, cb *CircuitBreaker, rl *RateLimiter) *Service {
	return &Service{
		db:             db,
		queue:          q,
		metrics:        m,
		circuitBreaker: cb,
		rateLimiter:    rl,
		httpClient: &http.Client{
			Timeout: httpTimeout,
			Transport: &http.Transport{
				MaxIdleConns:        100,
				MaxIdleConnsPerHost: 10,
				IdleConnTimeout:     90 * time.Second,
			},
		},
	}
}

func (s *Service) CreateEventAndEnqueue(ctx context.Context, event *models.Event) (*models.Delivery, error) {
	event.ID = uuid.New().String()
	event.CreatedAt = time.Now()

	if err := s.db.CreateEvent(ctx, event); err != nil {
		return nil, fmt.Errorf("failed to create event: %w", err)
	}

	delivery := &models.Delivery{
		ID:            uuid.New().String(),
		EventID:       event.ID,
		AttemptNumber: 0,
		Status:        models.DeliveryStatusPending,
		CreatedAt:     time.Now(),
	}

	if err := s.db.CreateDelivery(ctx, delivery); err != nil {
		return nil, fmt.Errorf("failed to create delivery: %w", err)
	}

	webhook, err := s.db.GetWebhook(ctx, event.WebhookID)
	if err != nil {
		return nil, fmt.Errorf("failed to get webhook: %w", err)
	}

	queueItem := models.QueueItem{
		DeliveryID: delivery.ID,
		EventID:    event.ID,
		WebhookID:  webhook.ID,
		Score:      float64(time.Now().UnixNano()),
	}

	if err := s.queue.Enqueue(ctx, queueItem); err != nil {
		return nil, fmt.Errorf("failed to enqueue delivery: %w", err)
	}

	return delivery, nil
}

func (s *Service) StartWorker(ctx context.Context, workerID int) {
	log.Printf("Worker %d started", workerID)
	
	// Use a semaphore to limit concurrent deliveries per worker (non-blocking)
	const maxConcurrent = 10
	sem := make(chan struct{}, maxConcurrent)

	for {
		select {
		case <-ctx.Done():
			log.Printf("Worker %d stopped", workerID)
			return
		default:
			item, err := s.queue.Dequeue(ctx)
			if err != nil {
				log.Printf("Worker %d: error dequeuing: %v", workerID, err)
				time.Sleep(time.Second)
				continue
			}

			if item == nil {
				time.Sleep(workerPollInterval)
				continue
			}

			// Non-blocking: process delivery in a goroutine
			select {
			case sem <- struct{}{}:
				go func(item *models.QueueItem) {
					defer func() { <-sem }()
					s.processDelivery(ctx, item)
				}(item)
			default:
				// Semaphore full, reschedule for later processing
				if err := s.queue.Reschedule(ctx, *item, 100*time.Millisecond); err != nil {
					log.Printf("Worker %d: failed to reschedule item: %v", workerID, err)
				}
			}
		}
	}
}

func (s *Service) processDelivery(ctx context.Context, item *models.QueueItem) {
	defer func() {
		if err := s.queue.Complete(ctx, item.DeliveryID); err != nil {
			log.Printf("Failed to complete delivery %s: %v", item.DeliveryID, err)
		}
	}()

	delivery, event, webhook, err := s.db.GetDeliveryWithEventAndWebhook(ctx, item.DeliveryID)
	if err != nil {
		log.Printf("Failed to get delivery data for %s: %v", item.DeliveryID, err)
		return
	}

	if !webhook.IsActive {
		log.Printf("Webhook %s is inactive, skipping delivery %s", webhook.ID, item.DeliveryID)
		return
	}

	// Use AllowRequest for circuit breaker check with probe/test request support
	allowed, isProbe := s.circuitBreaker.AllowRequest(webhook.ID)
	if !allowed {
		delay := s.circuitBreaker.GetResetDelay(webhook.ID)
		if delay == 0 {
			delay = 100 * time.Millisecond // Small delay if another probe is in flight
		}
		if err := s.queue.Reschedule(ctx, *item, delay); err != nil {
			log.Printf("Failed to reschedule delivery %s: %v", item.DeliveryID, err)
		}
		return
	}

	if isProbe {
		log.Printf("Delivery %s is a probe/test request after circuit breaker pause", item.DeliveryID)
	}

	if !s.rateLimiter.Allow(webhook.ID) {
		delay := s.rateLimiter.GetRetryDelay(webhook.ID)
		if err := s.queue.Reschedule(ctx, *item, delay); err != nil {
			log.Printf("Failed to reschedule delivery %s due to rate limit: %v", item.DeliveryID, err)
		}
		return
	}

	delivery.AttemptNumber++
	success, responseStatus, responseBody, responseTimeMs, requestHeaders, requestBody := s.executeDelivery(ctx, webhook, event)

	delivery.RequestHeaders = requestHeaders
	delivery.RequestBody = requestBody
	delivery.ResponseStatus = responseStatus
	delivery.ResponseBody = responseBody
	delivery.ResponseTimeMs = responseTimeMs

	// Store complete logs for this attempt
	attempt := &models.DeliveryAttempt{
		ID:             uuid.New().String(),
		DeliveryID:     delivery.ID,
		AttemptNumber:  delivery.AttemptNumber,
		RequestHeaders: requestHeaders,
		RequestBody:    requestBody,
		ResponseStatus: responseStatus,
		ResponseBody:   responseBody,
		ResponseTimeMs: responseTimeMs,
		Success:        success,
		CreatedAt:      time.Now(),
	}

	if err := s.db.CreateDeliveryAttempt(ctx, attempt); err != nil {
		log.Printf("Failed to create delivery attempt log: %v", err)
	}

	if success {
		delivery.Status = models.DeliveryStatusSuccess
		delivery.NextRetryAt = nil
		s.circuitBreaker.RecordSuccess(webhook.ID)
		s.metrics.RecordSuccess()
	} else {
		s.circuitBreaker.RecordFailure(webhook.ID)
		s.metrics.RecordFailure()

		if delivery.AttemptNumber >= maxRetries {
			delivery.Status = models.DeliveryStatusDead
			delivery.NextRetryAt = nil

			deadLetter := &models.DeadLetter{
				ID:         uuid.New().String(),
				DeliveryID: delivery.ID,
				Reason:     fmt.Sprintf("Max retries (%d) exceeded. Last response: %d - %s", maxRetries, responseStatus, truncateString(responseBody, 500)),
				CreatedAt:  time.Now(),
			}

			if err := s.db.CreateDeadLetter(ctx, deadLetter); err != nil {
				log.Printf("Failed to create dead letter for delivery %s: %v", delivery.ID, err)
			}
			s.metrics.RecordDeadLetter()
		} else {
			delivery.Status = models.DeliveryStatusFailed
			nextRetry := calculateBackoff(delivery.AttemptNumber)
			retryAt := time.Now().Add(nextRetry)
			delivery.NextRetryAt = &retryAt

			newItem := models.QueueItem{
				DeliveryID: delivery.ID,
				EventID:    event.ID,
				WebhookID:  webhook.ID,
			}
			if err := s.queue.EnqueueWithDelay(ctx, newItem, nextRetry); err != nil {
				log.Printf("Failed to reschedule delivery %s: %v", delivery.ID, err)
			}
		}
	}

	if err := s.db.UpdateDelivery(ctx, delivery); err != nil {
		log.Printf("Failed to update delivery %s: %v", delivery.ID, err)
	}

	s.metrics.RecordDelivery()
}

func (s *Service) executeDelivery(ctx context.Context, webhook *models.Webhook, event *models.Event) (bool, int, string, int64, string, string) {
	startTime := time.Now()

	idempotencyKey := fmt.Sprintf("%s-%s", event.ID, webhook.ID)
	signature := generateSignature(event.Payload, webhook.Secret)

	headers := map[string]string{
		"Content-Type":       "application/json",
		"X-Webhook-Signature": signature,
		"X-Idempotency-Key":  idempotencyKey,
		"X-Event-Type":       event.EventType,
		"X-Event-ID":         event.ID,
		"X-Webhook-ID":       webhook.ID,
		"X-Timestamp":        fmt.Sprintf("%d", time.Now().Unix()),
	}

	headersJSON, _ := json.Marshal(headers)
	requestHeaders := string(headersJSON)
	requestBody := string(event.Payload)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, webhook.URL, bytes.NewReader(event.Payload))
	if err != nil {
		return false, 0, fmt.Sprintf("failed to create request: %v", err), time.Since(startTime).Milliseconds(), requestHeaders, requestBody
	}

	for k, v := range headers {
		req.Header.Set(k, v)
	}

	resp, err := s.httpClient.Do(req)
	responseTimeMs := time.Since(startTime).Milliseconds()

	if err != nil {
		return false, 0, fmt.Sprintf("request failed: %v", err), responseTimeMs, requestHeaders, requestBody
	}
	defer resp.Body.Close()

	bodyReader := io.LimitReader(resp.Body, maxResponseBodySize)
	responseBody, err := io.ReadAll(bodyReader)
	if err != nil {
		return false, resp.StatusCode, fmt.Sprintf("failed to read response: %v", err), responseTimeMs, requestHeaders, requestBody
	}

	success := resp.StatusCode >= 200 && resp.StatusCode < 300
	return success, resp.StatusCode, string(responseBody), responseTimeMs, requestHeaders, requestBody
}

func generateSignature(payload []byte, secret string) string {
	h := hmac.New(sha256.New, []byte(secret))
	h.Write(payload)
	return hex.EncodeToString(h.Sum(nil))
}

func calculateBackoff(attempt int) time.Duration {
	backoff := time.Second * time.Duration(1<<uint(attempt-1))
	if backoff > maxBackoffDuration {
		backoff = maxBackoffDuration
	}
	return backoff
}

func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

func (s *Service) RecoverPendingDeliveries(ctx context.Context) error {
	if err := s.queue.ClearProcessing(ctx); err != nil {
		log.Printf("Warning: failed to clear processing set: %v", err)
	}

	deliveries, err := s.db.GetPendingDeliveriesWithWebhook(ctx)
	if err != nil {
		return fmt.Errorf("failed to get pending deliveries: %w", err)
	}

	pendingItems, err := s.queue.GetPendingItems(ctx)
	if err != nil {
		return fmt.Errorf("failed to get pending queue items: %w", err)
	}

	queuedDeliveries := make(map[string]bool)
	for _, item := range pendingItems {
		queuedDeliveries[item.DeliveryID] = true
	}

	recovered := 0
	for _, dw := range deliveries {
		if queuedDeliveries[dw.Delivery.ID] {
			continue
		}

		var score float64
		if dw.Delivery.NextRetryAt != nil {
			score = float64(dw.Delivery.NextRetryAt.UnixNano())
		} else {
			score = float64(time.Now().UnixNano())
		}

		item := models.QueueItem{
			DeliveryID: dw.Delivery.ID,
			EventID:    dw.Delivery.EventID,
			WebhookID:  dw.WebhookID,
			Score:      score,
		}

		if err := s.queue.Enqueue(ctx, item); err != nil {
			log.Printf("Failed to recover delivery %s: %v", dw.Delivery.ID, err)
			continue
		}
		recovered++
	}

	if recovered > 0 {
		log.Printf("Recovered %d pending deliveries", recovered)
	}

	return nil
}

func (s *Service) ReplayDelivery(ctx context.Context, deliveryID string) (*models.Delivery, error) {
	delivery, event, webhook, err := s.db.GetDeliveryWithEventAndWebhook(ctx, deliveryID)
	if err != nil {
		return nil, fmt.Errorf("failed to get delivery: %w", err)
	}

	// Only allow replaying failed or dead deliveries
	if delivery.Status != models.DeliveryStatusFailed && delivery.Status != models.DeliveryStatusDead {
		return nil, fmt.Errorf("can only replay failed or dead-lettered deliveries, current status: %s", delivery.Status)
	}

	newDelivery := &models.Delivery{
		ID:            uuid.New().String(),
		EventID:       event.ID,
		AttemptNumber: 0,
		Status:        models.DeliveryStatusPending,
		CreatedAt:     time.Now(),
	}

	if err := s.db.CreateDelivery(ctx, newDelivery); err != nil {
		return nil, fmt.Errorf("failed to create new delivery: %w", err)
	}

	queueItem := models.QueueItem{
		DeliveryID: newDelivery.ID,
		EventID:    event.ID,
		WebhookID:  webhook.ID,
		Score:      float64(time.Now().UnixNano()),
	}

	if err := s.queue.Enqueue(ctx, queueItem); err != nil {
		return nil, fmt.Errorf("failed to enqueue delivery: %w", err)
	}

	return newDelivery, nil
}

func (s *Service) ReplayDeadLetter(ctx context.Context, deadLetterID string) (*models.Delivery, error) {
	deadLetter, err := s.db.GetDeadLetter(ctx, deadLetterID)
	if err != nil {
		return nil, fmt.Errorf("failed to get dead letter: %w", err)
	}

	return s.ReplayDelivery(ctx, deadLetter.DeliveryID)
}

func (s *Service) GetDeliveryStatus(ctx context.Context, deliveryID string) (*models.Delivery, error) {
	return s.db.GetDelivery(ctx, deliveryID)
}

func VerifySignature(payload []byte, signature, secret string) bool {
	expected := generateSignature(payload, secret)
	return hmac.Equal([]byte(expected), []byte(strings.ToLower(signature)))
}
