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
	maxAuditScanSize = 64 * 1024
	regexTimeoutMs   = 100
	maxLineLength    = 10 * 1024
	auditWorkerCount = 4
	auditQueueSize   = 1000
	chunkSize        = 16 * 1024 // Scan in 16KB chunks
)

type AuditJob struct {
	ContainerID string
	StreamType  StreamType
	Payload     []byte
}

type LogAuditor struct {
	Config      *Config
	AuditLogger *AuditLogger

	auditQueue   chan AuditJob
	wg           sync.WaitGroup
	auditWg      sync.WaitGroup // NEW: Track in-flight audits
	started      bool
	stopped      bool
	mu           sync.Mutex
	droppedCount int64
}

func (a *LogAuditor) StartWorkers() {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.started || a.stopped {
		return
	}

	a.auditQueue = make(chan AuditJob, auditQueueSize)
	a.started = true

	for i := 0; i < auditWorkerCount; i++ {
		a.wg.Add(1)
		go a.auditWorker()
	}
}

func (a *LogAuditor) StopWorkers() {
	a.mu.Lock()
	if !a.started || a.stopped {
		a.mu.Unlock()
		return
	}
	a.stopped = true
	a.mu.Unlock()

	close(a.auditQueue)
	a.wg.Wait() // Wait for workers to finish

	a.auditWg.Wait() // NEW: Wait for all in-flight audits

	dropped := atomic.LoadInt64(&a.droppedCount)
	if dropped > 0 {
		log.Printf("Audit summary: %d audits dropped due to queue full", dropped)
	}
}

func (a *LogAuditor) auditWorker() {
	defer a.wg.Done()

	for job := range a.auditQueue {
		a.auditPayloadWithTimeout(job.ContainerID, job.StreamType, job.Payload)
	}
}

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

func (a *LogAuditor) AuditMultiplexedStream(ctx context.Context, reader io.Reader, writer io.Writer, containerID string, flusher http.Flusher) error {
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
			if _, err := writer.Write(header); err != nil {
				return err
			}
			continue
		}

		payload := make([]byte, payloadSize)
		_, err = io.ReadFull(reader, payload)
		if err != nil {
			return fmt.Errorf("failed to read payload: %v", err)
		}

		a.queueAuditJob(containerID, streamType, payload)

		if _, err := writer.Write(header); err != nil {
			return err
		}

		if _, err := writer.Write(payload); err != nil {
			return err
		}

		if flusher != nil {
			flusher.Flush()
		}
	}
}

func (a *LogAuditor) queueAuditJob(containerID string, streamType StreamType, payload []byte) {
	a.mu.Lock()
	if a.stopped || a.auditQueue == nil {
		a.mu.Unlock()
		return
	}
	a.mu.Unlock()

	auditSize := len(payload)
	if auditSize > maxAuditScanSize {
		auditSize = maxAuditScanSize
	}

	auditPayload := make([]byte, auditSize)
	copy(auditPayload, payload[:auditSize])

	job := AuditJob{
		ContainerID: containerID,
		StreamType:  streamType,
		Payload:     auditPayload,
	}

	select {
	case a.auditQueue <- job:
	default:
		atomic.AddInt64(&a.droppedCount, 1)
	}
}

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

		auditSize := len(line)
		if auditSize > maxAuditScanSize {
			auditSize = maxAuditScanSize
		}
		lineCopy := make([]byte, auditSize)
		copy(lineCopy, line[:auditSize])

		a.queueAuditJob(containerID, StreamStdout, lineCopy)

		if _, err := writer.Write(line); err != nil {
			return err
		}
		if _, err := writer.Write([]byte("\n")); err != nil {
			return err
		}
	}

	return scanner.Err()
}

func (a *LogAuditor) auditPayloadWithTimeout(containerID string, streamType StreamType, payload []byte) {
	a.auditWg.Add(1) // NEW: Track this audit
	defer a.auditWg.Done()

	defer func() {
		if r := recover(); r != nil {
			log.Printf("Panic in audit: %v", r)
		}
	}()

	ctx, cancel := context.WithTimeout(context.Background(), regexTimeoutMs*time.Millisecond)
	defer cancel()

	done := make(chan struct{})
	go func() {
		defer close(done)
		a.auditPayloadChunked(containerID, streamType, payload) // NEW: Use chunked scanning
	}()

	select {
	case <-done:
		// Completed successfully
	case <-ctx.Done():
		// Timeout - goroutine may still run but we move on
		// The spawned goroutine will complete eventually
	}
}

// NEW: Chunked scanning to avoid expensive single-pass scans
func (a *LogAuditor) auditPayloadChunked(containerID string, streamType StreamType, payload []byte) {
	if a.AuditLogger == nil {
		return
	}

	// Scan in chunks to limit regex execution time per iteration
	for offset := 0; offset < len(payload); offset += chunkSize {
		end := offset + chunkSize
		if end > len(payload) {
			end = len(payload)
		}

		chunk := payload[offset:end]
		a.auditChunk(containerID, streamType, chunk)
	}
}

func (a *LogAuditor) auditChunk(containerID string, streamType StreamType, chunk []byte) {
	chunkStr := string(chunk)

	for _, pattern := range a.Config.SensitivePatterns {
		indices := pattern.Regex.FindAllStringIndex(chunkStr, -1)

		for _, idx := range indices {
			if len(idx) < 2 {
				continue
			}

			match := chunkStr[idx[0]:idx[1]]
			redacted := redactString(match)

			event := AuditEvent{
				Timestamp:   time.Now(),
				ContainerID: containerID,
				StreamType:  streamType.String(),
				Pattern:     pattern.Name,
				Redacted:    redacted,
				Severity:    pattern.Severity, // NEW: Use pattern severity
			}

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