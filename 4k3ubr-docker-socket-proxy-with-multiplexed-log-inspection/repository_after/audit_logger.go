package main

import (
	"encoding/json"
	"os"
	"sync"
	"time"
)

// AuditLogger handles writing audit events to a file
type AuditLogger struct {
	file  *os.File
	mutex sync.Mutex
}

// AuditEvent represents a security audit event
type AuditEvent struct {
	Timestamp   time.Time `json:"timestamp"`
	ContainerID string    `json:"container_id"`
	StreamType  string    `json:"stream_type"`
	Pattern     string    `json:"pattern"`
	Redacted    string    `json:"redacted_match"`
	Severity    string    `json:"severity"`
}

// NewAuditLogger creates a new audit logger
func NewAuditLogger(filename string) (*AuditLogger, error) {
	file, err := os.OpenFile(filename, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return nil, err
	}

	return &AuditLogger{
		file: file,
	}, nil
}

// Log writes an audit event to the log file
func (l *AuditLogger) Log(event AuditEvent) error {
	l.mutex.Lock()
	defer l.mutex.Unlock()

	data, err := json.Marshal(event)
	if err != nil {
		return err
	}

	_, err = l.file.Write(append(data, '\n'))
	return err
}

// Close closes the audit log file
func (l *AuditLogger) Close() error {
	return l.file.Close()
}