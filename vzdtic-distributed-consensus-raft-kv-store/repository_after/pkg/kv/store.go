package kv

import (
	"sync"

	"github.com/vzdtic/distributed-consensus-raft-kv-store/repository_after/pkg/raft"
)

// Store implements a simple in-memory key-value store
type Store struct {
	mu   sync.RWMutex
	data map[string]string
}

// NewStore creates a new KV store
func NewStore() *Store {
	return &Store{
		data: make(map[string]string),
	}
}

// Apply applies a command to the state machine
func (s *Store) Apply(cmd raft.Command) string {
	s.mu.Lock()
	defer s.mu.Unlock()

	switch cmd.Type {
	case raft.CommandSet:
		s.data[cmd.Key] = cmd.Value
		return cmd.Value
	case raft.CommandDelete:
		delete(s.data, cmd.Key)
		return ""
	case raft.CommandNoop:
		return ""
	case raft.CommandAddNode, raft.CommandRemoveNode:
		// Membership changes are handled by the Raft node
		return ""
	default:
		return ""
	}
}

// Get retrieves a value from the store
func (s *Store) Get(key string) (string, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	value, ok := s.data[key]
	return value, ok
}

// Set stores a key-value pair
func (s *Store) Set(key, value string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data[key] = value
}

// Delete removes a key from the store
func (s *Store) Delete(key string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.data, key)
}

// GetSnapshot returns a copy of the current state
func (s *Store) GetSnapshot() map[string]string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	snapshot := make(map[string]string)
	for k, v := range s.data {
		snapshot[k] = v
	}
	return snapshot
}

// RestoreSnapshot restores state from a snapshot
func (s *Store) RestoreSnapshot(data map[string]string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.data = make(map[string]string)
	for k, v := range data {
		s.data[k] = v
	}
}

// Size returns the number of keys in the store
func (s *Store) Size() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.data)
}

// Clear removes all keys from the store
func (s *Store) Clear() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data = make(map[string]string)
}