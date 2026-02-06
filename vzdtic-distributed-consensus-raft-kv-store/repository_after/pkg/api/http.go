package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/vzdtic/distributed-consensus-raft-kv-store/repository_after/pkg/kv"
	"github.com/vzdtic/distributed-consensus-raft-kv-store/repository_after/pkg/raft"
)

type HTTPHandler struct {
	node  *raft.Node
	store *kv.Store
	mux   *http.ServeMux
}

func NewHTTPHandler(node *raft.Node, store *kv.Store) *HTTPHandler {
	h := &HTTPHandler{
		node:  node,
		store: store,
		mux:   http.NewServeMux(),
	}

	h.mux.HandleFunc("/kv/", h.handleKV)
	h.mux.HandleFunc("/status", h.handleStatus)

	return h
}

func (h *HTTPHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h.mux.ServeHTTP(w, r)
}

func (h *HTTPHandler) handleKV(w http.ResponseWriter, r *http.Request) {
	key := strings.TrimPrefix(r.URL.Path, "/kv/")
	if key == "" {
		http.Error(w, "key required", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodGet:
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		// First check if we're the leader
		if !h.node.IsLeader() {
			h.respondNotLeader(w)
			return
		}

		value, err := h.node.Read(ctx, key)
		if err != nil {
			if err == raft.ErrNotLeader {
				h.respondNotLeader(w)
				return
			}
			if err == raft.ErrTimeout || err == context.DeadlineExceeded {
				http.Error(w, "request timeout", http.StatusGatewayTimeout)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Check if key exists (value could be empty string)
		exists := h.store.Exists(key)
		if !exists {
			http.Error(w, "key not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"value": value})

	case http.MethodPut, http.MethodPost:
		var req struct {
			Value string `json:"value"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body: "+err.Error(), http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		cmd := raft.Command{
			Type:  raft.CommandSet,
			Key:   key,
			Value: req.Value,
		}

		_, err := h.node.SubmitWithResult(ctx, cmd)
		if err != nil {
			if err == raft.ErrNotLeader {
				h.respondNotLeader(w)
				return
			}
			if err == context.DeadlineExceeded {
				http.Error(w, "request timeout", http.StatusGatewayTimeout)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})

	case http.MethodDelete:
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		cmd := raft.Command{
			Type: raft.CommandDelete,
			Key:  key,
		}

		_, err := h.node.SubmitWithResult(ctx, cmd)
		if err != nil {
			if err == raft.ErrNotLeader {
				h.respondNotLeader(w)
				return
			}
			if err == context.DeadlineExceeded {
				http.Error(w, "request timeout", http.StatusGatewayTimeout)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *HTTPHandler) respondNotLeader(w http.ResponseWriter) {
	leaderID := h.node.GetLeaderID()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusServiceUnavailable)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"error":     "not leader",
		"leader_id": leaderID,
	})
}

func (h *HTTPHandler) handleStatus(w http.ResponseWriter, r *http.Request) {
	term, isLeader := h.node.GetState()

	status := map[string]interface{}{
		"id":           h.node.GetID(),
		"term":         term,
		"is_leader":    isLeader,
		"leader_id":    h.node.GetLeaderID(),
		"commit_index": h.node.GetCommitIndex(),
		"cluster_size": h.node.GetClusterSize(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}