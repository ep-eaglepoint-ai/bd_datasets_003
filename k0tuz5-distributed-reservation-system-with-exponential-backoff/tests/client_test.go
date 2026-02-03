package tests

import (
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"reservation-system/repository_after/client"
)

func TestAttemptReserve(t *testing.T) {
	// Save original log output and restore after tests
	origLogOutput := log.Writer()
	defer log.SetOutput(origLogOutput)

	t.Run("successful reservation", func(t *testing.T) {
		// Mock server always returns 200 OK
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))
		defer server.Close()

		t.Setenv("SERVER_URL", server.URL)

		httpClient := &http.Client{Timeout: 1 * time.Second}

		// Capture logs
		var logs strings.Builder
		log.SetOutput(&logs)

		client.AttemptReserve(httpClient, 1)

		if !strings.Contains(logs.String(), "reservation successful") {
			t.Errorf("expected success log, got: %s", logs.String())
		}
	})

	t.Run("stock exhausted (409)", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusConflict)
		}))
		defer server.Close()

		t.Setenv("SERVER_URL", server.URL)

		httpClient := &http.Client{Timeout: 1 * time.Second}
		var logs strings.Builder
		log.SetOutput(&logs)

		client.AttemptReserve(httpClient, 2)

		if !strings.Contains(logs.String(), "stock exhausted") {
			t.Errorf("expected stock exhausted log, got: %s", logs.String())
		}
	})

	t.Run("retryable error with backoff", func(t *testing.T) {
		var attemptCount int
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			attemptCount++
			if attemptCount < 3 {
				w.WriteHeader(http.StatusTooManyRequests)
			} else {
				w.WriteHeader(http.StatusOK)
			}
		}))
		defer server.Close()

		t.Setenv("SERVER_URL", server.URL)

		httpClient := &http.Client{Timeout: 1 * time.Second}
		var logs strings.Builder
		log.SetOutput(&logs)

		start := time.Now()
		client.AttemptReserve(httpClient, 3)
		elapsed := time.Since(start)

		if attemptCount != 3 {
			t.Errorf("expected 3 attempts, got %d", attemptCount)
		}
		if !strings.Contains(logs.String(), "reservation successful") {
			t.Errorf("expected success log after retries, got: %s", logs.String())
		}

		// Ensure some minimal backoff occurred (not exact, just sanity check)
		if elapsed < 50*time.Millisecond {
			t.Errorf("expected backoff delay, but elapsed %v too short", elapsed)
		}
	})

	t.Run("connection error handling", func(t *testing.T) {
		// Point to an invalid URL to simulate connection error
		t.Setenv("SERVER_URL", "http://localhost:12345") // Likely no server here

		httpClient := &http.Client{Timeout: 500 * time.Millisecond}
		var logs strings.Builder
		log.SetOutput(&logs)

		client.AttemptReserve(httpClient, 4)

		if !strings.Contains(logs.String(), "connection error") {
			t.Errorf("expected connection error log, got: %s", logs.String())
		}
	})
}
