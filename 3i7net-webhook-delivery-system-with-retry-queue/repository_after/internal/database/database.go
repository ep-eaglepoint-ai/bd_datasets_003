package database

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"webhook-delivery-system/internal/models"

	"github.com/jackc/pgx/v5/pgxpool"
)

type DB struct {
	pool *pgxpool.Pool
}

func New(connString string) (*DB, error) {
	config, err := pgxpool.ParseConfig(connString)
	if err != nil {
		return nil, fmt.Errorf("failed to parse connection string: %w", err)
	}

	config.MaxConns = 25
	config.MinConns = 5
	config.MaxConnLifetime = time.Hour
	config.MaxConnIdleTime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		return nil, fmt.Errorf("failed to create pool: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return &DB{pool: pool}, nil
}

func (db *DB) Close() {
	db.pool.Close()
}

func (db *DB) Migrate() error {
	ctx := context.Background()
	
	migrations := []string{
		`CREATE TABLE IF NOT EXISTS webhooks (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			customer_id VARCHAR(255) NOT NULL,
			url TEXT NOT NULL,
			secret VARCHAR(255) NOT NULL,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
			is_active BOOLEAN DEFAULT true
		)`,
		`CREATE INDEX IF NOT EXISTS idx_webhooks_customer_id ON webhooks(customer_id)`,
		`CREATE INDEX IF NOT EXISTS idx_webhooks_is_active ON webhooks(is_active)`,
		
		`CREATE TABLE IF NOT EXISTS events (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
			event_type VARCHAR(255) NOT NULL,
			payload JSONB NOT NULL,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_events_webhook_id ON events(webhook_id)`,
		`CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at)`,
		
		`CREATE TABLE IF NOT EXISTS deliveries (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
			attempt_number INTEGER NOT NULL DEFAULT 1,
			status VARCHAR(50) NOT NULL DEFAULT 'pending',
			request_headers TEXT,
			request_body TEXT,
			response_status INTEGER,
			response_body TEXT,
			response_time_ms BIGINT,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
			next_retry_at TIMESTAMP WITH TIME ZONE
		)`,
		`CREATE INDEX IF NOT EXISTS idx_deliveries_event_id ON deliveries(event_id)`,
		`CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status)`,
		`CREATE INDEX IF NOT EXISTS idx_deliveries_next_retry_at ON deliveries(next_retry_at)`,
		
		`CREATE TABLE IF NOT EXISTS dead_letters (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
			reason TEXT NOT NULL,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_dead_letters_delivery_id ON dead_letters(delivery_id)`,
		`CREATE INDEX IF NOT EXISTS idx_dead_letters_created_at ON dead_letters(created_at)`,
		
		// delivery_attempts table preserves complete per-attempt history for retries
		`CREATE TABLE IF NOT EXISTS delivery_attempts (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
			attempt_number INTEGER NOT NULL,
			request_headers TEXT NOT NULL,
			request_body TEXT NOT NULL,
			response_status INTEGER,
			response_body TEXT,
			response_time_ms BIGINT NOT NULL,
			success BOOLEAN NOT NULL DEFAULT false,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_delivery_attempts_delivery_id ON delivery_attempts(delivery_id)`,
		`CREATE INDEX IF NOT EXISTS idx_delivery_attempts_created_at ON delivery_attempts(created_at)`,
	}

	for _, migration := range migrations {
		if _, err := db.pool.Exec(ctx, migration); err != nil {
			return fmt.Errorf("failed to run migration: %w", err)
		}
	}

	return nil
}

func (db *DB) CreateWebhook(ctx context.Context, webhook *models.Webhook) error {
	query := `
		INSERT INTO webhooks (id, customer_id, url, secret, created_at, is_active)
		VALUES ($1, $2, $3, $4, $5, $6)
	`
	_, err := db.pool.Exec(ctx, query, webhook.ID, webhook.CustomerID, webhook.URL, webhook.Secret, webhook.CreatedAt, webhook.IsActive)
	return err
}

func (db *DB) GetWebhook(ctx context.Context, id string) (*models.Webhook, error) {
	query := `SELECT id, customer_id, url, secret, created_at, is_active FROM webhooks WHERE id = $1`
	
	var w models.Webhook
	err := db.pool.QueryRow(ctx, query, id).Scan(&w.ID, &w.CustomerID, &w.URL, &w.Secret, &w.CreatedAt, &w.IsActive)
	if err != nil {
		return nil, err
	}
	return &w, nil
}

func (db *DB) UpdateWebhook(ctx context.Context, webhook *models.Webhook) error {
	query := `UPDATE webhooks SET url = $1, secret = $2, is_active = $3 WHERE id = $4`
	_, err := db.pool.Exec(ctx, query, webhook.URL, webhook.Secret, webhook.IsActive, webhook.ID)
	return err
}

func (db *DB) DeleteWebhook(ctx context.Context, id string) error {
	query := `DELETE FROM webhooks WHERE id = $1`
	_, err := db.pool.Exec(ctx, query, id)
	return err
}

func (db *DB) ListWebhooks(ctx context.Context, customerID string) ([]models.Webhook, error) {
	query := `SELECT id, customer_id, url, secret, created_at, is_active FROM webhooks`
	args := []interface{}{}
	
	if customerID != "" {
		query += ` WHERE customer_id = $1`
		args = append(args, customerID)
	}
	query += ` ORDER BY created_at DESC`
	
	rows, err := db.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var webhooks []models.Webhook
	for rows.Next() {
		var w models.Webhook
		if err := rows.Scan(&w.ID, &w.CustomerID, &w.URL, &w.Secret, &w.CreatedAt, &w.IsActive); err != nil {
			return nil, err
		}
		webhooks = append(webhooks, w)
	}
	return webhooks, nil
}

func (db *DB) CreateEvent(ctx context.Context, event *models.Event) error {
	query := `
		INSERT INTO events (id, webhook_id, event_type, payload, created_at)
		VALUES ($1, $2, $3, $4, $5)
	`
	_, err := db.pool.Exec(ctx, query, event.ID, event.WebhookID, event.EventType, event.Payload, event.CreatedAt)
	return err
}

func (db *DB) GetEvent(ctx context.Context, id string) (*models.Event, error) {
	query := `SELECT id, webhook_id, event_type, payload, created_at FROM events WHERE id = $1`
	
	var e models.Event
	err := db.pool.QueryRow(ctx, query, id).Scan(&e.ID, &e.WebhookID, &e.EventType, &e.Payload, &e.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &e, nil
}

func (db *DB) GetEventWithWebhook(ctx context.Context, eventID string) (*models.Event, *models.Webhook, error) {
	query := `
		SELECT e.id, e.webhook_id, e.event_type, e.payload, e.created_at,
		       w.id, w.customer_id, w.url, w.secret, w.created_at, w.is_active
		FROM events e
		JOIN webhooks w ON e.webhook_id = w.id
		WHERE e.id = $1
	`
	
	var e models.Event
	var w models.Webhook
	err := db.pool.QueryRow(ctx, query, eventID).Scan(
		&e.ID, &e.WebhookID, &e.EventType, &e.Payload, &e.CreatedAt,
		&w.ID, &w.CustomerID, &w.URL, &w.Secret, &w.CreatedAt, &w.IsActive,
	)
	if err != nil {
		return nil, nil, err
	}
	return &e, &w, nil
}

func (db *DB) CreateDelivery(ctx context.Context, delivery *models.Delivery) error {
	query := `
		INSERT INTO deliveries (id, event_id, attempt_number, status, request_headers, request_body, 
		                        response_status, response_body, response_time_ms, created_at, next_retry_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`
	_, err := db.pool.Exec(ctx, query, 
		delivery.ID, delivery.EventID, delivery.AttemptNumber, delivery.Status,
		delivery.RequestHeaders, delivery.RequestBody, delivery.ResponseStatus,
		delivery.ResponseBody, delivery.ResponseTimeMs, delivery.CreatedAt, delivery.NextRetryAt)
	return err
}

func (db *DB) GetDelivery(ctx context.Context, id string) (*models.Delivery, error) {
	query := `
		SELECT id, event_id, attempt_number, status, request_headers, request_body,
		       response_status, response_body, response_time_ms, created_at, next_retry_at
		FROM deliveries WHERE id = $1
	`
	
	var d models.Delivery
	var reqHeaders, reqBody, respBody *string
	var respStatus *int
	var respTimeMs *int64
	
	err := db.pool.QueryRow(ctx, query, id).Scan(
		&d.ID, &d.EventID, &d.AttemptNumber, &d.Status, &reqHeaders, &reqBody,
		&respStatus, &respBody, &respTimeMs, &d.CreatedAt, &d.NextRetryAt,
	)
	if err != nil {
		return nil, err
	}
	
	if reqHeaders != nil {
		d.RequestHeaders = *reqHeaders
	}
	if reqBody != nil {
		d.RequestBody = *reqBody
	}
	if respStatus != nil {
		d.ResponseStatus = *respStatus
	}
	if respBody != nil {
		d.ResponseBody = *respBody
	}
	if respTimeMs != nil {
		d.ResponseTimeMs = *respTimeMs
	}
	
	return &d, nil
}

func (db *DB) UpdateDelivery(ctx context.Context, delivery *models.Delivery) error {
	query := `
		UPDATE deliveries 
		SET attempt_number = $1, status = $2, request_headers = $3, request_body = $4,
		    response_status = $5, response_body = $6, response_time_ms = $7, next_retry_at = $8
		WHERE id = $9
	`
	_, err := db.pool.Exec(ctx, query,
		delivery.AttemptNumber, delivery.Status, delivery.RequestHeaders, delivery.RequestBody,
		delivery.ResponseStatus, delivery.ResponseBody, delivery.ResponseTimeMs, delivery.NextRetryAt,
		delivery.ID)
	return err
}

func (db *DB) GetDeliveriesByEventID(ctx context.Context, eventID string) ([]models.Delivery, error) {
	query := `
		SELECT id, event_id, attempt_number, status, request_headers, request_body,
		       response_status, response_body, response_time_ms, created_at, next_retry_at
		FROM deliveries WHERE event_id = $1 ORDER BY created_at DESC
	`
	
	rows, err := db.pool.Query(ctx, query, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var deliveries []models.Delivery
	for rows.Next() {
		var d models.Delivery
		var reqHeaders, reqBody, respBody *string
		var respStatus *int
		var respTimeMs *int64
		
		if err := rows.Scan(&d.ID, &d.EventID, &d.AttemptNumber, &d.Status, &reqHeaders, &reqBody,
			&respStatus, &respBody, &respTimeMs, &d.CreatedAt, &d.NextRetryAt); err != nil {
			return nil, err
		}
		
		if reqHeaders != nil {
			d.RequestHeaders = *reqHeaders
		}
		if reqBody != nil {
			d.RequestBody = *reqBody
		}
		if respStatus != nil {
			d.ResponseStatus = *respStatus
		}
		if respBody != nil {
			d.ResponseBody = *respBody
		}
		if respTimeMs != nil {
			d.ResponseTimeMs = *respTimeMs
		}
		
		deliveries = append(deliveries, d)
	}
	return deliveries, nil
}

func (db *DB) GetPendingDeliveries(ctx context.Context) ([]models.Delivery, error) {
	query := `
		SELECT d.id, d.event_id, d.attempt_number, d.status, d.created_at, d.next_retry_at,
		       e.webhook_id
		FROM deliveries d
		JOIN events e ON d.event_id = e.id
		WHERE d.status = 'pending' OR d.status = 'failed'
		ORDER BY d.next_retry_at ASC NULLS FIRST
	`
	
	rows, err := db.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var deliveries []models.Delivery
	for rows.Next() {
		var d models.Delivery
		var webhookID string
		if err := rows.Scan(&d.ID, &d.EventID, &d.AttemptNumber, &d.Status, &d.CreatedAt, &d.NextRetryAt, &webhookID); err != nil {
			return nil, err
		}
		deliveries = append(deliveries, d)
	}
	return deliveries, nil
}

func (db *DB) GetLatestDeliveryAttempt(ctx context.Context, eventID string) (*models.Delivery, error) {
	query := `
		SELECT id, event_id, attempt_number, status, request_headers, request_body,
		       response_status, response_body, response_time_ms, created_at, next_retry_at
		FROM deliveries WHERE event_id = $1 ORDER BY attempt_number DESC LIMIT 1
	`
	
	var d models.Delivery
	var reqHeaders, reqBody, respBody *string
	var respStatus *int
	var respTimeMs *int64
	
	err := db.pool.QueryRow(ctx, query, eventID).Scan(
		&d.ID, &d.EventID, &d.AttemptNumber, &d.Status, &reqHeaders, &reqBody,
		&respStatus, &respBody, &respTimeMs, &d.CreatedAt, &d.NextRetryAt,
	)
	if err != nil {
		return nil, err
	}
	
	if reqHeaders != nil {
		d.RequestHeaders = *reqHeaders
	}
	if reqBody != nil {
		d.RequestBody = *reqBody
	}
	if respStatus != nil {
		d.ResponseStatus = *respStatus
	}
	if respBody != nil {
		d.ResponseBody = *respBody
	}
	if respTimeMs != nil {
		d.ResponseTimeMs = *respTimeMs
	}
	
	return &d, nil
}

func (db *DB) CreateDeadLetter(ctx context.Context, deadLetter *models.DeadLetter) error {
	query := `
		INSERT INTO dead_letters (id, delivery_id, reason, created_at)
		VALUES ($1, $2, $3, $4)
	`
	_, err := db.pool.Exec(ctx, query, deadLetter.ID, deadLetter.DeliveryID, deadLetter.Reason, deadLetter.CreatedAt)
	return err
}

func (db *DB) GetDeadLetter(ctx context.Context, id string) (*models.DeadLetter, error) {
	query := `SELECT id, delivery_id, reason, created_at FROM dead_letters WHERE id = $1`
	
	var dl models.DeadLetter
	err := db.pool.QueryRow(ctx, query, id).Scan(&dl.ID, &dl.DeliveryID, &dl.Reason, &dl.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &dl, nil
}

func (db *DB) ListDeadLetters(ctx context.Context, limit, offset int) ([]models.DeadLetter, error) {
	query := `SELECT id, delivery_id, reason, created_at FROM dead_letters ORDER BY created_at DESC LIMIT $1 OFFSET $2`
	
	rows, err := db.pool.Query(ctx, query, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var deadLetters []models.DeadLetter
	for rows.Next() {
		var dl models.DeadLetter
		if err := rows.Scan(&dl.ID, &dl.DeliveryID, &dl.Reason, &dl.CreatedAt); err != nil {
			return nil, err
		}
		deadLetters = append(deadLetters, dl)
	}
	return deadLetters, nil
}

func (db *DB) GetDeliveryWithEventAndWebhook(ctx context.Context, deliveryID string) (*models.Delivery, *models.Event, *models.Webhook, error) {
	query := `
		SELECT d.id, d.event_id, d.attempt_number, d.status, d.created_at,
		       e.id, e.webhook_id, e.event_type, e.payload, e.created_at,
		       w.id, w.customer_id, w.url, w.secret, w.created_at, w.is_active
		FROM deliveries d
		JOIN events e ON d.event_id = e.id
		JOIN webhooks w ON e.webhook_id = w.id
		WHERE d.id = $1
	`
	
	var d models.Delivery
	var e models.Event
	var w models.Webhook
	
	err := db.pool.QueryRow(ctx, query, deliveryID).Scan(
		&d.ID, &d.EventID, &d.AttemptNumber, &d.Status, &d.CreatedAt,
		&e.ID, &e.WebhookID, &e.EventType, &e.Payload, &e.CreatedAt,
		&w.ID, &w.CustomerID, &w.URL, &w.Secret, &w.CreatedAt, &w.IsActive,
	)
	if err != nil {
		return nil, nil, nil, err
	}
	return &d, &e, &w, nil
}

type DeliveryLog struct {
	DeliveryID     string    `json:"delivery_id"`
	AttemptNumber  int       `json:"attempt_number"`
	RequestHeaders string    `json:"request_headers"`
	RequestBody    string    `json:"request_body"`
	ResponseStatus int       `json:"response_status"`
	ResponseBody   string    `json:"response_body"`
	ResponseTimeMs int64     `json:"response_time_ms"`
	Success        bool      `json:"success"`
	CreatedAt      time.Time `json:"created_at"`
}

// CreateDeliveryAttempt stores complete logs for each individual delivery attempt
// This preserves per-attempt history for retry attempts in separate records
func (db *DB) CreateDeliveryAttempt(ctx context.Context, attempt *models.DeliveryAttempt) error {
	query := `
		INSERT INTO delivery_attempts (id, delivery_id, attempt_number, request_headers, request_body,
		                               response_status, response_body, response_time_ms, success, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`
	_, err := db.pool.Exec(ctx, query,
		attempt.ID, attempt.DeliveryID, attempt.AttemptNumber,
		attempt.RequestHeaders, attempt.RequestBody,
		attempt.ResponseStatus, attempt.ResponseBody, attempt.ResponseTimeMs,
		attempt.Success, attempt.CreatedAt)
	return err
}

// GetDeliveryLogs retrieves all delivery attempts for a delivery, preserving per-attempt history
func (db *DB) GetDeliveryLogs(ctx context.Context, deliveryID string) ([]DeliveryLog, error) {
	query := `
		SELECT id, delivery_id, attempt_number, request_headers, request_body,
		       COALESCE(response_status, 0) as response_status,
		       COALESCE(response_body, '') as response_body,
		       response_time_ms, success, created_at
		FROM delivery_attempts WHERE delivery_id = $1
		ORDER BY attempt_number ASC
	`
	
	rows, err := db.pool.Query(ctx, query, deliveryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var logs []DeliveryLog
	for rows.Next() {
		var log DeliveryLog
		var id string
		if err := rows.Scan(&id, &log.DeliveryID, &log.AttemptNumber,
			&log.RequestHeaders, &log.RequestBody, &log.ResponseStatus,
			&log.ResponseBody, &log.ResponseTimeMs, &log.Success, &log.CreatedAt); err != nil {
			return nil, err
		}
		logs = append(logs, log)
	}
	return logs, nil
}

func (db *DB) CountDeadLetters(ctx context.Context) (int64, error) {
	var count int64
	err := db.pool.QueryRow(ctx, `SELECT COUNT(*) FROM dead_letters`).Scan(&count)
	return count, err
}

func (db *DB) GetWebhookIDForDelivery(ctx context.Context, deliveryID string) (string, error) {
	query := `
		SELECT e.webhook_id FROM deliveries d
		JOIN events e ON d.event_id = e.id
		WHERE d.id = $1
	`
	var webhookID string
	err := db.pool.QueryRow(ctx, query, deliveryID).Scan(&webhookID)
	return webhookID, err
}

type DeliveryWithWebhook struct {
	Delivery  models.Delivery
	WebhookID string
}

func (db *DB) GetPendingDeliveriesWithWebhook(ctx context.Context) ([]DeliveryWithWebhook, error) {
	query := `
		SELECT d.id, d.event_id, d.attempt_number, d.status, d.created_at, d.next_retry_at,
		       e.webhook_id
		FROM deliveries d
		JOIN events e ON d.event_id = e.id
		WHERE d.status = 'pending' OR d.status = 'failed'
		ORDER BY d.next_retry_at ASC NULLS FIRST
	`
	
	rows, err := db.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var results []DeliveryWithWebhook
	for rows.Next() {
		var d models.Delivery
		var webhookID string
		if err := rows.Scan(&d.ID, &d.EventID, &d.AttemptNumber, &d.Status, &d.CreatedAt, &d.NextRetryAt, &webhookID); err != nil {
			return nil, err
		}
		results = append(results, DeliveryWithWebhook{Delivery: d, WebhookID: webhookID})
	}
	return results, nil
}

func (db *DB) Exec(ctx context.Context, query string, args ...interface{}) error {
	_, err := db.pool.Exec(ctx, query, args...)
	return err
}

func (db *DB) Query(ctx context.Context, query string, args ...interface{}) ([]map[string]interface{}, error) {
	rows, err := db.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	fields := rows.FieldDescriptions()
	var results []map[string]interface{}

	for rows.Next() {
		values, err := rows.Values()
		if err != nil {
			return nil, err
		}

		row := make(map[string]interface{})
		for i, field := range fields {
			row[string(field.Name)] = values[i]
		}
		results = append(results, row)
	}

	return results, nil
}

func MarshalJSON(v interface{}) ([]byte, error) {
	return json.Marshal(v)
}
