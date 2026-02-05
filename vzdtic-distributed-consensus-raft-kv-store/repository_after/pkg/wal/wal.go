package wal

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/vzdtic/distributed-consensus-raft-kv-store/repository_after/pkg/raft"
)

// WAL implements a write-ahead log for Raft persistence
type WAL struct {
	mu           sync.Mutex
	dir          string
	stateFile    string
	snapshotFile string
	closed       bool
}

// NewWAL creates a new WAL instance
func NewWAL(dir string) (*WAL, error) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create WAL directory: %w", err)
	}

	return &WAL{
		dir:          dir,
		stateFile:    filepath.Join(dir, "state.json"),
		snapshotFile: filepath.Join(dir, "snapshot.json"),
		closed:       false,
	}, nil
}

// ensureDir ensures the WAL directory exists
func (w *WAL) ensureDir() error {
	if _, err := os.Stat(w.dir); os.IsNotExist(err) {
		return os.MkdirAll(w.dir, 0755)
	}
	return nil
}

// Save persists the current Raft state
func (w *WAL) Save(state *raft.PersistentState) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	if w.closed {
		return nil
	}

	// Ensure directory exists
	if err := w.ensureDir(); err != nil {
		return fmt.Errorf("failed to ensure WAL directory: %w", err)
	}

	data, err := json.Marshal(state)
	if err != nil {
		return fmt.Errorf("failed to marshal state: %w", err)
	}

	// Write to temporary file first
	tmpFile := w.stateFile + ".tmp"
	if err := os.WriteFile(tmpFile, data, 0644); err != nil {
		return fmt.Errorf("failed to write state file: %w", err)
	}

	// Atomic rename
	if err := os.Rename(tmpFile, w.stateFile); err != nil {
		return fmt.Errorf("failed to rename state file: %w", err)
	}

	return nil
}

// Load restores the Raft state from disk
func (w *WAL) Load() (*raft.PersistentState, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	data, err := os.ReadFile(w.stateFile)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to read state file: %w", err)
	}

	var state raft.PersistentState
	if err := json.Unmarshal(data, &state); err != nil {
		return nil, fmt.Errorf("failed to unmarshal state: %w", err)
	}

	return &state, nil
}

// SaveSnapshot persists a snapshot
func (w *WAL) SaveSnapshot(snapshot *raft.Snapshot) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	if w.closed {
		return nil
	}

	// Ensure directory exists
	if err := w.ensureDir(); err != nil {
		return fmt.Errorf("failed to ensure WAL directory: %w", err)
	}

	data, err := json.Marshal(snapshot)
	if err != nil {
		return fmt.Errorf("failed to marshal snapshot: %w", err)
	}

	tmpFile := w.snapshotFile + ".tmp"
	if err := os.WriteFile(tmpFile, data, 0644); err != nil {
		return fmt.Errorf("failed to write snapshot file: %w", err)
	}

	if err := os.Rename(tmpFile, w.snapshotFile); err != nil {
		return fmt.Errorf("failed to rename snapshot file: %w", err)
	}

	return nil
}

// LoadSnapshot restores a snapshot from disk
func (w *WAL) LoadSnapshot() (*raft.Snapshot, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	data, err := os.ReadFile(w.snapshotFile)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to read snapshot file: %w", err)
	}

	var snapshot raft.Snapshot
	if err := json.Unmarshal(data, &snapshot); err != nil {
		return nil, fmt.Errorf("failed to unmarshal snapshot: %w", err)
	}

	return &snapshot, nil
}

// Close closes the WAL
func (w *WAL) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.closed = true
	return nil
}

// Clear removes all WAL files (for testing)
func (w *WAL) Clear() error {
	w.mu.Lock()
	defer w.mu.Unlock()

	os.Remove(w.stateFile)
	os.Remove(w.snapshotFile)
	return nil
}