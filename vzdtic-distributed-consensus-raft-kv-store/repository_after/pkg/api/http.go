package api

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/vzdtic/distributed-consensus-raft-kv-store/repository_after/pkg/kv"
	"github.com/vzdtic/distributed-consensus-raft-kv-store/repository_after/pkg/raft"
)

type HTTPHandler struct {
	node  *raft.Node
	store *kv.Store
}

func NewHTTPHandler(node *raft.Node, store *kv.Store) *HTTPHandler {
	handler := &HTTPHandler{
		node:  node,
		store: store,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/kv/", handler.handleKV)
	mux.HandleFunc("/status", handler.handleStatus)

	return handler
}

func (h *HTTPHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	mux := http.NewServeMux()
	mux.HandleFunc("/kv/", h.handleKV)
	mux.HandleFunc("/status", h.handleStatus)
	mux.ServeHTTP(w, r)
}

func (h *HTTPHandler) handleKV(w http.ResponseWriter, r *http.Request) {
	key := r.URL.Path[len("/kv/"):]
	if key == "" {
		http.Error(w, "key required", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodGet:
		value, ok := h.store.Get(key)
		if !ok {
			http.Error(w, "key not found", http.StatusNotFound)
			return
		}
		json.NewEncoder(w).Encode(map[string]string{"value": value})

	case http.MethodPut, http.MethodPost:
		var req struct {
			Value string `json:"value"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
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
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

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
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
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

	json.NewEncoder(w).Encode(status)
}