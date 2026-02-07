package proxy

import (
	"encoding/json"
	"fmt"
	"os"
	"sync"
	"time"
)

type AuditLogger struct {
	file         *os.File
	mutex        sync.Mutex
	closed       bool
	filename     string
	maxSizeBytes int64
	maxFiles     int
	currentSize  int64
}

type AuditEvent struct {
	Timestamp   time.Time `json:"timestamp"`
	ContainerID string    `json:"container_id"`
	StreamType  string    `json:"stream_type"`
	Pattern     string    `json:"pattern"`
	Redacted    string    `json:"redacted_match"`
	Severity    string    `json:"severity"`
}

// NewAuditLogger creates a logger with default 100MB max and 5 rotated files
func NewAuditLogger(filename string) (*AuditLogger, error) {
	return NewAuditLoggerWithRotation(filename, 100, 5) // 100MB, 5 files
}

// NewAuditLoggerWithRotation creates a logger with MB-level size control
func NewAuditLoggerWithRotation(filename string, maxSizeMB int, maxFiles int) (*AuditLogger, error) {
	if maxSizeMB <= 0 {
		maxSizeMB = 100
	}
	if maxFiles <= 0 {
		maxFiles = 5
	}

	file, err := os.OpenFile(filename, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return nil, fmt.Errorf("failed to open audit log %s: %w", filename, err)
	}

	info, err := file.Stat()
	if err != nil {
		file.Close()
		return nil, fmt.Errorf("failed to stat audit log %s: %w", filename, err)
	}

	return &AuditLogger{
		file:         file,
		filename:     filename,
		maxSizeBytes: int64(maxSizeMB) * 1024 * 1024,
		maxFiles:     maxFiles,
		currentSize:  info.Size(),
	}, nil
}

// NewAuditLoggerWithBytes creates logger with byte-level size control (for testing)
func NewAuditLoggerWithBytes(filename string, maxSizeBytes int64, maxFiles int) (*AuditLogger, error) {
	if maxSizeBytes <= 0 {
		maxSizeBytes = 100 * 1024 * 1024
	}
	if maxFiles <= 0 {
		maxFiles = 5
	}

	file, err := os.OpenFile(filename, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return nil, fmt.Errorf("failed to open audit log %s: %w", filename, err)
	}

	info, err := file.Stat()
	if err != nil {
		file.Close()
		return nil, fmt.Errorf("failed to stat audit log %s: %w", filename, err)
	}

	return &AuditLogger{
		file:         file,
		filename:     filename,
		maxSizeBytes: maxSizeBytes,
		maxFiles:     maxFiles,
		currentSize:  info.Size(),
	}, nil
}

func (l *AuditLogger) Log(event AuditEvent) error {
	l.mutex.Lock()
	defer l.mutex.Unlock()

	if l.closed {
		return nil
	}

	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal audit event: %w", err)
	}

	dataWithNewline := append(data, '\n')

	// Check if rotation needed
	if l.currentSize+int64(len(dataWithNewline)) > l.maxSizeBytes {
		if err := l.rotate(); err != nil {
			return fmt.Errorf("failed to rotate audit log: %w", err)
		}
	}

	n, err := l.file.Write(dataWithNewline)
	if err != nil {
		return fmt.Errorf("failed to write audit event: %w", err)
	}

	l.currentSize += int64(n)
	return nil
}

func (l *AuditLogger) rotate() error {
	// Close current file
	if err := l.file.Close(); err != nil {
		return fmt.Errorf("failed to close current log: %w", err)
	}

	// Rotate existing files (shift .1 -> .2, .2 -> .3, etc.)
	for i := l.maxFiles - 1; i >= 1; i-- {
		oldName := fmt.Sprintf("%s.%d", l.filename, i)
		newName := fmt.Sprintf("%s.%d", l.filename, i+1)
		os.Rename(oldName, newName) // Ignore errors for non-existent files
	}

	// Rename current to .1
	os.Rename(l.filename, l.filename+".1") // Ignore error if file doesn't exist

	// Create new file
	file, err := os.OpenFile(l.filename, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return fmt.Errorf("failed to create new log file: %w", err)
	}

	l.file = file
	l.currentSize = 0
	return nil
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

// GetMetrics returns observability data
func (l *AuditLogger) GetMetrics() (currentSize int64, filename string) {
	l.mutex.Lock()
	defer l.mutex.Unlock()
	return l.currentSize, l.filename
}