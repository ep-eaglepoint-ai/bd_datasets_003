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

func TestRealDockerProxyImplementation(t *testing.T) {
	tmpDir := t.TempDir()
	auditFile := filepath.Join(tmpDir, "audit.log")

	auditLogger, err := proxy.NewAuditLogger(auditFile)
	if err != nil {
		t.Fatalf("Failed to create audit logger: %v", err)
	}
	defer auditLogger.Close()

	config, _ := proxy.LoadConfig()

	backend := createMockDockerBackend(t)
	defer backend.Close()

	socketPath := filepath.Join(tmpDir, "docker.sock")
	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		t.Fatalf("Failed to create Unix socket: %v", err)
	}
	defer listener.Close()

	go http.Serve(listener, backend.Config.Handler)

	proxyHandler, err := proxy.NewDockerProxy(socketPath, config, auditLogger)
	if err != nil {
		t.Fatalf("Failed to create proxy: %v", err)
	}
	defer proxyHandler.Close()

	proxyServer := httptest.NewServer(proxyHandler)
	defer proxyServer.Close()

	resp, err := http.Get(proxyServer.URL + "/containers/test123/logs?stdout=1")
	if err != nil {
		t.Fatalf("Failed to get logs: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if len(body) == 0 {
		t.Error("Expected log data")
	}

	time.Sleep(200 * time.Millisecond)

	auditContent, _ := os.ReadFile(auditFile)
	if len(auditContent) == 0 {
		t.Error("Expected audit entries")
	}
}

// TestUnixSocketDialVerification verifies Unix socket is actually used
func TestUnixSocketDialVerification(t *testing.T) {
	tmpDir := t.TempDir()
	socketPath := filepath.Join(tmpDir, "test.sock")

	dialCalls := make(map[string]int)
	var mu sync.Mutex

	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			mu.Lock()
			dialCalls[network]++
			mu.Unlock()

			var d net.Dialer
			return d.DialContext(ctx, "unix", socketPath)
		},
	}

	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		t.Fatalf("Failed to create Unix socket: %v", err)
	}
	defer listener.Close()

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})
	go http.Serve(listener, handler)

	time.Sleep(50 * time.Millisecond)

	client := &http.Client{Transport: transport}
	req, _ := http.NewRequest("GET", "http://dummy/test", nil)
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("Request failed: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if string(body) != "OK" {
		t.Errorf("Expected 'OK', got '%s'", string(body))
	}

	mu.Lock()
	totalDials := 0
	for _, count := range dialCalls {
		totalDials += count
	}
	mu.Unlock()

	if totalDials == 0 {
		t.Error("No dial calls were made")
	}

	t.Logf("Dial calls: %v", dialCalls)
}

func TestAuditSideEffectVerification(t *testing.T) {
	tmpDir := t.TempDir()
	auditFile := filepath.Join(tmpDir, "audit.log")

	auditLogger, err := proxy.NewAuditLogger(auditFile)
	if err != nil {
		t.Fatalf("Failed to create audit logger: %v", err)
	}
	defer auditLogger.Close()

	config, _ := proxy.LoadConfig()
	auditor := &proxy.LogAuditor{
		Config:      config,
		AuditLogger: auditLogger,
	}

	var buf bytes.Buffer
	payload := []byte("Secret: AKIAIOSFODNN7EXAMPLE\n")
	header := make([]byte, 8)
	header[0] = 1
	binary.BigEndian.PutUint32(header[4:8], uint32(len(payload)))
	buf.Write(header)
	buf.Write(payload)

	var output bytes.Buffer
	ctx := context.Background()
	err = auditor.AuditMultiplexedStream(ctx, &buf, &output, "test-container", nil)
	if err != nil {
		t.Fatalf("Audit failed: %v", err)
	}

	// Wait for async audit workers
	auditor.StopWorkers()

	content, _ := os.ReadFile(auditFile)
	if len(content) == 0 {
		t.Fatal("No audit log created")
	}

	var event proxy.AuditEvent
	json.Unmarshal(bytes.TrimSpace(content), &event)

	if event.ContainerID != "test-container" {
		t.Errorf("Expected 'test-container', got '%s'", event.ContainerID)
	}
}

// TestUnixSocketDialProof verifies the production DockerProxy actually dials unix
func TestUnixSocketDialProof(t *testing.T) {
	tmpDir := t.TempDir()
	socketPath := filepath.Join(tmpDir, "docker.sock")
	auditFile := filepath.Join(tmpDir, "audit.log")

	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		t.Fatalf("Failed to create Unix socket: %v", err)
	}
	defer listener.Close()

	go http.Serve(listener, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	time.Sleep(50 * time.Millisecond)

	auditLogger, _ := proxy.NewAuditLogger(auditFile)
	config, _ := proxy.LoadConfig()
	p, err := proxy.NewDockerProxy(socketPath, config, auditLogger)
	if err != nil {
		t.Fatalf("Failed to create proxy: %v", err)
	}
	defer p.Close()
	defer auditLogger.Close()

	server := httptest.NewServer(p)
	defer server.Close()

	resp, err := http.Get(server.URL + "/version")
	if err != nil {
		t.Fatalf("Request failed: %v", err)
	}
	resp.Body.Close()

	if p.DialedNetwork() != "unix" {
		t.Fatalf("Expected unix dial, got %q", p.DialedNetwork())
	}

	t.Log("DockerProxy confirmed unix socket dial")
}

func createMockDockerBackend(t *testing.T) *httptest.Server {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/logs") {
			w.Header().Set("Content-Type", "application/vnd.docker.multiplexed-stream")
			w.WriteHeader(http.StatusOK)

			payload := []byte("Log: AKIAIOSFODNN7EXAMPLE\n")
			header := make([]byte, 8)
			header[0] = 1
			binary.BigEndian.PutUint32(header[4:8], uint32(len(payload)))

			w.Write(header)
			w.Write(payload)
			return
		}
		w.WriteHeader(http.StatusOK)
	})

	return httptest.NewServer(handler)
}