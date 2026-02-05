package models

import (
	"time"
)

type Webhook struct {
	ID         string    `json:"id"`
	CustomerID string    `json:"customer_id"`
	URL        string    `json:"url"`
	Secret     string    `json:"-"`
	CreatedAt  time.Time `json:"created_at"`
	IsActive   bool      `json:"is_active"`
}

type Event struct {
	ID        string    `json:"id"`
	WebhookID string    `json:"webhook_id"`
	EventType string    `json:"event_type"`
	Payload   []byte    `json:"payload"`
	CreatedAt time.Time `json:"created_at"`
}

type DeliveryStatus string

const (
	DeliveryStatusPending DeliveryStatus = "pending"
	DeliveryStatusSuccess DeliveryStatus = "success"
	DeliveryStatusFailed  DeliveryStatus = "failed"
	DeliveryStatusDead    DeliveryStatus = "dead"
)

type Delivery struct {
	ID             string         `json:"id"`
	EventID        string         `json:"event_id"`
	AttemptNumber  int            `json:"attempt_number"`
	Status         DeliveryStatus `json:"status"`
	RequestHeaders string         `json:"request_headers,omitempty"`
	RequestBody    string         `json:"request_body,omitempty"`
	ResponseStatus int            `json:"response_status,omitempty"`
	ResponseBody   string         `json:"response_body,omitempty"`
	ResponseTimeMs int64          `json:"response_time_ms,omitempty"`
	CreatedAt      time.Time      `json:"created_at"`
	NextRetryAt    *time.Time     `json:"next_retry_at,omitempty"`
}

type DeadLetter struct {
	ID         string    `json:"id"`
	DeliveryID string    `json:"delivery_id"`
	Reason     string    `json:"reason"`
	CreatedAt  time.Time `json:"created_at"`
}

type QueueItem struct {
	DeliveryID string  `json:"delivery_id"`
	EventID    string  `json:"event_id"`
	WebhookID  string  `json:"webhook_id"`
	Score      float64 `json:"score"`
}
