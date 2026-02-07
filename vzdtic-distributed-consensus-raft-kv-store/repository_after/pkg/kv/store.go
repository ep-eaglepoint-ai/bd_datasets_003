package kv

import (
	"bytes"
	"encoding/gob"
	"sync"
)

// Command types for the KV store
type CommandType int

const (
	CommandSet CommandType = iota
	CommandDelete
)

// Command represents a command to be applied to the state machine
type Command struct {
	Type      CommandType
	Key       string
	Value     []byte
	ClientID  string
	RequestID uint64
}

// ClientSession tracks the last request from each client for deduplication
type ClientSession struct {
	LastRequestID uint64
	Response      interface{}
}

// Store represents an in-memory key-value state machine
type Store struct {
	mu       sync.RWMutex
	data     map[string][]byte
	sessions map[string]*ClientSession
}

// New creates a new KV store
func New() *Store {
	return &Store{
		data:     make(map[string][]byte),
		sessions: make(map[string]*ClientSession),
	}
}

// Apply applies a command to the state machine
func (s *Store) Apply(command []byte) (interface{}, error) {
	var cmd Command
	dec := gob.NewDecoder(bytes.NewReader(command))
	if err := dec.Decode(&cmd); err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// Check for duplicate request
	if session, ok := s.sessions[cmd.ClientID]; ok {
		if session.LastRequestID >= cmd.RequestID {
			return session.Response, nil
		}
	}

	var response interface{}
	switch cmd.Type {
	case CommandSet:
		s.data[cmd.Key] = cmd.Value
		response = true
	case CommandDelete:
		delete(s.data, cmd.Key)
		response = true
	}

	// Update session
	s.sessions[cmd.ClientID] = &ClientSession{
		LastRequestID: cmd.RequestID,
		Response:      response,
	}

	return response, nil
}

// Get retrieves a value by key
func (s *Store) Get(key string) ([]byte, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	value, ok := s.data[key]
	if !ok {
		return nil, false
	}

	result := make([]byte, len(value))
	copy(result, value)
	return result, true
}

// GetAll returns all key-value pairs
func (s *Store) GetAll() map[string][]byte {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make(map[string][]byte)
	for k, v := range s.data {
		result[k] = v
	}
	return result
}

// Snapshot creates a snapshot of the current state
func (s *Store) Snapshot() ([]byte, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	state := struct {
		Data     map[string][]byte
		Sessions map[string]*ClientSession
	}{
		Data:     s.data,
		Sessions: s.sessions,
	}

	var buf bytes.Buffer
	enc := gob.NewEncoder(&buf)
	if err := enc.Encode(state); err != nil {
		return nil, err
	}

	return buf.Bytes(), nil
}

// Restore restores state from a snapshot
func (s *Store) Restore(data []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	var state struct {
		Data     map[string][]byte
		Sessions map[string]*ClientSession
	}

	dec := gob.NewDecoder(bytes.NewReader(data))
	if err := dec.Decode(&state); err != nil {
		return err
	}

	s.data = state.Data
	s.sessions = state.Sessions
	return nil
}

// EncodeCommand encodes a command for log storage
func EncodeCommand(cmdType CommandType, key string, value []byte, clientID string, requestID uint64) ([]byte, error) {
	cmd := Command{
		Type:      cmdType,
		Key:       key,
		Value:     value,
		ClientID:  clientID,
		RequestID: requestID,
	}

	var buf bytes.Buffer
	enc := gob.NewEncoder(&buf)
	if err := enc.Encode(cmd); err != nil {
		return nil, err
	}

	return buf.Bytes(), nil
}

// Size returns the number of keys in the store
func (s *Store) Size() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.data)
}