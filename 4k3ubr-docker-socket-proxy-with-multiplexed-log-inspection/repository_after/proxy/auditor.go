package proxy

import (
	"bufio"
	"context"
	"encoding/binary"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"sync/atomic"
	"time"
)

const (
	maxAuditScanSize = 64 * 1024 // Only SCAN first 64KB, but forward ALL bytes
	regexTimeoutMs   = 100
	maxLineLength    = 10 * 1024
	auditWorkerCount = 4    // Worker pool size
	auditQueueSize   = 1000 // Buffered channel size
)

// AuditJob represents a job for the audit worker pool
type AuditJob struct {
	ContainerID string
	StreamType  StreamType
	Payload     []byte
}

// LogAuditor performs real-time audit of Docker logs
type LogAuditor struct {
	Config      *Config
	AuditLogger *AuditLogger

	// Worker pool
	auditQueue   chan AuditJob
	wg           sync.WaitGroup
	started      bool
	stopped      bool
	mu           sync.Mutex
	droppedCount int64 // Atomic counter for dropped audits
}

// StartWorkers initializes the audit worker pool
func (a *LogAuditor) StartWorkers() {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.started || a.stopped {
		return
	}

	a.auditQueue = make(chan AuditJob, auditQueueSize)
	a.started = true

	// Start fixed number of workers
	for i := 0; i < auditWorkerCount; i++ {
		a.wg.Add(1)
		go a.auditWorker()
	}
}

// StopWorkers gracefully stops the worker pool
func (a *LogAuditor) StopWorkers() {
	a.mu.Lock()
	if !a.started || a.stopped {
		a.mu.Unlock()
		return
	}
	a.stopped = true
	a.mu.Unlock()

	close(a.auditQueue)
	a.wg.Wait()

	// Log summary of dropped audits
	dropped := atomic.LoadInt64(&a.droppedCount)
	if dropped > 0 {
		log.Printf("Audit summary: %d audits dropped due to queue full", dropped)
	}
}

// auditWorker processes audit jobs from the queue
func (a *LogAuditor) auditWorker() {
	defer a.wg.Done()

	for job := range a.auditQueue {
		a.auditPayloadWithTimeout(job.ContainerID, job.StreamType, job.Payload)
	}
}

// StreamType represents the type of stream
type StreamType byte

const (
	StreamStdin  StreamType = 0
	StreamStdout StreamType = 1
	StreamStderr StreamType = 2
)

func (s StreamType) String() string {
	switch s {
	case StreamStdin:
		return "stdin"
	case StreamStdout:
		return "stdout"
	case StreamStderr:
		return "stderr"
	default:
		return "unknown"
	}
}

// AuditMultiplexedStream parses Docker's binary multiplexed stream
func (a *LogAuditor) AuditMultiplexedStream(ctx context.Context, reader io.Reader, writer io.Writer, containerID string, flusher http.Flusher) error {
	// Ensure workers are started
	a.StartWorkers()

	header := make([]byte, 8)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		n, err := io.ReadFull(reader, header)
		if err != nil {
			if err == io.EOF || n == 0 {
				return nil
			}
			return fmt.Errorf("failed to read header: %v", err)
		}

		streamType := StreamType(header[0])
		payloadSize := binary.BigEndian.Uint32(header[4:8])

		if payloadSize == 0 {
			// Write empty header anyway to preserve stream
			if _, err := writer.Write(header); err != nil {
				return err
			}
			continue
		}

		// Read FULL payload - DO NOT TRUNCATE
		payload := make([]byte, payloadSize)
		_, err = io.ReadFull(reader, payload)
		if err != nil {
			return fmt.Errorf("failed to read payload: %v", err)
		}

		// Queue audit job - only scan first N bytes but don't modify payload
		a.queueAuditJob(containerID, streamType, payload)

		// Write FULL header to client (preserves stream integrity)
		if _, err := writer.Write(header); err != nil {
			return err
		}

		// Write FULL payload to client (preserves stream integrity)
		if _, err := writer.Write(payload); err != nil {
			return err
		}

		if flusher != nil {
			flusher.Flush()
		}
	}
}

// queueAuditJob adds an audit job to the worker queue with backpressure
func (a *LogAuditor) queueAuditJob(containerID string, streamType StreamType, payload []byte) {
	a.mu.Lock()
	if a.stopped || a.auditQueue == nil {
		a.mu.Unlock()
		return
	}
	a.mu.Unlock()

	// Only copy what we need to audit
	auditSize := len(payload)
	if auditSize > maxAuditScanSize {
		auditSize = maxAuditScanSize
	}

	// Make a copy for the worker (original payload is forwarded to client)
	auditPayload := make([]byte, auditSize)
	copy(auditPayload, payload[:auditSize])

	job := AuditJob{
		ContainerID: containerID,
		StreamType:  streamType,
		Payload:     auditPayload,
	}

	// Non-blocking send with drop policy
	select {
	case a.auditQueue <- job:
		// Successfully queued
	default:
		// Queue full - drop this audit (backpressure) - just count, don't log each one
		atomic.AddInt64(&a.droppedCount, 1)
	}
}

// AuditPlainStream audits non-multiplexed streams
func (a *LogAuditor) AuditPlainStream(ctx context.Context, reader io.Reader, writer io.Writer, containerID string) error {
	a.StartWorkers()

	scanner := bufio.NewScanner(reader)
	buf := make([]byte, maxLineLength)
	scanner.Buffer(buf, maxLineLength)

	for scanner.Scan() {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		line := scanner.Bytes()

		// Copy for audit (limited size)
		auditSize := len(line)
		if auditSize > maxAuditScanSize {
			auditSize = maxAuditScanSize
		}
		lineCopy := make([]byte, auditSize)
		copy(lineCopy, line[:auditSize])

		a.queueAuditJob(containerID, StreamStdout, lineCopy)

		// Write FULL line to client
		if _, err := writer.Write(line); err != nil {
			return err
		}
		if _, err := writer.Write([]byte("\n")); err != nil {
			return err
		}
	}

	return scanner.Err()
}

// auditPayloadWithTimeout runs audit with proper timeout
func (a *LogAuditor) auditPayloadWithTimeout(containerID string, streamType StreamType, payload []byte) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("Panic in audit: %v", r)
		}
	}()

	// Create context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), regexTimeoutMs*time.Millisecond)
	defer cancel()

	// Run audit in separate goroutine
	done := make(chan struct{})
	go func() {
		defer close(done)
		a.auditPayload(containerID, streamType, payload)
	}()

	select {
	case <-done:
		// Completed successfully
	case <-ctx.Done():
		// Timeout - goroutine may still be running but we move on
		// Don't log each timeout to reduce noise
	}
}

// auditPayload performs the actual regex matching
func (a *LogAuditor) auditPayload(containerID string, streamType StreamType, payload []byte) {
	// Check if logger is still available
	if a.AuditLogger == nil {
		return
	}

	payloadStr := string(payload)

	for _, pattern := range a.Config.SensitivePatterns {
		// Find all match indices
		indices := pattern.Regex.FindAllStringIndex(payloadStr, -1)

		for _, idx := range indices {
			if len(idx) < 2 {
				continue
			}

			match := payloadStr[idx[0]:idx[1]]
			redacted := redactString(match)

			event := AuditEvent{
				Timestamp:   time.Now(),
				ContainerID: containerID,
				StreamType:  streamType.String(),
				Pattern:     pattern.Name,
				Redacted:    redacted,
				Severity:    "HIGH",
			}

			// Ignore errors silently to avoid log noise during shutdown
			a.AuditLogger.Log(event)
		}
	}
}

func redactString(s string) string {
	if len(s) <= 6 {
		return "***"
	}
	return s[:2] + "***" + s[len(s)-2:]
}