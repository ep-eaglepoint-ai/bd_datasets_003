package pkg

import (
	"encoding/json"
	"net/http"
	"sync"
)

var (
	Sessions   = make(map[string]*SessionState)
	SessionsMu sync.RWMutex
)

var AnswerKey = map[string]string{"q1": "A", "q2": "C", "q3": "B"}

type SubmitRequest struct {
	SessionID string            `json:"session_id"`
	SectionID string            `json:"section_id"`
	Answers   map[string]string `json:"answers"`
}

type SubmitResponse struct {
	SessionID    string `json:"session_id"`
	SectionScore int    `json:"section_score"`
	TotalScore   int    `json:"total_score"`
	Status       string `json:"status"`
}

type SessionState struct {
	TotalScore     int
	GradedSections map[string]int
	Mu             sync.Mutex 
}

func SubmitHandler(w http.ResponseWriter, r *http.Request) {
	var req SubmitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad Request", 400); return
	}

	SessionsMu.RLock()
	state, exists := Sessions[req.SessionID]
	SessionsMu.RUnlock()

	if !exists {
		SessionsMu.Lock()
		if state, exists = Sessions[req.SessionID]; !exists {
			state = &SessionState{GradedSections: make(map[string]int)}
			Sessions[req.SessionID] = state
		}
		SessionsMu.Unlock()
	}

	state.Mu.Lock()
	defer state.Mu.Unlock()

	if prevScore, ok := state.GradedSections[req.SectionID]; ok {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SubmitResponse{req.SessionID, prevScore, state.TotalScore, "IDEMPOTENT_SUCCESS"})
		return
	}

	score := 0
	for q, ans := range req.Answers {
		if val, ok := AnswerKey[q]; ok && val == ans { score++ }
	}

	state.TotalScore += score
	state.GradedSections[req.SectionID] = score

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(SubmitResponse{req.SessionID, score, state.TotalScore, "GRADED"})
}