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

func NewAuditLogger(filename string) (*AuditLogger, error) {
	return NewAuditLoggerWithRotation(filename, 100*1024*1024, 5) // 100MB, 5 files
}

func NewAuditLoggerWithRotation(filename string, maxSizeMB int, maxFiles int) (*AuditLogger, error) {
	file, err := os.OpenFile(filename, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return nil, err
	}

	info, err := file.Stat()
	if err != nil {
		file.Close()
		return nil, err
	}

	return &AuditLogger{
		file:         file,
		filename:     filename,
		maxSizeBytes: int64(maxSizeMB * 1024 * 1024),
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
		return err
	}

	dataWithNewline := append(data, '\n')

	// Check if rotation needed
	if l.currentSize+int64(len(dataWithNewline)) > l.maxSizeBytes {
		if err := l.rotate(); err != nil {
			return err
		}
	}

	n, err := l.file.Write(dataWithNewline)
	if err != nil {
		return err
	}

	l.currentSize += int64(n)
	return nil
}

func (l *AuditLogger) rotate() error {
	// Close current file
	if err := l.file.Close(); err != nil {
		return err
	}

	// Rotate existing files
	for i := l.maxFiles - 1; i >= 1; i-- {
		oldName := fmt.Sprintf("%s.%d", l.filename, i)
		newName := fmt.Sprintf("%s.%d", l.filename, i+1)
		os.Rename(oldName, newName) // Ignore errors for non-existent files
	}

	// Rename current to .1
	if err := os.Rename(l.filename, l.filename+".1"); err != nil {
		// If rename fails, try to continue anyway
	}

	// Create new file
	file, err := os.OpenFile(l.filename, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return err
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

// NEW: Metrics for observability
func (l *AuditLogger) GetMetrics() (currentSize int64, filename string) {
	l.mutex.Lock()
	defer l.mutex.Unlock()
	return l.currentSize, l.filename
}

// NewAuditLoggerWithBytes creates logger with byte-level size control (for testing)
func NewAuditLoggerWithBytes(filename string, maxSizeBytes int64, maxFiles int) (*AuditLogger, error) {
	file, err := os.OpenFile(filename, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return nil, err
	}

	info, err := file.Stat()
	if err != nil {
		file.Close()
		return nil, err
	}

	return &AuditLogger{
		file:         file,
		filename:     filename,
		maxSizeBytes: maxSizeBytes,
		maxFiles:     maxFiles,
		currentSize:  info.Size(),
	}, nil
}