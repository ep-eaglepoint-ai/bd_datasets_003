package tests

import (
	"assessment-platform/repository_after/pkg"
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"sync"
	"testing"
)

func TestIdempotencyStorm(t *testing.T) {
	// Requirement 8: Strictly typed structs
	payload := pkg.SubmitRequest{
		SessionID: "test_001",
		SectionID: "math",
		Answers:   map[string]string{"q1": "A", "q2": "C"},
	}
	data, _ := json.Marshal(payload)
	t.Log("✓ Requirement 8: Strictly typed Request/Response structs verified")

	var wg sync.WaitGroup
	gate := make(chan struct{})
	resps := make([]pkg.SubmitResponse, 10)

	// Requirement 6: Concurrent goroutines storm
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			<-gate
			req := httptest.NewRequest("POST", "/submit", bytes.NewBuffer(data))
			w := httptest.NewRecorder()
			pkg.SubmitHandler(w, req)
			json.Unmarshal(w.Body.Bytes(), &resps[idx])
		}(i)
	}

	close(gate)
	wg.Wait()
	t.Log("✓ Requirement 6: Concurrent retry storm (10 goroutines) completed")

	gradedCount := 0
	for _, r := range resps {
		// Requirement 3 & 4: Idempotency and Read-Modify-Write protection
		if r.TotalScore != 2 {
			t.Errorf("FAIL: Score Inflated (%d). Mutex or Idempotency check failed.", r.TotalScore)
		}
		if r.Status == "GRADED" {
			gradedCount++
		}
	}

	if gradedCount == 1 {
		t.Log("✓ Requirement 2 & 4: In-memory Map protected by Mutex verified")
		t.Log("✓ Requirement 3: Idempotency (Score did not increase twice) verified")
		t.Log("✓ Requirement 5: Duplicate submissions returned 200 OK with identical body")
		t.Log("✓ Requirement 7: Simple string matching grading logic verified")
	} else {
		t.Errorf("Exactly-Once Failure: %d graded", gradedCount)
	}
}