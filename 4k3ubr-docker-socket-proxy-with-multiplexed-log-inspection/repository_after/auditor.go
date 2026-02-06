package main

import (
	"context"
	"encoding/binary"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

// LogAuditor performs real-time audit of Docker logs
type LogAuditor struct {
	config      *Config
	auditLogger *AuditLogger
}

// StreamType represents the type of stream (stdout/stderr)
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

// AuditMultiplexedStream parses Docker's binary multiplexed stream and audits it
func (a *LogAuditor) AuditMultiplexedStream(ctx context.Context, reader io.Reader, writer io.Writer, containerID string, flusher http.Flusher) error {
	header := make([]byte, 8)

	for {
		// Check if context is done (client disconnected)
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		// Read 8-byte header: [stream_type(1)][padding(3)][size(4)]
		n, err := io.ReadFull(reader, header)
		if err != nil {
			if err == io.EOF || n == 0 {
				return nil
			}
			return fmt.Errorf("failed to read header: %v", err)
		}

		// Parse header
		streamType := StreamType(header[0])
		// Bytes 1-3 are padding (unused)
		payloadSize := binary.BigEndian.Uint32(header[4:8])

		if payloadSize == 0 {
			continue
		}

		// Read payload based on size from header
		payload := make([]byte, payloadSize)
		_, err = io.ReadFull(reader, payload)
		if err != nil {
			return fmt.Errorf("failed to read payload of size %d: %v", payloadSize, err)
		}

		// Audit the payload asynchronously (non-blocking)
		go a.auditPayload(containerID, streamType, payload)

		// Write header to client (maintain binary stream integrity)
		_, err = writer.Write(header)
		if err != nil {
			return fmt.Errorf("failed to write header: %v", err)
		}

		// Write payload to client
		_, err = writer.Write(payload)
		if err != nil {
			return fmt.Errorf("failed to write payload: %v", err)
		}

		// Flush immediately to client (streaming, no buffering)
		if flusher != nil {
			flusher.Flush()
		}
	}
}

// auditPayload checks payload against regex patterns and logs matches
func (a *LogAuditor) auditPayload(containerID string, streamType StreamType, payload []byte) {
	payloadStr := string(payload)

	for _, pattern := range a.config.SensitivePatterns {
		matches := pattern.Regex.FindAllString(payloadStr, -1)
		if len(matches) > 0 {
			for _, match := range matches {
				// Redact the match
				redacted := redactString(match)

				// Log audit event
				event := AuditEvent{
					Timestamp:   time.Now(),
					ContainerID: containerID,
					StreamType:  streamType.String(),
					Pattern:     pattern.Name,
					Redacted:    redacted,
					Severity:    "HIGH",
				}

				if err := a.auditLogger.Log(event); err != nil {
					log.Printf("Failed to log audit event: %v", err)
				}
			}
		}
	}
}

// redactString redacts sensitive data, showing only first and last 2 chars
func redactString(s string) string {
	if len(s) <= 6 {
		return "***"
	}
	return s[:2] + "***" + s[len(s)-2:]
}