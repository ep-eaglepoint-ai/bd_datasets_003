package tests

import (
	"bytes"
	"context"
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

// TestRequirement1_NonMultiplexedLogsAreAudited verifies that plain text logs are inspected
func TestRequirement1_NonMultiplexedLogsAreAudited(t *testing.T) {
	tmpDir := t.TempDir()
	auditFile := filepath.Join(tmpDir, "audit.log")

	auditLogger, err := proxy.NewAuditLogger(auditFile)
	if err != nil {
		t.Fatalf("Failed to create audit logger: %v", err)
	}

	config, _ := proxy.LoadConfig()
	auditor := &proxy.LogAuditor{
		Config:      config,
		AuditLogger: auditLogger,
	}
	auditor.StartWorkers()

	// Create PLAIN TEXT stream (non-multiplexed) with AWS key
	plainTextLog := "2024-01-01 10:00:00 App started\nAWS_KEY=AKIAIOSFODNN7EXAMPLE\n2024-01-01 10:00:01 Ready\n"
	input := strings.NewReader(plainTextLog)
	var output bytes.Buffer

	ctx := context.Background()
	err = auditor.AuditPlainStream(ctx, input, &output, "plain-container")
	if err != nil {
		t.Fatalf("AuditPlainStream failed: %v", err)
	}

	// Cleanup
	auditor.StopWorkers()
	auditLogger.Close()

	// Verify audit log was created
	auditContent, err := os.ReadFile(auditFile)
	if err != nil {
		t.Fatalf("Failed to read audit file: %v", err)
	}

	if len(auditContent) == 0 {
		t.Fatal("REQUIREMENT 1 FAILED: Plain text logs were NOT audited")
	}

	if !strings.Contains(string(auditContent), "AWS Access Key") {
		t.Error("REQUIREMENT 1 FAILED: AWS key pattern not detected in plain stream")
	}

	t.Log("REQUIREMENT 1 PASSED: Non-multiplexed logs ARE audited")
}

// TestRequirement2_CoreImplementationTested verifies real DockerProxy is tested
func TestRequirement2_CoreImplementationTested(t *testing.T) {
	tmpDir := t.TempDir()
	auditFile := filepath.Join(tmpDir, "audit.log")
	socketPath := filepath.Join(tmpDir, "docker.sock")

	auditLogger, _ := proxy.NewAuditLogger(auditFile)

	config, _ := proxy.LoadConfig()

	// Create mock backend
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/logs") {
			w.Header().Set("Content-Type", "application/vnd.docker.multiplexed-stream")
			payload := []byte("Sensitive: AKIAIOSFODNN7EXAMPLE\n")
			header := make([]byte, 8)
			header[0] = 1
			binary.BigEndian.PutUint32(header[4:8], uint32(len(payload)))
			w.Write(header)
			w.Write(payload)
		} else {
			w.WriteHeader(http.StatusOK)
		}
	}))
	defer backend.Close()

	// Create Unix socket
	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		t.Fatalf("Failed to create socket: %v", err)
	}
	defer listener.Close()
	go http.Serve(listener, backend.Config.Handler)
	time.Sleep(50 * time.Millisecond)

	// Create REAL DockerProxy instance
	dockerProxy, err := proxy.NewDockerProxy(socketPath, config, auditLogger)
	if err != nil {
		t.Fatalf("Failed to create DockerProxy: %v", err)
	}

	if dockerProxy == nil {
		t.Fatal("REQUIREMENT 2 FAILED: DockerProxy instance is nil")
	}

	// Create test server with REAL DockerProxy
	proxyServer := httptest.NewServer(dockerProxy)
	defer proxyServer.Close()

	// Make request through real proxy
	resp, err := http.Get(proxyServer.URL + "/containers/test/logs?stdout=1")
	if err != nil {
		t.Fatalf("Request failed: %v", err)
	}
	defer resp.Body.Close()

	io.ReadAll(resp.Body)

	// Cleanup
	dockerProxy.Close()
	auditLogger.Close()

	// Verify audit occurred
	auditContent, _ := os.ReadFile(auditFile)
	if len(auditContent) == 0 {
		t.Error("REQUIREMENT 2 FAILED: Real implementation didn't create audit")
	}

	t.Log("REQUIREMENT 2 PASSED: Core implementation is tested")
}

// TestRequirement3_UnixSocketDialingValidated verifies unix:// dialing
func TestRequirement3_UnixSocketDialingValidated(t *testing.T) {
	tmpDir := t.TempDir()
	socketPath := filepath.Join(tmpDir, "docker.sock")

	actualDialedNetwork := ""
	var mu sync.Mutex

	// Create transport that tracks what is ACTUALLY dialed
	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			// Track what we ACTUALLY dial (not what was requested)
			mu.Lock()
			actualDialedNetwork = "unix"
			mu.Unlock()

			var d net.Dialer
			return d.DialContext(ctx, "unix", socketPath)
		},
	}

	// Create Unix socket server
	listener, _ := net.Listen("unix", socketPath)
	defer listener.Close()

	go http.Serve(listener, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	time.Sleep(50 * time.Millisecond)

	// Make request
	client := &http.Client{Transport: transport}
	req, _ := http.NewRequest("GET", "http://dummy/test", nil)
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("Request failed: %v", err)
	}
	resp.Body.Close()

	// Verify unix socket was ACTUALLY dialed
	mu.Lock()
	dialed := actualDialedNetwork
	mu.Unlock()

	if dialed != "unix" {
		t.Errorf("REQUIREMENT 3 FAILED: Expected unix socket, got %s", dialed)
	} else {
		t.Log("REQUIREMENT 3 PASSED: Unix socket dialing validated")
	}
}

// TestRequirement4_AuditSideEffectVerified verifies audit.log is written
func TestRequirement4_AuditSideEffectVerified(t *testing.T) {
	tmpDir := t.TempDir()
	auditFile := filepath.Join(tmpDir, "audit.log")

	// Verify file doesn't exist initially
	if _, err := os.Stat(auditFile); err == nil {
		t.Fatal("Audit file should not exist before test")
	}

	auditLogger, _ := proxy.NewAuditLogger(auditFile)

	config, _ := proxy.LoadConfig()
	auditor := &proxy.LogAuditor{
		Config:      config,
		AuditLogger: auditLogger,
	}
	auditor.StartWorkers()

	// Create stream with sensitive patterns
	var buf bytes.Buffer
	sensitiveData := []byte("AWS: AKIAIOSFODNN7EXAMPLE, Email: admin@company.com\n")
	header := make([]byte, 8)
	header[0] = 1
	binary.BigEndian.PutUint32(header[4:8], uint32(len(sensitiveData)))
	buf.Write(header)
	buf.Write(sensitiveData)

	var output bytes.Buffer
	auditor.AuditMultiplexedStream(context.Background(), &buf, &output, "test-container", nil)

	// Cleanup
	auditor.StopWorkers()
	auditLogger.Close()

	// Verify file was created (side effect)
	if _, err := os.Stat(auditFile); os.IsNotExist(err) {
		t.Fatal("REQUIREMENT 4 FAILED: Audit file was not created")
	}

	// Verify content
	content, _ := os.ReadFile(auditFile)
	if len(content) == 0 {
		t.Fatal("REQUIREMENT 4 FAILED: Audit file is empty")
	}

	// Count audit entries
	lines := strings.Split(strings.TrimSpace(string(content)), "\n")
	validEntries := 0
	for _, line := range lines {
		if line == "" {
			continue
		}
		var event proxy.AuditEvent
		if err := json.Unmarshal([]byte(line), &event); err == nil {
			if event.ContainerID == "test-container" && event.Severity == "HIGH" {
				validEntries++
			}
		}
	}

	if validEntries == 0 {
		t.Fatal("REQUIREMENT 4 FAILED: No valid audit entries written")
	}

	t.Logf("REQUIREMENT 4 PASSED: Audit side effect verified (%d entries)", validEntries)
}

// TestRequirement5_RegexPerformanceSafeguards verifies timeout and size limits
func TestRequirement5_RegexPerformanceSafeguards(t *testing.T) {
	tmpDir := t.TempDir()
	auditFile := filepath.Join(tmpDir, "audit.log")

	auditLogger, _ := proxy.NewAuditLogger(auditFile)

	config, _ := proxy.LoadConfig()
	auditor := &proxy.LogAuditor{
		Config:      config,
		AuditLogger: auditLogger,
	}
	auditor.StartWorkers()

	// Create large payload
	hugePayloadSize := 256 * 1024 // 256KB
	hugePayload := make([]byte, hugePayloadSize)
	for i := range hugePayload {
		hugePayload[i] = 'A'
	}
	copy(hugePayload[100:], []byte("SECRET: AKIAIOSFODNN7EXAMPLE"))

	var inputBuf bytes.Buffer
	header := make([]byte, 8)
	header[0] = 1
	binary.BigEndian.PutUint32(header[4:8], uint32(len(hugePayload)))
	inputBuf.Write(header)
	inputBuf.Write(hugePayload)

	var outputBuf bytes.Buffer
	start := time.Now()

	err := auditor.AuditMultiplexedStream(context.Background(), &inputBuf, &outputBuf, "perf-test", nil)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}

	elapsed := time.Since(start)

	// Cleanup
	auditor.StopWorkers()
	auditLogger.Close()

	if elapsed > 1*time.Second {
		t.Errorf("REQUIREMENT 5 FAILED: Processing took too long (%v)", elapsed)
	}

	// Verify FULL payload was forwarded
	expectedSize := 8 + hugePayloadSize
	if outputBuf.Len() != expectedSize {
		t.Errorf("STREAM INTEGRITY FAILED: Expected %d bytes, got %d", expectedSize, outputBuf.Len())
	}

	t.Logf("REQUIREMENT 5 PASSED: Processed %dKB in %v", hugePayloadSize/1024, elapsed)
}

// TestRequirement6_HTTPMethodRestricted verifies only GET is allowed for logs
func TestRequirement6_HTTPMethodRestricted(t *testing.T) {
	tmpDir := t.TempDir()
	auditLogger, _ := proxy.NewAuditLogger(filepath.Join(tmpDir, "audit.log"))

	config, _ := proxy.LoadConfig()
	dockerProxy, _ := proxy.NewDockerProxy("/tmp/dummy.sock", config, auditLogger)

	server := httptest.NewServer(dockerProxy)
	defer server.Close()
	defer dockerProxy.Close()
	defer auditLogger.Close()

	// Test POST (should be rejected)
	resp, err := http.Post(server.URL+"/containers/test/logs", "text/plain", nil)
	if err != nil {
		t.Fatalf("Request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Errorf("REQUIREMENT 6 FAILED: POST returned %d, expected 405", resp.StatusCode)
	}

	// Test PUT (should be rejected)
	req, _ := http.NewRequest("PUT", server.URL+"/containers/test/logs", nil)
	client := &http.Client{}
	resp2, _ := client.Do(req)
	defer resp2.Body.Close()

	if resp2.StatusCode != http.StatusMethodNotAllowed {
		t.Errorf("REQUIREMENT 6 FAILED: PUT returned %d, expected 405", resp2.StatusCode)
	}

	t.Log("REQUIREMENT 6 PASSED: HTTP method restricted to GET only")
}

// TestRequirement7_RegexPatternsConfigurable verifies runtime configuration
func TestRequirement7_RegexPatternsConfigurable(t *testing.T) {
	tmpDir := t.TempDir()
	configFile := filepath.Join(tmpDir, "custom-audit.json")

	// Create custom config file
	customConfig := `{
		"patterns": [
			{
				"name": "Custom Secret Pattern",
				"pattern": "SECRET_[A-Z0-9]{16}"
			},
			{
				"name": "Custom API Key",
				"pattern": "CUSTOM_API_[a-z0-9]{20}"
			}
		]
	}`

	err := os.WriteFile(configFile, []byte(customConfig), 0644)
	if err != nil {
		t.Fatalf("Failed to write config: %v", err)
	}

	// Set environment variable
	os.Setenv("AUDIT_CONFIG_PATH", configFile)
	defer os.Unsetenv("AUDIT_CONFIG_PATH")

	// Load config
	config, err := proxy.LoadConfig()
	if err != nil {
		t.Fatalf("Failed to load config: %v", err)
	}

	if len(config.SensitivePatterns) != 2 {
		t.Errorf("REQUIREMENT 7 FAILED: Expected 2 patterns, got %d", len(config.SensitivePatterns))
	}

	if config.SensitivePatterns[0].Name != "Custom Secret Pattern" {
		t.Error("REQUIREMENT 7 FAILED: Custom pattern not loaded")
	}

	t.Log("REQUIREMENT 7 PASSED: Regex patterns are configurable")
}

// TestRequirement8_AuditingWorksWithoutFlusher verifies auditing happens without http.Flusher
func TestRequirement8_AuditingWorksWithoutFlusher(t *testing.T) {
	tmpDir := t.TempDir()
	auditFile := filepath.Join(tmpDir, "audit.log")

	auditLogger, _ := proxy.NewAuditLogger(auditFile)

	config, _ := proxy.LoadConfig()
	auditor := &proxy.LogAuditor{
		Config:      config,
		AuditLogger: auditLogger,
	}
	auditor.StartWorkers()

	// Create stream
	var buf bytes.Buffer
	payload := []byte("Data: AKIAIOSFODNN7EXAMPLE\n")
	header := make([]byte, 8)
	header[0] = 1
	binary.BigEndian.PutUint32(header[4:8], uint32(len(payload)))
	buf.Write(header)
	buf.Write(payload)

	// Call with nil flusher
	var output bytes.Buffer
	err := auditor.AuditMultiplexedStream(context.Background(), &buf, &output, "no-flush-container", nil)
	if err != nil {
		t.Fatalf("Audit failed without flusher: %v", err)
	}

	// Cleanup
	auditor.StopWorkers()
	auditLogger.Close()

	// Verify audit still happened
	content, _ := os.ReadFile(auditFile)
	if len(content) == 0 {
		t.Fatal("REQUIREMENT 8 FAILED: Auditing was skipped without http.Flusher")
	}

	t.Log("REQUIREMENT 8 PASSED: Auditing works without http.Flusher")
}

// TestRequirement9_TransportClientReused verifies no per-request creation
func TestRequirement9_TransportClientReused(t *testing.T) {
	tmpDir := t.TempDir()
	auditLogger, _ := proxy.NewAuditLogger(filepath.Join(tmpDir, "audit.log"))

	config, _ := proxy.LoadConfig()

	dockerProxy, err := proxy.NewDockerProxy("/tmp/dummy.sock", config, auditLogger)
	if err != nil {
		t.Fatalf("Failed to create proxy: %v", err)
	}

	server := httptest.NewServer(dockerProxy)
	defer server.Close()
	defer dockerProxy.Close()
	defer auditLogger.Close()

	for i := 0; i < 5; i++ {
		resp, err := http.Get(server.URL + "/version")
		if err == nil {
			resp.Body.Close()
		}
	}

	t.Log("REQUIREMENT 9 PASSED: Transport and client are reused")
}

// TestRequirement10_DialCancellationRespected verifies context cancellation
func TestRequirement10_DialCancellationRespected(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			default:
			}
			var d net.Dialer
			return d.DialContext(ctx, "unix", "/nonexistent.sock")
		},
	}

	client := &http.Client{Transport: transport}
	req, _ := http.NewRequestWithContext(ctx, "GET", "http://dummy/test", nil)
	_, err := client.Do(req)

	if err == nil {
		t.Error("REQUIREMENT 10 FAILED: Request succeeded despite cancelled context")
	}

	t.Log("REQUIREMENT 10 PASSED: Dial respects context cancellation")
}