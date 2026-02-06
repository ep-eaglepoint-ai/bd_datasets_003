package proxy

import (
	"encoding/json"
	"os"
	"sync"
	"time"
)

type AuditLogger struct {
	file   *os.File
	mutex  sync.Mutex
	closed bool
}

type AuditEvent struct {
	Timestamp   time.Time `json:"timestamp"`
	ContainerID string    `json:"container_id"`
	StreamType  string    `json:"stream_type"`
	Pattern     string    `json:"pattern"`
	Redacted    string    `json:"redacted_match"`
	Severity    string    `json:"severity"`
}

func NewAuditLogger(filename string) (*AuditLogger, error) {
	file, err := os.OpenFile(filename, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return nil, err
	}

	return &AuditLogger{file: file}, nil
}

func (l *AuditLogger) Log(event AuditEvent) error {
	l.mutex.Lock()
	defer l.mutex.Unlock()

	if l.closed {
		return nil // Silently ignore writes after close
	}

	data, err := json.Marshal(event)
	if err != nil {
		return err
	}

	_, err = l.file.Write(append(data, '\n'))
	return err
}

func (l *AuditLogger) Close() error {
	l.mutex.Lock()
	defer l.mutex.Unlock()

	if l.closed {
		return nil
	}

	l.closed = true
	return l.file.Close()
}