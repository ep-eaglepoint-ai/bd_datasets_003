// server.go
//
// Offline-First Sync Server (in-memory, standard library only)
//
// Key guarantees:
// 1) Event-sourcing: client sends a list of intent events (INCREMENT/DECREMENT), not final values.
// 2) Idempotency: re-sending the same BatchID has ZERO effect the second time.
// 3) Atomicity: batch applies ALL events or NONE. If any event would cause stock < 0, reject batch.
// 4) Thread-safe: sync.Mutex protects global inventory + dedupe indexes.
// 5) Reconciliation: server returns the true current inventory state after every sync attempt.

package offline_sync

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"sync"
)

type BatchOutcome struct {
	Accepted bool   `json:"accepted"`
	Reason   string `json:"reason,omitempty"`
}

// InventoryServer holds all server state in-memory.
type InventoryServer struct {
	mu sync.Mutex

	// Global inventory. Values must never be negative.
	inventory map[string]int

	// Idempotency:
	// - processedBatches ensures same BatchID is a no-op on retry.
	// - processedEvents ensures each EventID is applied at most once across all time.
	processedBatches map[string]BatchOutcome
	processedEvents  map[string]struct{}

	// A monotonically increasing version for reconciliation/debug.
	serverVersion int64
}

func NewInventoryServer() *InventoryServer {
	return &InventoryServer{
		// Example initial inventory (edit as you like).
		inventory: map[string]int{
			"bandage": 10,
			"syringe": 5,
			"gloves":  20,
		},
		processedBatches: make(map[string]BatchOutcome),
		processedEvents:  make(map[string]struct{}),
		serverVersion:    1,
	}
}

func (s *InventoryServer) Handler() http.Handler {
	mux := http.NewServeMux()
	// Use path-only patterns for Go 1.21 compatibility.
	mux.HandleFunc("/state", s.handleGetState)
	mux.HandleFunc("/sync", s.handlePostSync)
	return mux
}

func (s *InventoryServer) handleGetState(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, StateResponse{
			ServerVersion: 0,
			Inventory:     map[string]int{},
		})
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	writeJSON(w, http.StatusOK, StateResponse{
		ServerVersion: s.serverVersion,
		Inventory:     copyInventory(s.inventory),
	})
}

func (s *InventoryServer) handlePostSync(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, SyncResponse{
			Accepted:       false,
			Reason:         "method not allowed",
			RebaseRequired: false,
			ServerVersion:  0,
			Inventory:      nil,
		})
		return
	}

	var req SyncRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, SyncResponse{
			BatchID:        req.BatchID,
			Accepted:       false,
			Reason:         "invalid JSON payload",
			RebaseRequired: true,
			ServerVersion:  0,
			Inventory:      nil,
		})
		return
	}

	// Basic request validation outside mutex is fine, but the authoritative validation happens inside too.
	if err := validateSyncRequest(req); err != nil {
		writeJSON(w, http.StatusBadRequest, SyncResponse{
			BatchID:        req.BatchID,
			Accepted:       false,
			Reason:         fmt.Sprintf("bad request: %v", err),
			RebaseRequired: true,
			ServerVersion:  0,
			Inventory:      nil,
		})
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// 1) Idempotency by BatchID:
	// If we already processed this BatchID, return the current true state,
	// and do NOT apply anything again.
	if outcome, ok := s.processedBatches[req.BatchID]; ok {
		status := http.StatusOK
		if !outcome.Accepted {
			status = http.StatusConflict
		}
		writeJSON(w, status, SyncResponse{
			BatchID:         req.BatchID,
			Accepted:        outcome.Accepted,
			Reason:          outcome.Reason,
			RebaseRequired:  !outcome.Accepted,
			ServerVersion:   s.serverVersion,
			Inventory:       copyInventory(s.inventory),
			ProcessedAsDup:  true,
			ProcessedDupWhy: "batch_id already processed; returning current state without re-applying",
		})
		return
	}

	// 2) Validate event IDs (no duplicates in-batch, and no replay of already processed events).
	inBatchSeen := make(map[string]struct{}, len(req.Events))
	for i, ev := range req.Events {
		if _, dup := inBatchSeen[ev.EventID]; dup {
			outcome := BatchOutcome{
				Accepted: false,
				Reason:   fmt.Sprintf("invalid batch: duplicate event_id within batch at index %d", i),
			}
			s.processedBatches[req.BatchID] = outcome
			writeJSON(w, http.StatusBadRequest, SyncResponse{
				BatchID:        req.BatchID,
				Accepted:       false,
				Reason:         outcome.Reason,
				RebaseRequired: true,
				ServerVersion:  s.serverVersion,
				Inventory:      copyInventory(s.inventory),
			})
			return
		}
		inBatchSeen[ev.EventID] = struct{}{}

		// Strict "exactly once per unique event":
		// If any EventID was processed previously, reject batch and force rebase.
		// (This keeps the model simple and avoids partial-apply confusion.)
		if _, already := s.processedEvents[ev.EventID]; already {
			outcome := BatchOutcome{
				Accepted: false,
				Reason:   fmt.Sprintf("event already processed: %s (client must rebase)", ev.EventID),
			}
			s.processedBatches[req.BatchID] = outcome
			writeJSON(w, http.StatusConflict, SyncResponse{
				BatchID:        req.BatchID,
				Accepted:       false,
				Reason:         outcome.Reason,
				RebaseRequired: true,
				ServerVersion:  s.serverVersion,
				Inventory:      copyInventory(s.inventory),
			})
			return
		}
	}

	// 3) Atomic apply using a "transaction copy".
	// We simulate applying every event into a copy. If any step would go < 0, reject entire batch.
	proposed := copyInventory(s.inventory)
	for i, ev := range req.Events {
		if err := applyEvent(proposed, ev); err != nil {
			// Reject entire batch (atomicity).
			outcome := BatchOutcome{
				Accepted: false,
				Reason:   fmt.Sprintf("batch rejected at event[%d] (%s): %v", i, ev.EventID, err),
			}
			s.processedBatches[req.BatchID] = outcome

			// IMPORTANT: do NOT mark events as processed, and do NOT change inventory.
			writeJSON(w, http.StatusConflict, SyncResponse{
				BatchID:        req.BatchID,
				Accepted:       false,
				Reason:         outcome.Reason,
				RebaseRequired: true,
				ServerVersion:  s.serverVersion,
				Inventory:      copyInventory(s.inventory),
			})
			return
		}
	}

	// 4) Commit the transaction: single atomic swap under mutex.
	s.inventory = proposed
	s.serverVersion++

	for _, ev := range req.Events {
		s.processedEvents[ev.EventID] = struct{}{}
	}
	s.processedBatches[req.BatchID] = BatchOutcome{Accepted: true}

	log.Printf("SYNC ACCEPTED client=%s batch=%s events=%d version=%d",
		req.ClientID, req.BatchID, len(req.Events), s.serverVersion)

	writeJSON(w, http.StatusOK, SyncResponse{
		BatchID:        req.BatchID,
		Accepted:       true,
		Reason:         "",
		RebaseRequired: false,
		ServerVersion:  s.serverVersion,
		Inventory:      copyInventory(s.inventory),
	})
}

func validateSyncRequest(req SyncRequest) error {
	if req.ClientID == "" {
		return errors.New("client_id is required")
	}
	if req.BatchID == "" {
		return errors.New("batch_id is required")
	}
	if len(req.Events) == 0 {
		return errors.New("events must be non-empty")
	}
	for i, ev := range req.Events {
		if ev.EventID == "" {
			return fmt.Errorf("events[%d].event_id is required", i)
		}
		if ev.SKU == "" {
			return fmt.Errorf("events[%d].sku is required", i)
		}
		if ev.Qty <= 0 {
			return fmt.Errorf("events[%d].qty must be > 0", i)
		}
		if ev.Type != Increment && ev.Type != Decrement {
			return fmt.Errorf("events[%d].type must be INCREMENT or DECREMENT", i)
		}
	}
	return nil
}

func applyEvent(inv map[string]int, ev Event) error {
	current := inv[ev.SKU] // missing SKU defaults to 0

	switch ev.Type {
	case Increment:
		inv[ev.SKU] = current + ev.Qty
		return nil
	case Decrement:
		next := current - ev.Qty
		if next < 0 {
			return fmt.Errorf("invalid state: %s would drop below zero (%d - %d = %d)", ev.SKU, current, ev.Qty, next)
		}
		inv[ev.SKU] = next
		return nil
	default:
		return fmt.Errorf("unknown op type: %q", ev.Type)
	}
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(payload)
}

