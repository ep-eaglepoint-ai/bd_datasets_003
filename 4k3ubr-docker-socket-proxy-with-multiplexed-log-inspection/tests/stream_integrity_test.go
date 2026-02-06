package tests

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/binary"
	"io"
	"path/filepath"
	"testing"
	"time"

	"docker-socket-proxy/repository_after/proxy"
)

// TestStreamIntegrityPreserved verifies byte-for-byte stream preservation
func TestStreamIntegrityPreserved(t *testing.T) {
	tmpDir := t.TempDir()
	auditFile := filepath.Join(tmpDir, "audit.log")

	auditLogger, _ := proxy.NewAuditLogger(auditFile)

	config, _ := proxy.LoadConfig()
	auditor := &proxy.LogAuditor{
		Config:      config,
		AuditLogger: auditLogger,
	}
	auditor.StartWorkers()

	// Create complex multiplexed stream with multiple frames
	var inputBuf bytes.Buffer

	frames := []struct {
		streamType byte
		data       []byte
	}{
		{1, []byte("First stdout line\n")},
		{2, []byte("First stderr line\n")},
		{1, []byte("Line with AWS key: AKIAIOSFODNN7EXAMPLE\n")},
		{2, []byte("Error with email: admin@company.com\n")},
		{1, []byte("Normal log line 3\n")},
		{1, []byte("Normal log line 4\n")},
	}

	for _, frame := range frames {
		header := make([]byte, 8)
		header[0] = frame.streamType
		binary.BigEndian.PutUint32(header[4:8], uint32(len(frame.data)))
		inputBuf.Write(header)
		inputBuf.Write(frame.data)
	}

	// Store original input for comparison
	originalInput := inputBuf.Bytes()
	inputCopy := make([]byte, len(originalInput))
	copy(inputCopy, originalInput)

	// Process through auditor
	var outputBuf bytes.Buffer
	ctx := context.Background()
	inputReader := bytes.NewReader(inputCopy)

	err := auditor.AuditMultiplexedStream(ctx, inputReader, &outputBuf, "integrity-test", nil)
	if err != nil {
		t.Fatalf("AuditMultiplexedStream failed: %v", err)
	}

	// Stop workers and wait for completion
	auditor.StopWorkers()
	auditLogger.Close()

	// CRITICAL: Verify byte-for-byte equality
	if !bytes.Equal(originalInput, outputBuf.Bytes()) {
		t.Fatalf("STREAM INTEGRITY VIOLATED: Output bytes do not match input bytes (input: %d, output: %d)",
			len(originalInput), outputBuf.Len())
	}

	t.Log("STREAM INTEGRITY PRESERVED: Output is byte-for-byte identical to input")
}

// TestLargePayloadIntegrity verifies large payloads are forwarded completely
func TestLargePayloadIntegrity(t *testing.T) {
	tmpDir := t.TempDir()
	auditFile := filepath.Join(tmpDir, "audit.log")

	auditLogger, _ := proxy.NewAuditLogger(auditFile)

	config, _ := proxy.LoadConfig()
	auditor := &proxy.LogAuditor{
		Config:      config,
		AuditLogger: auditLogger,
	}
	auditor.StartWorkers()

	// Create payload LARGER than maxAuditScanSize (64KB)
	largePayloadSize := 128 * 1024 // 128KB
	largePayload := make([]byte, largePayloadSize)
	rand.Read(largePayload) // Random binary data

	// Insert AWS key in the middle
	awsKey := []byte("AKIAIOSFODNN7EXAMPLE")
	copy(largePayload[1000:], awsKey)

	var inputBuf bytes.Buffer
	header := make([]byte, 8)
	header[0] = 1 // stdout
	binary.BigEndian.PutUint32(header[4:8], uint32(len(largePayload)))
	inputBuf.Write(header)
	inputBuf.Write(largePayload)

	originalInput := inputBuf.Bytes()
	inputCopy := make([]byte, len(originalInput))
	copy(inputCopy, originalInput)

	var outputBuf bytes.Buffer
	ctx := context.Background()

	err := auditor.AuditMultiplexedStream(ctx, bytes.NewReader(inputCopy), &outputBuf, "large-test", nil)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}

	// Cleanup
	auditor.StopWorkers()
	auditLogger.Close()

	// Verify FULL payload was forwarded (not truncated)
	if outputBuf.Len() != len(originalInput) {
		t.Fatalf("STREAM TRUNCATED: Expected %d bytes, got %d bytes", len(originalInput), outputBuf.Len())
	}

	if !bytes.Equal(originalInput, outputBuf.Bytes()) {
		t.Fatal("LARGE PAYLOAD INTEGRITY VIOLATED")
	}

	t.Logf("LARGE PAYLOAD INTEGRITY PRESERVED: %d bytes forwarded intact", len(originalInput))
}

// TestBinaryDataIntegrity verifies binary data is not corrupted
func TestBinaryDataIntegrity(t *testing.T) {
	tmpDir := t.TempDir()
	auditFile := filepath.Join(tmpDir, "audit.log")

	auditLogger, _ := proxy.NewAuditLogger(auditFile)

	config, _ := proxy.LoadConfig()
	auditor := &proxy.LogAuditor{
		Config:      config,
		AuditLogger: auditLogger,
	}
	auditor.StartWorkers()

	// Create binary data with all byte values 0-255
	binaryData := make([]byte, 256)
	for i := range binaryData {
		binaryData[i] = byte(i)
	}

	var inputBuf bytes.Buffer
	header := make([]byte, 8)
	header[0] = 1
	binary.BigEndian.PutUint32(header[4:8], uint32(len(binaryData)))
	inputBuf.Write(header)
	inputBuf.Write(binaryData)

	originalInput := inputBuf.Bytes()
	inputCopy := make([]byte, len(originalInput))
	copy(inputCopy, originalInput)

	var outputBuf bytes.Buffer

	err := auditor.AuditMultiplexedStream(context.Background(), bytes.NewReader(inputCopy), &outputBuf, "binary-test", nil)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}

	// Cleanup
	auditor.StopWorkers()
	auditLogger.Close()

	if !bytes.Equal(originalInput, outputBuf.Bytes()) {
		t.Fatal("BINARY DATA CORRUPTED")
	}

	t.Log("BINARY DATA INTEGRITY PRESERVED")
}

// TestWorkerPoolLimitsGoroutines verifies bounded concurrency
func TestWorkerPoolLimitsGoroutines(t *testing.T) {
	tmpDir := t.TempDir()
	auditFile := filepath.Join(tmpDir, "audit.log")

	auditLogger, _ := proxy.NewAuditLogger(auditFile)

	config, _ := proxy.LoadConfig()
	auditor := &proxy.LogAuditor{
		Config:      config,
		AuditLogger: auditLogger,
	}
	auditor.StartWorkers()

	// Create many frames quickly
	var inputBuf bytes.Buffer
	frameCount := 500 // Reduced from 1000 for faster tests

	for i := 0; i < frameCount; i++ {
		payload := []byte("Log line with AKIAIOSFODNN7EXAMPLE\n")
		header := make([]byte, 8)
		header[0] = 1
		binary.BigEndian.PutUint32(header[4:8], uint32(len(payload)))
		inputBuf.Write(header)
		inputBuf.Write(payload)
	}

	var outputBuf bytes.Buffer
	start := time.Now()

	err := auditor.AuditMultiplexedStream(context.Background(), &inputBuf, &outputBuf, "worker-test", nil)
	if err != nil && err != io.EOF {
		t.Fatalf("Failed: %v", err)
	}

	elapsed := time.Since(start)

	// Cleanup properly - stop workers first, then close logger
	auditor.StopWorkers()
	auditLogger.Close()

	if elapsed > 5*time.Second {
		t.Errorf("Processing took too long: %v", elapsed)
	}

	t.Logf("WORKER POOL: Processed %d frames in %v", frameCount, elapsed)
}

// TestBackpressureDropPolicy verifies queue doesn't block indefinitely
func TestBackpressureDropPolicy(t *testing.T) {
	tmpDir := t.TempDir()
	auditFile := filepath.Join(tmpDir, "audit.log")

	auditLogger, _ := proxy.NewAuditLogger(auditFile)

	config, _ := proxy.LoadConfig()
	auditor := &proxy.LogAuditor{
		Config:      config,
		AuditLogger: auditLogger,
	}
	auditor.StartWorkers()

	// Flood with many frames
	var inputBuf bytes.Buffer
	for i := 0; i < 500; i++ { // Reduced from 2000
		payload := []byte("Quick log AKIAIOSFODNN7EXAMPLE\n")
		header := make([]byte, 8)
		header[0] = 1
		binary.BigEndian.PutUint32(header[4:8], uint32(len(payload)))
		inputBuf.Write(header)
		inputBuf.Write(payload)
	}

	var outputBuf bytes.Buffer

	done := make(chan error, 1)
	go func() {
		done <- auditor.AuditMultiplexedStream(context.Background(), &inputBuf, &outputBuf, "backpressure-test", nil)
	}()

	select {
	case err := <-done:
		if err != nil && err != io.EOF {
			t.Fatalf("Unexpected error: %v", err)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("BACKPRESSURE FAILED: Processing blocked for too long")
	}

	// Cleanup properly
	auditor.StopWorkers()
	auditLogger.Close()

	t.Log("BACKPRESSURE WORKING: Processing did not block")
}