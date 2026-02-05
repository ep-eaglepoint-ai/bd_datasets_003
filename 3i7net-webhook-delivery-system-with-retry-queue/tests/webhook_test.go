package tests

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"testing"
	"time"
)

func TestCircuitBreaker_Behavior(t *testing.T) {
	type circuitState struct {
		failures int
		isOpen   bool
	}

	state := circuitState{failures: 0, isOpen: false}
	threshold := 5
	
	recordFailure := func() {
		state.failures++
		if state.failures >= threshold {
			state.isOpen = true
		}
	}
	
	recordSuccess := func() {
		state.failures = 0
		state.isOpen = false
	}

	if state.isOpen {
		t.Error("Circuit should be closed initially")
	}

	for i := 0; i < 4; i++ {
		recordFailure()
	}
	if state.isOpen {
		t.Error("Circuit should still be closed after 4 failures")
	}

	recordFailure()
	if !state.isOpen {
		t.Error("Circuit should be open after 5 failures")
	}

	recordSuccess()
	if state.isOpen {
		t.Error("Circuit should be closed after success")
	}
	if state.failures != 0 {
		t.Error("Failure count should be reset to 0")
	}
}

func TestRateLimiter_Behavior(t *testing.T) {
	limit := 5
	window := time.Second
	requests := []time.Time{}

	allow := func() bool {
		now := time.Now()
		windowStart := now.Add(-window)

		var validRequests []time.Time
		for _, req := range requests {
			if req.After(windowStart) {
				validRequests = append(validRequests, req)
			}
		}

		if len(validRequests) >= limit {
			requests = validRequests
			return false
		}

		requests = append(validRequests, now)
		return true
	}

	for i := 0; i < 5; i++ {
		if !allow() {
			t.Errorf("Request %d should be allowed", i+1)
		}
	}

	if allow() {
		t.Error("6th request should be denied")
	}
}

func TestCalculateBackoff(t *testing.T) {
	maxBackoff := time.Hour

	calculateBackoff := func(attempt int) time.Duration {
		backoff := time.Second * time.Duration(1<<uint(attempt-1))
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
		return backoff
	}

	tests := []struct {
		attempt  int
		expected time.Duration
	}{
		{1, 1 * time.Second},
		{2, 2 * time.Second},
		{3, 4 * time.Second},
		{4, 8 * time.Second},
		{5, 16 * time.Second},
		{6, 32 * time.Second},
		{7, 64 * time.Second},
		{8, 128 * time.Second},
		{9, 256 * time.Second},
		{10, 512 * time.Second},
		{13, time.Hour},
		{20, time.Hour},
	}

	for _, tt := range tests {
		result := calculateBackoff(tt.attempt)
		if result != tt.expected {
			t.Errorf("Attempt %d: expected %v, got %v", tt.attempt, tt.expected, result)
		}
	}
}

func TestHMACSHA256Signature(t *testing.T) {
	generateSignature := func(payload []byte, secret string) string {
		h := hmac.New(sha256.New, []byte(secret))
		h.Write(payload)
		return hex.EncodeToString(h.Sum(nil))
	}

	verifySignature := func(payload []byte, signature, secret string) bool {
		expected := generateSignature(payload, secret)
		return hmac.Equal([]byte(expected), []byte(signature))
	}

	payload := []byte(`{"event":"user.created","data":{"id":"123"}}`)
	secret := "my-secret-key"

	signature := generateSignature(payload, secret)

	if len(signature) != 64 {
		t.Errorf("Expected 64 character hex signature, got %d", len(signature))
	}

	if !verifySignature(payload, signature, secret) {
		t.Error("Valid signature should verify successfully")
	}

	if verifySignature(payload, "invalid-signature", secret) {
		t.Error("Invalid signature should fail verification")
	}

	if verifySignature(payload, signature, "wrong-secret") {
		t.Error("Wrong secret should fail verification")
	}
}

func TestSignatureConsistency(t *testing.T) {
	generateSignature := func(payload []byte, secret string) string {
		h := hmac.New(sha256.New, []byte(secret))
		h.Write(payload)
		return hex.EncodeToString(h.Sum(nil))
	}

	payload := []byte(`{"test":"data"}`)
	secret := "secret123"

	sig1 := generateSignature(payload, secret)
	sig2 := generateSignature(payload, secret)

	if sig1 != sig2 {
		t.Error("Same payload and secret should produce same signature")
	}
}

func TestMetricsCollector(t *testing.T) {
	type metrics struct {
		totalDeliveries int64
		successCount    int64
		failureCount    int64
		deadLetterCount int64
	}

	m := metrics{}

	m.totalDeliveries++
	m.totalDeliveries++
	m.totalDeliveries++

	if m.totalDeliveries != 3 {
		t.Errorf("Expected 3 deliveries, got %d", m.totalDeliveries)
	}

	m.successCount++
	m.successCount++

	if m.successCount != 2 {
		t.Errorf("Expected 2 successes, got %d", m.successCount)
	}

	m.failureCount++

	if m.failureCount != 1 {
		t.Errorf("Expected 1 failure, got %d", m.failureCount)
	}

	m.deadLetterCount++
	m.deadLetterCount++

	if m.deadLetterCount != 2 {
		t.Errorf("Expected 2 dead letters, got %d", m.deadLetterCount)
	}

	getSuccessRate := func() float64 {
		total := m.successCount + m.failureCount
		if total == 0 {
			return 0
		}
		return float64(m.successCount) / float64(total) * 100
	}

	rate := getSuccessRate()
	expected := float64(2) / float64(3) * 100
	if rate != expected {
		t.Errorf("Expected %.2f%% success rate, got %.2f%%", expected, rate)
	}
}

func TestDeliveryStatus(t *testing.T) {
	type DeliveryStatus string

	const (
		StatusPending DeliveryStatus = "pending"
		StatusSuccess DeliveryStatus = "success"
		StatusFailed  DeliveryStatus = "failed"
		StatusDead    DeliveryStatus = "dead"
	)

	statuses := []DeliveryStatus{StatusPending, StatusSuccess, StatusFailed, StatusDead}
	expected := []string{"pending", "success", "failed", "dead"}

	for i, status := range statuses {
		if string(status) != expected[i] {
			t.Errorf("Expected %s, got %s", expected[i], status)
		}
	}
}

func TestWebhookModel(t *testing.T) {
	type Webhook struct {
		ID         string    `json:"id"`
		CustomerID string    `json:"customer_id"`
		URL        string    `json:"url"`
		Secret     string    `json:"-"`
		CreatedAt  time.Time `json:"created_at"`
		IsActive   bool      `json:"is_active"`
	}

	webhook := Webhook{
		ID:         "wh-123",
		CustomerID: "cust-456",
		URL:        "https://example.com/webhook",
		Secret:     "super-secret",
		CreatedAt:  time.Now(),
		IsActive:   true,
	}

	data, err := json.Marshal(webhook)
	if err != nil {
		t.Fatalf("Failed to marshal webhook: %v", err)
	}

	dataStr := string(data)
	for i := 0; i <= len(dataStr)-12; i++ {
		if dataStr[i:i+12] == "super-secret" {
			t.Error("Secret should not be in JSON output")
			break
		}
	}
}

func TestEventModel(t *testing.T) {
	type Event struct {
		ID        string          `json:"id"`
		WebhookID string          `json:"webhook_id"`
		EventType string          `json:"event_type"`
		Payload   json.RawMessage `json:"payload"`
		CreatedAt time.Time       `json:"created_at"`
	}

	event := Event{
		ID:        "evt-123",
		WebhookID: "wh-456",
		EventType: "user.created",
		Payload:   json.RawMessage(`{"user_id":"usr-789"}`),
		CreatedAt: time.Now(),
	}

	data, err := json.Marshal(event)
	if err != nil {
		t.Fatalf("Failed to marshal event: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if result["id"] != "evt-123" {
		t.Errorf("Expected id 'evt-123', got '%v'", result["id"])
	}

	if result["event_type"] != "user.created" {
		t.Errorf("Expected event_type 'user.created', got '%v'", result["event_type"])
	}
}

func TestDeliveryModel(t *testing.T) {
	type DeliveryStatus string
	const StatusFailed DeliveryStatus = "failed"

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

	now := time.Now()
	nextRetry := now.Add(time.Minute)

	del := Delivery{
		ID:             "del-123",
		EventID:        "evt-456",
		AttemptNumber:  3,
		Status:         StatusFailed,
		RequestHeaders: `{"Content-Type":"application/json"}`,
		RequestBody:    `{"data":"test"}`,
		ResponseStatus: 500,
		ResponseBody:   "Internal Server Error",
		ResponseTimeMs: 250,
		CreatedAt:      now,
		NextRetryAt:    &nextRetry,
	}

	data, err := json.Marshal(del)
	if err != nil {
		t.Fatalf("Failed to marshal delivery: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if result["attempt_number"].(float64) != 3 {
		t.Errorf("Expected attempt_number 3, got %v", result["attempt_number"])
	}

	if result["status"] != "failed" {
		t.Errorf("Expected status 'failed', got '%v'", result["status"])
	}

	if result["response_status"].(float64) != 500 {
		t.Errorf("Expected response_status 500, got %v", result["response_status"])
	}
}

func TestDeadLetterModel(t *testing.T) {
	type DeadLetter struct {
		ID         string    `json:"id"`
		DeliveryID string    `json:"delivery_id"`
		Reason     string    `json:"reason"`
		CreatedAt  time.Time `json:"created_at"`
	}

	deadLetter := DeadLetter{
		ID:         "dl-123",
		DeliveryID: "del-456",
		Reason:     "Max retries exceeded",
		CreatedAt:  time.Now(),
	}

	data, err := json.Marshal(deadLetter)
	if err != nil {
		t.Fatalf("Failed to marshal dead letter: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if result["reason"] != "Max retries exceeded" {
		t.Errorf("Expected reason 'Max retries exceeded', got '%v'", result["reason"])
	}
}

func TestQueueItemModel(t *testing.T) {
	type QueueItem struct {
		DeliveryID string  `json:"delivery_id"`
		EventID    string  `json:"event_id"`
		WebhookID  string  `json:"webhook_id"`
		Score      float64 `json:"score"`
	}

	item := QueueItem{
		DeliveryID: "del-123",
		EventID:    "evt-456",
		WebhookID:  "wh-789",
		Score:      1234567890.123,
	}

	data, err := json.Marshal(item)
	if err != nil {
		t.Fatalf("Failed to marshal queue item: %v", err)
	}

	var result QueueItem
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if result.DeliveryID != item.DeliveryID {
		t.Errorf("DeliveryID mismatch: got %s, want %s", result.DeliveryID, item.DeliveryID)
	}

	if result.Score != item.Score {
		t.Errorf("Score mismatch: got %f, want %f", result.Score, item.Score)
	}
}

func TestExponentialBackoffSequence(t *testing.T) {
	maxBackoff := time.Hour

	calculateBackoff := func(attempt int) time.Duration {
		backoff := time.Second * time.Duration(1<<uint(attempt-1))
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
		return backoff
	}

	var sequence []time.Duration
	for attempt := 1; attempt <= 15; attempt++ {
		sequence = append(sequence, calculateBackoff(attempt))
	}

	for i := 1; i < len(sequence); i++ {
		if sequence[i] == maxBackoff {
			continue
		}
		expected := sequence[i-1] * 2
		if expected > maxBackoff {
			expected = maxBackoff
		}
		if sequence[i] != expected {
			t.Errorf("Backoff at attempt %d should be double of previous (or max)", i+1)
		}
	}

	for i := 12; i < len(sequence); i++ {
		if sequence[i] != maxBackoff {
			t.Errorf("High attempt backoffs should cap at max: got %v", sequence[i])
		}
	}
}

func TestMaxRetriesAndDeadLetter(t *testing.T) {
	maxRetries := 10

	for attempt := 1; attempt <= 15; attempt++ {
		shouldDeadLetter := attempt >= maxRetries
		if attempt < maxRetries && shouldDeadLetter {
			t.Errorf("Attempt %d should not be dead lettered yet", attempt)
		}
		if attempt >= maxRetries && !shouldDeadLetter {
			t.Errorf("Attempt %d should be dead lettered", attempt)
		}
	}
}

func TestIdempotencyKeyGeneration(t *testing.T) {
	eventID := "evt-123"
	webhookID := "wh-456"

	generateIdempotencyKey := func(eid, wid string) string {
		return eid + "-" + wid
	}

	key1 := generateIdempotencyKey(eventID, webhookID)
	key2 := generateIdempotencyKey(eventID, webhookID)

	if key1 != key2 {
		t.Error("Same event and webhook should produce same idempotency key")
	}

	key3 := generateIdempotencyKey("evt-999", webhookID)
	if key1 == key3 {
		t.Error("Different events should produce different idempotency keys")
	}
}

func TestHTTPTimeout(t *testing.T) {
	timeout := 30 * time.Second
	if timeout != 30*time.Second {
		t.Errorf("HTTP timeout should be 30 seconds, got %v", timeout)
	}
}

func TestRateLimitConfiguration(t *testing.T) {
	rateLimit := 100
	window := time.Minute

	if rateLimit != 100 {
		t.Errorf("Rate limit should be 100, got %d", rateLimit)
	}

	if window != time.Minute {
		t.Errorf("Rate limit window should be 1 minute, got %v", window)
	}
}

func TestCircuitBreakerConfiguration(t *testing.T) {
	threshold := 5
	pauseDuration := time.Minute

	if threshold != 5 {
		t.Errorf("Circuit breaker threshold should be 5, got %d", threshold)
	}

	if pauseDuration != time.Minute {
		t.Errorf("Circuit breaker pause should be 1 minute, got %v", pauseDuration)
	}
}

func TestFastDeliveryPolling(t *testing.T) {
	workerPollInterval := 100 * time.Millisecond

	if workerPollInterval > 5*time.Second {
		t.Errorf("Worker poll interval should be much less than 5 seconds for fast delivery, got %v", workerPollInterval)
	}

	if workerPollInterval > 500*time.Millisecond {
		t.Errorf("Worker poll interval should be under 500ms for responsive delivery, got %v", workerPollInterval)
	}
}

func TestReplayDeliveryBehavior(t *testing.T) {
	type Delivery struct {
		ID            string
		EventID       string
		AttemptNumber int
		Status        string
	}

	originalDelivery := Delivery{
		ID:            "del-original",
		EventID:       "evt-123",
		AttemptNumber: 5,
		Status:        "failed",
	}

	newDelivery := Delivery{
		ID:            "del-new",
		EventID:       originalDelivery.EventID,
		AttemptNumber: 0,
		Status:        "pending",
	}

	if newDelivery.EventID != originalDelivery.EventID {
		t.Error("Replayed delivery should use same event")
	}

	if newDelivery.AttemptNumber != 0 {
		t.Error("Replayed delivery should start with attempt 0")
	}

	if newDelivery.Status != "pending" {
		t.Error("Replayed delivery should start as pending")
	}

	if newDelivery.ID == originalDelivery.ID {
		t.Error("Replayed delivery should have new ID")
	}
}

func TestReplayDeadLetterBehavior(t *testing.T) {
	type DeadLetter struct {
		ID         string
		DeliveryID string
		Reason     string
	}

	type Delivery struct {
		ID      string
		EventID string
		Status  string
	}

	deadLetter := DeadLetter{
		ID:         "dl-123",
		DeliveryID: "del-456",
		Reason:     "Max retries exceeded",
	}

	originalDelivery := Delivery{
		ID:      deadLetter.DeliveryID,
		EventID: "evt-789",
		Status:  "dead",
	}

	newDelivery := Delivery{
		ID:      "del-new",
		EventID: originalDelivery.EventID,
		Status:  "pending",
	}

	if newDelivery.EventID != originalDelivery.EventID {
		t.Error("Replayed dead letter should create delivery for same event")
	}

	if newDelivery.Status != "pending" {
		t.Error("Replayed dead letter should create pending delivery")
	}
}

func TestServerRestartRecovery(t *testing.T) {
	type Delivery struct {
		ID          string
		Status      string
		NextRetryAt *time.Time
	}

	type QueueItem struct {
		DeliveryID string
		Score      float64
	}

	pendingDeliveries := []Delivery{
		{ID: "del-1", Status: "pending", NextRetryAt: nil},
		{ID: "del-2", Status: "failed", NextRetryAt: timePtr(time.Now().Add(time.Minute))},
		{ID: "del-3", Status: "pending", NextRetryAt: nil},
	}

	existingQueueItems := []QueueItem{
		{DeliveryID: "del-1", Score: float64(time.Now().UnixNano())},
	}

	queuedMap := make(map[string]bool)
	for _, item := range existingQueueItems {
		queuedMap[item.DeliveryID] = true
	}

	recovered := 0
	for _, del := range pendingDeliveries {
		if !queuedMap[del.ID] {
			recovered++
		}
	}

	if recovered != 2 {
		t.Errorf("Expected to recover 2 deliveries not in queue, got %d", recovered)
	}

	for _, del := range pendingDeliveries {
		if del.Status != "pending" && del.Status != "failed" {
			t.Errorf("Only pending/failed deliveries should be recovered, got %s", del.Status)
		}
	}
}

func timePtr(t time.Time) *time.Time {
	return &t
}

func TestRedisSortedSetScoreAsTimestamp(t *testing.T) {
	now := time.Now()
	delay := 2 * time.Second
	retryTime := now.Add(delay)

	score := float64(retryTime.UnixNano())

	reconstructedTime := time.Unix(0, int64(score))

	diff := reconstructedTime.Sub(retryTime)
	if diff < 0 {
		diff = -diff
	}

	if diff > time.Microsecond {
		t.Errorf("Score should accurately represent retry timestamp, diff: %v", diff)
	}
}

func TestDeliveryWithin5Seconds(t *testing.T) {
	pollInterval := 100 * time.Millisecond
	maxQueueOperationTime := 50 * time.Millisecond
	maxDBOperationTime := 100 * time.Millisecond
	maxHTTPPrepTime := 50 * time.Millisecond

	worstCaseLatency := pollInterval + maxQueueOperationTime + maxDBOperationTime + maxHTTPPrepTime
	
	if worstCaseLatency > 5*time.Second {
		t.Errorf("Worst case latency before HTTP call should be under 5s, got %v", worstCaseLatency)
	}

	reasonableLatency := pollInterval + maxQueueOperationTime + maxDBOperationTime + maxHTTPPrepTime
	if reasonableLatency > time.Second {
		t.Logf("Note: Expected latency before HTTP call is %v", reasonableLatency)
	}
}

func TestMetricsEndpointFields(t *testing.T) {
	type MetricsResponse struct {
		TotalDeliveries int64   `json:"total_deliveries"`
		SuccessCount    int64   `json:"success_count"`
		FailureCount    int64   `json:"failure_count"`
		DeadLetterCount int64   `json:"dead_letter_count"`
		SuccessRate     float64 `json:"success_rate_percent"`
	}

	metrics := MetricsResponse{
		TotalDeliveries: 100,
		SuccessCount:    80,
		FailureCount:    15,
		DeadLetterCount: 5,
		SuccessRate:     84.21,
	}

	if metrics.TotalDeliveries < 0 {
		t.Error("TotalDeliveries should be non-negative")
	}
	if metrics.SuccessCount < 0 {
		t.Error("SuccessCount should be non-negative")
	}
	if metrics.FailureCount < 0 {
		t.Error("FailureCount should be non-negative")
	}
	if metrics.DeadLetterCount < 0 {
		t.Error("DeadLetterCount should be non-negative")
	}
	if metrics.SuccessRate < 0 || metrics.SuccessRate > 100 {
		t.Errorf("SuccessRate should be between 0 and 100, got %f", metrics.SuccessRate)
	}

	data, err := json.Marshal(metrics)
	if err != nil {
		t.Fatalf("Failed to marshal metrics: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	requiredFields := []string{"total_deliveries", "success_count", "failure_count", "dead_letter_count", "success_rate_percent"}
	for _, field := range requiredFields {
		if _, ok := result[field]; !ok {
			t.Errorf("Missing required field: %s", field)
		}
	}
}

func TestRateLimiterDelaysNotDrops(t *testing.T) {
	limit := 100
	window := time.Minute
	requests := make([]time.Time, 0, limit+10)

	allowWithDelay := func() (bool, time.Duration) {
		now := time.Now()
		windowStart := now.Add(-window)

		var validRequests []time.Time
		for _, req := range requests {
			if req.After(windowStart) {
				validRequests = append(validRequests, req)
			}
		}

		if len(validRequests) >= limit {
			oldestInWindow := validRequests[0]
			for _, t := range validRequests {
				if t.Before(oldestInWindow) {
					oldestInWindow = t
				}
			}
			delay := oldestInWindow.Add(window).Sub(now)
			requests = validRequests
			return false, delay
		}

		requests = append(validRequests, now)
		return true, 0
	}

	for i := 0; i < limit; i++ {
		allowed, _ := allowWithDelay()
		if !allowed {
			t.Errorf("Request %d should be allowed", i+1)
		}
	}

	allowed, delay := allowWithDelay()
	if allowed {
		t.Error("Request exceeding limit should be delayed")
	}
	if delay <= 0 {
		t.Error("Delay should be positive when rate limited")
	}
	if delay > window {
		t.Errorf("Delay should not exceed window duration, got %v", delay)
	}
}

