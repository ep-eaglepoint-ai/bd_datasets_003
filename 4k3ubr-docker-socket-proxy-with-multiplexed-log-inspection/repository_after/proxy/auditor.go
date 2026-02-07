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
	chunkOverlap     = 128       // Overlap to avoid split matches at chunk boundaries
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
	auditWg      sync.WaitGroup
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
	close(a.auditQueue)
	a.mu.Unlock()

	a.wg.Wait()     // Wait for workers to drain the queue
	a.auditWg.Wait() // Wait for all in-flight audits

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
			if err == io.EOF || err == io.ErrUnexpectedEOF || n == 0 {
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
			if flusher != nil {
				flusher.Flush()
			}
			continue
		}

		payload := make([]byte, payloadSize)
		_, err = io.ReadFull(reader, payload)
		if err != nil {
			return fmt.Errorf("failed to read payload: %v", err)
		}

		// Queue audit job (non-blocking, copies payload internally)
		a.queueAuditJob(containerID, streamType, payload)

		// Forward header + payload unchanged
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

// queueAuditJob enqueues an audit job. Holds lock through channel send to prevent
// TOCTOU race between checking a.stopped and sending on a.auditQueue.
func (a *LogAuditor) queueAuditJob(containerID string, streamType StreamType, payload []byte) {
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

	a.mu.Lock()
	defer a.mu.Unlock()

	if a.stopped || a.auditQueue == nil {
		return
	}

	select {
	case a.auditQueue <- job:
		// Enqueued successfully
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

// auditPayloadWithTimeout runs the audit scan with a timeout.
// No extra goroutine is spawned — the context controls cancellation directly,
// preventing goroutine leaks.
func (a *LogAuditor) auditPayloadWithTimeout(containerID string, streamType StreamType, payload []byte) {
	a.auditWg.Add(1)
	defer a.auditWg.Done()

	defer func() {
		if r := recover(); r != nil {
			log.Printf("Panic in audit: %v", r)
		}
	}()

	ctx, cancel := context.WithTimeout(context.Background(), regexTimeoutMs*time.Millisecond)
	defer cancel()

	// Run scan inline — context checked between chunks for cancellation
	a.auditPayloadChunked(ctx, containerID, streamType, payload)
}

// auditPayloadChunked scans payload in overlapping chunks to avoid missing
// matches that span chunk boundaries. Checks context between each chunk.
func (a *LogAuditor) auditPayloadChunked(ctx context.Context, containerID string, streamType StreamType, payload []byte) {
	if a.AuditLogger == nil {
		return
	}

	if len(payload) == 0 {
		return
	}

	// For payloads smaller than or equal to one chunk, scan directly
	if len(payload) <= chunkSize {
		a.auditChunk(containerID, streamType, payload)
		return
	}

	// Scan in overlapping chunks
	step := chunkSize - chunkOverlap
	if step <= 0 {
		step = chunkSize
	}

	for offset := 0; offset < len(payload); {
		select {
		case <-ctx.Done():
			return // Stop scanning on timeout
		default:
		}

		end := offset + chunkSize
		if end > len(payload) {
			end = len(payload)
		}

		chunk := payload[offset:end]
		a.auditChunk(containerID, streamType, chunk)

		if end == len(payload) {
			break
		}

		offset += step
	}
}

func (a *LogAuditor) auditChunk(containerID string, streamType StreamType, chunk []byte) {
	chunkStr := string(chunk)

	for _, pattern := range a.Config.SensitivePatterns {
		if pattern.Regex == nil {
			continue
		}

		indices := pattern.Regex.FindAllStringIndex(chunkStr, -1)

		for _, idx := range indices {
			if len(idx) < 2 {
				continue
			}

			match := chunkStr[idx[0]:idx[1]]
			redacted := redactString(match)

			severity := pattern.Severity
			if severity == "" {
				severity = "MEDIUM"
			}

			event := AuditEvent{
				Timestamp:   time.Now(),
				ContainerID: containerID,
				StreamType:  streamType.String(),
				Pattern:     pattern.Name,
				Redacted:    redacted,
				Severity:    severity,
			}

			if err := a.AuditLogger.Log(event); err != nil {
				log.Printf("Failed to log audit event: %v", err)
			}
		}
	}
}

func redactString(s string) string {
	if len(s) <= 6 {
		return "***"
	}
	return s[:2] + "***" + s[len(s)-2:]
}