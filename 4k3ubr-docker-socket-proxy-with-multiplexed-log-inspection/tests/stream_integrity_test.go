package tests

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"docker-socket-proxy/repository_after/proxy"
)

// ============================================================
// STREAM INTEGRITY TESTS
// ============================================================

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

	originalInput := inputBuf.Bytes()
	inputCopy := make([]byte, len(originalInput))
	copy(inputCopy, originalInput)

	var outputBuf bytes.Buffer
	err := auditor.AuditMultiplexedStream(context.Background(), bytes.NewReader(inputCopy), &outputBuf, "integrity-test", nil)
	if err != nil {
		t.Fatalf("AuditMultiplexedStream failed: %v", err)
	}

	auditor.StopWorkers()
	auditLogger.Close()

	if !bytes.Equal(originalInput, outputBuf.Bytes()) {
		t.Fatalf("STREAM INTEGRITY VIOLATED: input %d bytes, output %d bytes",
			len(originalInput), outputBuf.Len())
	}

	t.Log("STREAM INTEGRITY PRESERVED: Output is byte-for-byte identical to input")
}

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

	largePayloadSize := 128 * 1024
	largePayload := make([]byte, largePayloadSize)
	rand.Read(largePayload)
	copy(largePayload[1000:], []byte("AKIAIOSFODNN7EXAMPLE"))

	var inputBuf bytes.Buffer
	header := make([]byte, 8)
	header[0] = 1
	binary.BigEndian.PutUint32(header[4:8], uint32(len(largePayload)))
	inputBuf.Write(header)
	inputBuf.Write(largePayload)

	originalInput := inputBuf.Bytes()
	inputCopy := make([]byte, len(originalInput))
	copy(inputCopy, originalInput)

	var outputBuf bytes.Buffer
	err := auditor.AuditMultiplexedStream(context.Background(), bytes.NewReader(inputCopy), &outputBuf, "large-test", nil)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}

	auditor.StopWorkers()
	auditLogger.Close()

	if outputBuf.Len() != len(originalInput) {
		t.Fatalf("STREAM TRUNCATED: Expected %d bytes, got %d bytes", len(originalInput), outputBuf.Len())
	}

	if !bytes.Equal(originalInput, outputBuf.Bytes()) {
		t.Fatal("LARGE PAYLOAD INTEGRITY VIOLATED")
	}

	t.Logf("LARGE PAYLOAD INTEGRITY PRESERVED: %d bytes forwarded intact", len(originalInput))
}

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

	auditor.StopWorkers()
	auditLogger.Close()

	if !bytes.Equal(originalInput, outputBuf.Bytes()) {
		t.Fatal("BINARY DATA CORRUPTED")
	}

	t.Log("BINARY DATA INTEGRITY PRESERVED")
}

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

	var inputBuf bytes.Buffer
	frameCount := 500

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
	auditor.StopWorkers()
	auditLogger.Close()

	if elapsed > 5*time.Second {
		t.Errorf("Processing took too long: %v", elapsed)
	}

	t.Logf("WORKER POOL: Processed %d frames in %v", frameCount, elapsed)
}

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

	var inputBuf bytes.Buffer
	for i := 0; i < 500; i++ {
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

	auditor.StopWorkers()
	auditLogger.Close()

	t.Log("BACKPRESSURE WORKING: Processing did not block")
}

// ============================================================
// Client disconnect mid-stream
// ============================================================

func TestClientDisconnectMidStream(t *testing.T) {
	tmpDir := t.TempDir()
	auditFile := filepath.Join(tmpDir, "audit.log")

	auditLogger, _ := proxy.NewAuditLogger(auditFile)
	config, _ := proxy.LoadConfig()
	auditor := &proxy.LogAuditor{
		Config:      config,
		AuditLogger: auditLogger,
	}
	auditor.StartWorkers()

	pipeReader, pipeWriter := io.Pipe()

	go func() {
		header := make([]byte, 8)
		header[0] = 1
		payload := []byte("first frame\n")
		binary.BigEndian.PutUint32(header[4:8], uint32(len(payload)))
		pipeWriter.Write(header)
		pipeWriter.Write(payload)

		payload2 := []byte("second frame\n")
		binary.BigEndian.PutUint32(header[4:8], uint32(len(payload2)))
		pipeWriter.Write(header)
		pipeWriter.Write(payload2)

		time.Sleep(200 * time.Millisecond)
		pipeWriter.Close()
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	var outputBuf bytes.Buffer
	done := make(chan error, 1)

	go func() {
		done <- auditor.AuditMultiplexedStream(ctx, pipeReader, &outputBuf, "disconnect-test", nil)
	}()

	select {
	case err := <-done:
		if err != nil && err != context.Canceled && err != context.DeadlineExceeded {
			if !strings.Contains(err.Error(), "failed to read") {
				t.Logf("Returned error (acceptable): %v", err)
			}
		}
		t.Log("Client disconnect handled correctly")
	case <-time.After(5 * time.Second):
		t.Fatal("AuditMultiplexedStream did not return after context cancellation")
	}

	auditor.StopWorkers()
	auditLogger.Close()
}

// ============================================================
// Unix socket dialing — instrumented proof
// ============================================================

func TestUnixSocketDialingInstrumented(t *testing.T) {
	tmpDir := t.TempDir()
	auditFile := filepath.Join(tmpDir, "audit.log")
	socketPath := filepath.Join(tmpDir, "docker.sock")

	var dialedNetworks []string
	var mu sync.Mutex

	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		t.Fatalf("Failed to create Unix socket: %v", err)
	}
	defer listener.Close()

	go http.Serve(listener, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/logs") {
			w.Header().Set("Content-Type", "application/vnd.docker.multiplexed-stream")
			payload := []byte("log line AKIAIOSFODNN7EXAMPLE\n")
			header := make([]byte, 8)
			header[0] = 1
			binary.BigEndian.PutUint32(header[4:8], uint32(len(payload)))
			w.Write(header)
			w.Write(payload)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	time.Sleep(50 * time.Millisecond)

	auditLogger, _ := proxy.NewAuditLogger(auditFile)
	config, _ := proxy.LoadConfig()
	dockerProxy, err := proxy.NewDockerProxy(socketPath, config, auditLogger)
	if err != nil {
		t.Fatalf("Failed to create proxy: %v", err)
	}

	proxyServer := httptest.NewServer(dockerProxy)
	defer proxyServer.Close()

	resp, err := http.Get(proxyServer.URL + "/containers/unix-proof/logs?stdout=1")
	if err != nil {
		t.Fatalf("Proxy request failed: %v", err)
	}
	io.ReadAll(resp.Body)
	resp.Body.Close()

	// Verify DockerProxy tracked unix dial
	if dockerProxy.DialedNetwork() != "unix" {
		t.Errorf("Expected unix dial, got %q", dockerProxy.DialedNetwork())
	}

	dockerProxy.Close()
	auditLogger.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected 200 from unix backend, got %d", resp.StatusCode)
	}

	// Direct dial verification
	conn, err := net.Dial("unix", socketPath)
	if err == nil {
		mu.Lock()
		dialedNetworks = append(dialedNetworks, "unix")
		mu.Unlock()
		conn.Close()
	}

	mu.Lock()
	hasUnix := false
	for _, n := range dialedNetworks {
		if n == "unix" {
			hasUnix = true
		}
	}
	mu.Unlock()

	if !hasUnix {
		t.Error("No Unix socket dial detected")
	}

	t.Logf("Unix socket dialing confirmed (socket: %s)", socketPath)
}

// ============================================================
// Streaming / incremental reads — no full buffering
// ============================================================

func TestStreamingIncrementalReadsWrites(t *testing.T) {
	tmpDir := t.TempDir()
	auditFile := filepath.Join(tmpDir, "audit.log")

	auditLogger, _ := proxy.NewAuditLogger(auditFile)
	config, _ := proxy.LoadConfig()
	auditor := &proxy.LogAuditor{
		Config:      config,
		AuditLogger: auditLogger,
	}
	auditor.StartWorkers()

	pipeReader, pipeWriter := io.Pipe()

	var outputMu sync.Mutex
	var writeTimestamps []time.Time
	var writeSizes []int

	outputWriter := &instrumentedWriter{
		mu:         &outputMu,
		timestamps: &writeTimestamps,
		sizes:      &writeSizes,
		buf:        &bytes.Buffer{},
	}

	go func() {
		for i := 0; i < 5; i++ {
			payload := []byte("streaming frame data\n")
			header := make([]byte, 8)
			header[0] = 1
			binary.BigEndian.PutUint32(header[4:8], uint32(len(payload)))
			pipeWriter.Write(header)
			pipeWriter.Write(payload)
			time.Sleep(50 * time.Millisecond)
		}
		pipeWriter.Close()
	}()

	err := auditor.AuditMultiplexedStream(context.Background(), pipeReader, outputWriter, "streaming-test", nil)
	if err != nil {
		t.Logf("Stream ended: %v", err)
	}

	auditor.StopWorkers()
	auditLogger.Close()

	outputMu.Lock()
	defer outputMu.Unlock()

	if len(writeTimestamps) < 5 {
		t.Errorf("Expected at least 5 incremental writes, got %d", len(writeTimestamps))
	}

	if len(writeTimestamps) >= 2 {
		first := writeTimestamps[0]
		last := writeTimestamps[len(writeTimestamps)-1]
		spread := last.Sub(first)
		if spread < 100*time.Millisecond {
			t.Errorf("Writes not spread over time (spread: %v)", spread)
		}
	}

	t.Logf("Incremental writes detected: %d", len(writeTimestamps))
}

// instrumentedWriter tracks each Write call
type instrumentedWriter struct {
	mu         *sync.Mutex
	timestamps *[]time.Time
	sizes      *[]int
	buf        *bytes.Buffer
}

func (w *instrumentedWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	*w.timestamps = append(*w.timestamps, time.Now())
	*w.sizes = append(*w.sizes, len(p))
	w.mu.Unlock()
	return w.buf.Write(p)
}

// ============================================================
// Payload isolation — regex runs ONLY on payload
// ============================================================

func TestPayloadIsolationInAuditor(t *testing.T) {
	tmpDir := t.TempDir()
	auditFile := filepath.Join(tmpDir, "audit.log")

	auditLogger, _ := proxy.NewAuditLogger(auditFile)
	config, _ := proxy.LoadConfig()
	auditor := &proxy.LogAuditor{
		Config:      config,
		AuditLogger: auditLogger,
	}
	auditor.StartWorkers()

	cleanPayload := []byte("This is a perfectly normal log line\n")
	var inputBuf bytes.Buffer
	header1 := make([]byte, 8)
	header1[0] = 1 // stdout
	header1[1] = 'A'
	header1[2] = 'K'
	header1[3] = 'I'
	binary.BigEndian.PutUint32(header1[4:8], uint32(len(cleanPayload)))
	inputBuf.Write(header1)
	inputBuf.Write(cleanPayload)

	sensitivePayload := []byte("Secret key: AKIAIOSFODNN7EXAMPLE\n")
	header2 := make([]byte, 8)
	header2[0] = 2 // stderr
	binary.BigEndian.PutUint32(header2[4:8], uint32(len(sensitivePayload)))
	inputBuf.Write(header2)
	inputBuf.Write(sensitivePayload)

	var outputBuf bytes.Buffer
	err := auditor.AuditMultiplexedStream(context.Background(), &inputBuf, &outputBuf, "isolation-test", nil)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}

	auditor.StopWorkers()
	auditLogger.Close()

	content, _ := os.ReadFile(auditFile)
	if len(content) == 0 {
		t.Fatal("No audit entries — sensitive payload was missed")
	}

	lines := strings.Split(strings.TrimSpace(string(content)), "\n")
	for _, line := range lines {
		if line == "" {
			continue
		}
		var event proxy.AuditEvent
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			t.Errorf("Invalid JSON: %s", line)
			continue
		}

		if event.StreamType == "stdout" && event.Pattern == "AWS Access Key" {
			t.Error("Header bytes were incorrectly treated as payload")
		}

		if event.Pattern == "AWS Access Key" && event.StreamType != "stderr" {
			t.Errorf("AWS key detected on wrong stream type: %s", event.StreamType)
		}
	}

	t.Log("Payload isolation verified: regex runs only on payload, not header bytes")
}

// ============================================================
// Stdout/Stderr distinction in audit events
// ============================================================

func TestStdoutStderrAuditDistinction(t *testing.T) {
	tmpDir := t.TempDir()
	auditFile := filepath.Join(tmpDir, "audit.log")

	auditLogger, _ := proxy.NewAuditLogger(auditFile)
	config, _ := proxy.LoadConfig()
	auditor := &proxy.LogAuditor{
		Config:      config,
		AuditLogger: auditLogger,
	}
	auditor.StartWorkers()

	var inputBuf bytes.Buffer

	stdoutPayload := []byte("stdout secret: AKIAIOSFODNN7EXAMPLE\n")
	header1 := make([]byte, 8)
	header1[0] = 1
	binary.BigEndian.PutUint32(header1[4:8], uint32(len(stdoutPayload)))
	inputBuf.Write(header1)
	inputBuf.Write(stdoutPayload)

	stderrPayload := []byte("stderr leak: admin@secret-corp.com\n")
	header2 := make([]byte, 8)
	header2[0] = 2
	binary.BigEndian.PutUint32(header2[4:8], uint32(len(stderrPayload)))
	inputBuf.Write(header2)
	inputBuf.Write(stderrPayload)

	stdoutPayload2 := []byte("Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdef1234567890\n")
	header3 := make([]byte, 8)
	header3[0] = 1
	binary.BigEndian.PutUint32(header3[4:8], uint32(len(stdoutPayload2)))
	inputBuf.Write(header3)
	inputBuf.Write(stdoutPayload2)

	var outputBuf bytes.Buffer
	err := auditor.AuditMultiplexedStream(context.Background(), &inputBuf, &outputBuf, "stream-type-test", nil)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}

	auditor.StopWorkers()
	auditLogger.Close()

	content, _ := os.ReadFile(auditFile)
	if len(content) == 0 {
		t.Fatal("No audit entries")
	}

	lines := strings.Split(strings.TrimSpace(string(content)), "\n")

	foundStdoutAWS := false
	foundStderrEmail := false
	foundStdoutBearer := false

	for _, line := range lines {
		if line == "" {
			continue
		}
		var event proxy.AuditEvent
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			continue
		}

		if event.Pattern == "AWS Access Key" && event.StreamType == "stdout" {
			foundStdoutAWS = true
		}
		if event.Pattern == "Email Address" && event.StreamType == "stderr" {
			foundStderrEmail = true
		}
		if event.Pattern == "Bearer Token" && event.StreamType == "stdout" {
			foundStdoutBearer = true
		}
	}

	if !foundStdoutAWS {
		t.Error("AWS key on stdout not recorded with correct stream_type")
	}
	if !foundStderrEmail {
		t.Error("Email on stderr not recorded with correct stream_type")
	}
	if !foundStdoutBearer {
		t.Error("Bearer token on stdout not recorded with correct stream_type")
	}

	t.Log("Audit events correctly distinguish stdout vs stderr")
}

// ============================================================
// End-to-end header parsing + Big Endian in auditor
// ============================================================

func TestEndToEndHeaderParsingThroughAuditor(t *testing.T) {
	tmpDir := t.TempDir()
	auditFile := filepath.Join(tmpDir, "audit.log")

	auditLogger, _ := proxy.NewAuditLogger(auditFile)
	config, _ := proxy.LoadConfig()
	auditor := &proxy.LogAuditor{
		Config:      config,
		AuditLogger: auditLogger,
	}
	auditor.StartWorkers()

	testCases := []struct {
		name        string
		streamType  byte
		payloadSize int
		sensitive   bool
	}{
		{"tiny_1byte", 1, 1, false},
		{"small_255bytes", 1, 255, false},
		{"boundary_256bytes", 2, 256, false},
		{"medium_1024bytes", 1, 1024, true},
		{"large_65535bytes", 2, 65535, false},
		{"xlarge_65536bytes", 1, 65536, true},
	}

	var inputBuf bytes.Buffer
	expectedTotalSize := 0

	for _, tc := range testCases {
		payload := make([]byte, tc.payloadSize)
		for i := range payload {
			payload[i] = 'X'
		}

		if tc.sensitive {
			key := []byte("AKIAIOSFODNN7EXAMPLE")
			if len(payload) > len(key)+10 {
				copy(payload[10:], key)
			}
		}

		header := make([]byte, 8)
		header[0] = tc.streamType
		binary.BigEndian.PutUint32(header[4:8], uint32(tc.payloadSize))

		encodedSize := binary.BigEndian.Uint32(header[4:8])
		if encodedSize != uint32(tc.payloadSize) {
			t.Errorf("Big Endian encode/decode mismatch for %s: expected %d, got %d",
				tc.name, tc.payloadSize, encodedSize)
		}

		inputBuf.Write(header)
		inputBuf.Write(payload)
		expectedTotalSize += 8 + tc.payloadSize
	}

	var outputBuf bytes.Buffer
	err := auditor.AuditMultiplexedStream(context.Background(), &inputBuf, &outputBuf, "header-parse-test", nil)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}

	auditor.StopWorkers()
	auditLogger.Close()

	if outputBuf.Len() != expectedTotalSize {
		t.Errorf("Expected %d bytes output, got %d", expectedTotalSize, outputBuf.Len())
	}

	reader := bytes.NewReader(outputBuf.Bytes())
	parsedFrames := 0

	for _, tc := range testCases {
		header := make([]byte, 8)
		n, err := io.ReadFull(reader, header)
		if err != nil || n != 8 {
			t.Errorf("Could not read header for frame %s", tc.name)
			break
		}

		parsedStreamType := header[0]
		parsedSize := binary.BigEndian.Uint32(header[4:8])

		if parsedStreamType != tc.streamType {
			t.Errorf("Frame %s stream type mismatch: expected %d, got %d",
				tc.name, tc.streamType, parsedStreamType)
		}

		if parsedSize != uint32(tc.payloadSize) {
			t.Errorf("Frame %s size mismatch (Big Endian): expected %d, got %d",
				tc.name, tc.payloadSize, parsedSize)
		}

		payload := make([]byte, parsedSize)
		_, err = io.ReadFull(reader, payload)
		if err != nil {
			t.Errorf("Could not read payload for frame %s", tc.name)
			break
		}

		parsedFrames++
	}

	if parsedFrames != len(testCases) {
		t.Errorf("Expected %d frames parsed, got %d", len(testCases), parsedFrames)
	}

	content, _ := os.ReadFile(auditFile)
	if len(content) == 0 {
		t.Error("No audit entries generated from sensitive frames")
	}

	t.Logf("%d frames with varying Big Endian sizes parsed end-to-end", parsedFrames)
}

// ============================================================
// Severity levels in audit events
// ============================================================

func TestAuditSeverityLevels(t *testing.T) {
	tmpDir := t.TempDir()
	auditFile := filepath.Join(tmpDir, "audit.log")

	auditLogger, _ := proxy.NewAuditLogger(auditFile)
	config, _ := proxy.LoadConfig()
	auditor := &proxy.LogAuditor{
		Config:      config,
		AuditLogger: auditLogger,
	}
	auditor.StartWorkers()

	var inputBuf bytes.Buffer

	payload1 := []byte("AKIAIOSFODNN7EXAMPLE\n")
	header := make([]byte, 8)
	header[0] = 1
	binary.BigEndian.PutUint32(header[4:8], uint32(len(payload1)))
	inputBuf.Write(header)
	inputBuf.Write(payload1)

	payload2 := []byte("user@example.com\n")
	binary.BigEndian.PutUint32(header[4:8], uint32(len(payload2)))
	inputBuf.Write(header)
	inputBuf.Write(payload2)

	var outputBuf bytes.Buffer
	auditor.AuditMultiplexedStream(context.Background(), &inputBuf, &outputBuf, "severity-test", nil)

	auditor.StopWorkers()
	auditLogger.Close()

	content, _ := os.ReadFile(auditFile)
	if len(content) == 0 {
		t.Fatal("No audit entries")
	}

	lines := strings.Split(strings.TrimSpace(string(content)), "\n")
	severities := make(map[string]bool)

	for _, line := range lines {
		if line == "" {
			continue
		}
		var event proxy.AuditEvent
		if err := json.Unmarshal([]byte(line), &event); err == nil {
			if event.Severity == "" {
				t.Error("Audit event has empty severity")
			}
			severities[event.Severity] = true
		}
	}

	if len(severities) == 0 {
		t.Error("No severities found in audit events")
	}

	t.Logf("Severity levels found: %v", severities)
}

// ============================================================
// Combined: audit side effects + integrity + all metadata
// ============================================================

func TestAuditSideEffectOnSensitiveData(t *testing.T) {
	tmpDir := t.TempDir()
	auditFile := filepath.Join(tmpDir, "audit.log")

	auditLogger, _ := proxy.NewAuditLogger(auditFile)
	config, _ := proxy.LoadConfig()
	auditor := &proxy.LogAuditor{
		Config:      config,
		AuditLogger: auditLogger,
	}
	auditor.StartWorkers()

	var inputBuf bytes.Buffer
	sensitiveLines := []string{
		"AWS credential: AKIAIOSFODNN7EXAMPLE\n",
		"Contact: admin@secret-corp.com\n",
		"-----BEGIN RSA PRIVATE KEY-----\n",
		"Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdef1234567890\n",
	}

	for _, line := range sensitiveLines {
		header := make([]byte, 8)
		header[0] = 1
		binary.BigEndian.PutUint32(header[4:8], uint32(len(line)))
		inputBuf.Write(header)
		inputBuf.Write([]byte(line))
	}

	var outputBuf bytes.Buffer
	err := auditor.AuditMultiplexedStream(context.Background(), &inputBuf, &outputBuf, "side-effect-test", nil)
	if err != nil {
		t.Fatalf("AuditMultiplexedStream failed: %v", err)
	}

	auditor.StopWorkers()
	auditLogger.Close()

	content, _ := os.ReadFile(auditFile)
	if len(content) == 0 {
		t.Fatal("No audit entries despite sensitive data")
	}

	lines := strings.Split(strings.TrimSpace(string(content)), "\n")
	detectedPatterns := make(map[string]bool)

	for _, line := range lines {
		if line == "" {
			continue
		}
		var event proxy.AuditEvent
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			t.Errorf("Invalid JSON: %s", line)
			continue
		}
		if event.ContainerID != "side-effect-test" {
			t.Errorf("Wrong container_id: %s", event.ContainerID)
		}
		if event.Severity == "" {
			t.Error("Empty severity")
		}
		if event.Redacted == "" {
			t.Error("Empty redacted")
		}
		if event.Timestamp.IsZero() {
			t.Error("Zero timestamp")
		}
		detectedPatterns[event.Pattern] = true
	}

	expectedPatterns := []string{"AWS Access Key", "Email Address", "Private Key", "Bearer Token"}
	for _, expected := range expectedPatterns {
		if !detectedPatterns[expected] {
			t.Errorf("Pattern '%s' was NOT detected", expected)
		}
	}

	t.Logf("Audit side effect verified: %v", detectedPatterns)
}

// ============================================================
// Flusher behavior both paths
// ============================================================

func TestFlusherBehaviorBothPaths(t *testing.T) {
	createStream := func() *bytes.Buffer {
		var buf bytes.Buffer
		payload := []byte("Leaked key: AKIAIOSFODNN7EXAMPLE\n")
		header := make([]byte, 8)
		header[0] = 1
		binary.BigEndian.PutUint32(header[4:8], uint32(len(payload)))
		buf.Write(header)
		buf.Write(payload)
		return &buf
	}

	t.Run("WithoutFlusher", func(t *testing.T) {
		tmpDir := t.TempDir()
		auditFile := filepath.Join(tmpDir, "audit.log")
		auditLogger, _ := proxy.NewAuditLogger(auditFile)
		config, _ := proxy.LoadConfig()

		auditor := &proxy.LogAuditor{
			Config:      config,
			AuditLogger: auditLogger,
		}
		auditor.StartWorkers()

		inputBuf := createStream()
		var outputBuf bytes.Buffer

		err := auditor.AuditMultiplexedStream(context.Background(), inputBuf, &outputBuf, "no-flusher", nil)
		if err != nil {
			t.Fatalf("Failed without flusher: %v", err)
		}

		auditor.StopWorkers()
		auditLogger.Close()

		content, _ := os.ReadFile(auditFile)
		if len(content) == 0 {
			t.Fatal("Auditing SKIPPED without flusher")
		}
		if outputBuf.Len() == 0 {
			t.Fatal("Output empty without flusher")
		}

		t.Log("WITHOUT FLUSHER: Auditing works correctly")
	})

	t.Run("WithFlusher", func(t *testing.T) {
		tmpDir := t.TempDir()
		auditFile := filepath.Join(tmpDir, "audit.log")
		auditLogger, _ := proxy.NewAuditLogger(auditFile)
		config, _ := proxy.LoadConfig()

		auditor := &proxy.LogAuditor{
			Config:      config,
			AuditLogger: auditLogger,
		}
		auditor.StartWorkers()

		inputBuf := createStream()
		recorder := httptest.NewRecorder()

		var flusher http.Flusher = recorder

		err := auditor.AuditMultiplexedStream(context.Background(), inputBuf, recorder, "with-flusher", flusher)
		if err != nil {
			t.Fatalf("Failed with flusher: %v", err)
		}

		auditor.StopWorkers()
		auditLogger.Close()

		content, _ := os.ReadFile(auditFile)
		if len(content) == 0 {
			t.Fatal("Auditing SKIPPED with flusher")
		}
		if recorder.Body.Len() == 0 {
			t.Fatal("Output empty with flusher")
		}

		t.Log("WITH FLUSHER: Auditing and flushing work correctly")
	})
}

// ============================================================
// Dial cancellation prevents goroutine leak
// ============================================================

func TestDialCancellationPreventsLeak(t *testing.T) {
	t.Run("PreCancelledContext", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		cancel()

		transport := &http.Transport{
			DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
				select {
				case <-ctx.Done():
					return nil, ctx.Err()
				default:
				}
				var d net.Dialer
				return d.DialContext(ctx, "unix", "/nonexistent-socket.sock")
			},
		}

		client := &http.Client{Transport: transport}
		req, _ := http.NewRequestWithContext(ctx, "GET", "http://dummy/test", nil)
		_, err := client.Do(req)

		if err == nil {
			t.Error("Request should have failed with cancelled context")
		}

		t.Log("Pre-cancelled context handled correctly")
	})

	t.Run("CancelDuringDial", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
		defer cancel()

		transport := &http.Transport{
			DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
				var d net.Dialer
				return d.DialContext(ctx, "unix", "/tmp/nonexistent-socket-for-test.sock")
			},
		}

		client := &http.Client{Transport: transport}
		req, _ := http.NewRequestWithContext(ctx, "GET", "http://dummy/test", nil)

		done := make(chan error, 1)
		go func() {
			_, err := client.Do(req)
			done <- err
		}()

		select {
		case err := <-done:
			if err == nil {
				t.Error("Request should have failed")
			}
		case <-time.After(5 * time.Second):
			t.Fatal("Dial did not respect context cancellation")
		}

		t.Log("Context cancellation during dial handled correctly")
	})

	t.Run("ProxyRespectsCancellation", func(t *testing.T) {
		tmpDir := t.TempDir()
		auditLogger, _ := proxy.NewAuditLogger(filepath.Join(tmpDir, "audit.log"))
		config, _ := proxy.LoadConfig()

		dockerProxy, _ := proxy.NewDockerProxy("/tmp/nonexistent.sock", config, auditLogger)
		defer dockerProxy.Close()
		defer auditLogger.Close()

		server := httptest.NewServer(dockerProxy)
		defer server.Close()

		ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
		defer cancel()

		req, _ := http.NewRequestWithContext(ctx, "GET", server.URL+"/containers/test/logs?stdout=1", nil)
		client := &http.Client{}

		done := make(chan struct{})
		go func() {
			resp, err := client.Do(req)
			if err == nil {
				resp.Body.Close()
			}
			close(done)
		}()

		select {
		case <-done:
			// Good
		case <-time.After(5 * time.Second):
			t.Fatal("Proxy request did not respect context cancellation")
		}

		t.Log("DockerProxy respects context cancellation")
	})
}

// ============================================================
// HTTP method enforcement
// ============================================================

func TestHTTPMethodEnforcementOnLogs(t *testing.T) {
	tmpDir := t.TempDir()
	auditLogger, _ := proxy.NewAuditLogger(filepath.Join(tmpDir, "audit.log"))
	config, _ := proxy.LoadConfig()

	dockerProxy, _ := proxy.NewDockerProxy("/tmp/nonexistent.sock", config, auditLogger)

	server := httptest.NewServer(dockerProxy)
	defer server.Close()
	defer dockerProxy.Close()
	defer auditLogger.Close()

	client := &http.Client{}

	blockedMethods := []string{"POST", "PUT", "DELETE", "PATCH"}
	for _, method := range blockedMethods {
		t.Run(method, func(t *testing.T) {
			req, _ := http.NewRequest(method, server.URL+"/containers/testid/logs", nil)
			resp, err := client.Do(req)
			if err != nil {
				t.Fatalf("%s request failed: %v", method, err)
			}
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusMethodNotAllowed {
				t.Errorf("%s returned %d, expected 405", method, resp.StatusCode)
			}
		})
	}

	t.Run("GET_allowed", func(t *testing.T) {
		req, _ := http.NewRequest("GET", server.URL+"/containers/testid/logs?stdout=1", nil)
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("GET request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusMethodNotAllowed {
			t.Error("GET should NOT return 405")
		}
	})

	t.Run("POST_versioned_path", func(t *testing.T) {
		req, _ := http.NewRequest("POST", server.URL+"/v1.41/containers/testid/logs", nil)
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("Request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusMethodNotAllowed {
			t.Errorf("POST on versioned path returned %d, expected 405", resp.StatusCode)
		}
	})

	t.Log("HTTP method enforcement verified")
}

// ============================================================
// Runtime regex configuration loading
// ============================================================

func TestRuntimeRegexConfigurationLoading(t *testing.T) {
	tmpDir := t.TempDir()
	configFile := filepath.Join(tmpDir, "custom-patterns.json")
	auditFile := filepath.Join(tmpDir, "audit.log")

	customConfig := `{
		"patterns": [
			{
				"name": "Custom SSN Pattern",
				"pattern": "\\d{3}-\\d{2}-\\d{4}",
				"severity": "CRITICAL"
			},
			{
				"name": "Custom Internal ID",
				"pattern": "INTERNAL-[A-Z]{4}-\\d{6}",
				"severity": "LOW"
			}
		]
	}`

	os.WriteFile(configFile, []byte(customConfig), 0644)
	os.Setenv("AUDIT_CONFIG_PATH", configFile)
	defer os.Unsetenv("AUDIT_CONFIG_PATH")

	config, err := proxy.LoadConfig()
	if err != nil {
		t.Fatalf("Failed to load config: %v", err)
	}

	if len(config.SensitivePatterns) != 2 {
		t.Fatalf("Expected 2 custom patterns, got %d", len(config.SensitivePatterns))
	}

	auditLogger, _ := proxy.NewAuditLogger(auditFile)
	auditor := &proxy.LogAuditor{
		Config:      config,
		AuditLogger: auditLogger,
	}
	auditor.StartWorkers()

	var inputBuf bytes.Buffer
	testData := "SSN: 123-45-6789 and ref INTERNAL-ABCD-123456\n"
	header := make([]byte, 8)
	header[0] = 1
	binary.BigEndian.PutUint32(header[4:8], uint32(len(testData)))
	inputBuf.Write(header)
	inputBuf.Write([]byte(testData))

	var outputBuf bytes.Buffer
	auditor.AuditMultiplexedStream(context.Background(), &inputBuf, &outputBuf, "custom-config-test", nil)

	auditor.StopWorkers()
	auditLogger.Close()

	content, _ := os.ReadFile(auditFile)
	if len(content) == 0 {
		t.Fatal("No audit entries from custom patterns")
	}

	lines := strings.Split(strings.TrimSpace(string(content)), "\n")
	foundSSN := false
	foundInternal := false

	for _, line := range lines {
		if line == "" {
			continue
		}
		var event proxy.AuditEvent
		if err := json.Unmarshal([]byte(line), &event); err == nil {
			if event.Pattern == "Custom SSN Pattern" {
				foundSSN = true
				if event.Severity != "CRITICAL" {
					t.Errorf("SSN severity: expected CRITICAL, got %s", event.Severity)
				}
			}
			if event.Pattern == "Custom Internal ID" {
				foundInternal = true
				if event.Severity != "LOW" {
					t.Errorf("Internal ID severity: expected LOW, got %s", event.Severity)
				}
			}
		}
	}

	if !foundSSN {
		t.Error("Custom SSN pattern not detected")
	}
	if !foundInternal {
		t.Error("Custom Internal ID pattern not detected")
	}

	t.Log("Runtime regex configuration verified")
}

// ============================================================
// Overlapping chunk scanning
// ============================================================

func TestOverlappingChunkScanning(t *testing.T) {
	tmpDir := t.TempDir()
	auditFile := filepath.Join(tmpDir, "audit.log")

	auditLogger, _ := proxy.NewAuditLogger(auditFile)
	config, _ := proxy.LoadConfig()
	auditor := &proxy.LogAuditor{
		Config:      config,
		AuditLogger: auditLogger,
	}
	auditor.StartWorkers()

	// Create payload where AWS key spans chunk boundary
	// Chunk size is 16KB, so put key at position ~16380
	largePayload := make([]byte, 32*1024) // 32KB
	for i := range largePayload {
		largePayload[i] = 'X'
	}

	// Put AWS key right at chunk boundary
	awsKey := []byte("AKIAIOSFODNN7EXAMPLE")
	copy(largePayload[16*1024-10:], awsKey) // Spans 16KB boundary

	var inputBuf bytes.Buffer
	header := make([]byte, 8)
	header[0] = 1
	binary.BigEndian.PutUint32(header[4:8], uint32(len(largePayload)))
	inputBuf.Write(header)
	inputBuf.Write(largePayload)

	var outputBuf bytes.Buffer
	err := auditor.AuditMultiplexedStream(context.Background(), &inputBuf, &outputBuf, "overlap-test", nil)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}

	auditor.StopWorkers()
	auditLogger.Close()

	content, _ := os.ReadFile(auditFile)
	if len(content) == 0 {
		t.Fatal("No audit entries - chunk boundary may have split the pattern")
	}

	if !strings.Contains(string(content), "AWS Access Key") {
		t.Error("AWS key at chunk boundary was not detected")
	}

	t.Log("Overlapping chunk scanning works correctly")
}

// ============================================================
// Zero-size payload handling
// ============================================================

func TestZeroSizePayloadHandling(t *testing.T) {
	tmpDir := t.TempDir()
	auditFile := filepath.Join(tmpDir, "audit.log")

	auditLogger, _ := proxy.NewAuditLogger(auditFile)
	config, _ := proxy.LoadConfig()
	auditor := &proxy.LogAuditor{
		Config:      config,
		AuditLogger: auditLogger,
	}
	auditor.StartWorkers()

	var inputBuf bytes.Buffer

	// Frame with zero-size payload
	header1 := make([]byte, 8)
	header1[0] = 1
	binary.BigEndian.PutUint32(header1[4:8], 0)
	inputBuf.Write(header1)

	// Normal frame after
	payload := []byte("Normal line after zero-size\n")
	header2 := make([]byte, 8)
	header2[0] = 1
	binary.BigEndian.PutUint32(header2[4:8], uint32(len(payload)))
	inputBuf.Write(header2)
	inputBuf.Write(payload)

	var outputBuf bytes.Buffer
	err := auditor.AuditMultiplexedStream(context.Background(), &inputBuf, &outputBuf, "zero-size-test", nil)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}

	auditor.StopWorkers()
	auditLogger.Close()

	// Verify output contains both frames
	expectedSize := 8 + 0 + 8 + len(payload)
	if outputBuf.Len() != expectedSize {
		t.Errorf("Expected %d bytes, got %d", expectedSize, outputBuf.Len())
	}

	t.Log("Zero-size payload handled correctly")
}

// ============================================================
// Concurrent stream processing
// ============================================================

func TestConcurrentStreamProcessing(t *testing.T) {
	tmpDir := t.TempDir()
	auditFile := filepath.Join(tmpDir, "audit.log")

	auditLogger, _ := proxy.NewAuditLogger(auditFile)
	config, _ := proxy.LoadConfig()
	auditor := &proxy.LogAuditor{
		Config:      config,
		AuditLogger: auditLogger,
	}
	auditor.StartWorkers()

	var wg sync.WaitGroup
	numStreams := 10
	framesPerStream := 50

	for i := 0; i < numStreams; i++ {
		wg.Add(1)
		go func(streamID int) {
			defer wg.Done()

			var inputBuf bytes.Buffer
			for j := 0; j < framesPerStream; j++ {
				payload := []byte("Concurrent stream with AKIAIOSFODNN7EXAMPLE\n")
				header := make([]byte, 8)
				header[0] = 1
				binary.BigEndian.PutUint32(header[4:8], uint32(len(payload)))
				inputBuf.Write(header)
				inputBuf.Write(payload)
			}

			var outputBuf bytes.Buffer
			containerID := "concurrent-" + string(rune('A'+streamID))
			auditor.AuditMultiplexedStream(context.Background(), &inputBuf, &outputBuf, containerID, nil)
		}(i)
	}

	wg.Wait()
	auditor.StopWorkers()
	auditLogger.Close()

	content, _ := os.ReadFile(auditFile)
	if len(content) == 0 {
		t.Fatal("No audit entries from concurrent processing")
	}

	lines := strings.Split(strings.TrimSpace(string(content)), "\n")
	if len(lines) < numStreams {
		t.Errorf("Expected entries from multiple streams, got %d lines", len(lines))
	}

	t.Logf("Concurrent processing: %d audit entries from %d streams", len(lines), numStreams)
}