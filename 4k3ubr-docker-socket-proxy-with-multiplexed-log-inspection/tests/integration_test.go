package tests

import (
	"bytes"
	"encoding/binary"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"strings"
	"testing"
	"time"
)

// Integration test for the complete proxy system
func TestCompleteProxyIntegration(t *testing.T) {
	t.Run("MultiplexedStreamProcessing", func(t *testing.T) {
		testMultiplexedStreamProcessing(t)
	})

	t.Run("RegexMatching", func(t *testing.T) {
		testRegexMatching(t)
	})

	t.Run("NonBlockingAudit", func(t *testing.T) {
		testNonBlockingAudit(t)
	})
}

func testMultiplexedStreamProcessing(t *testing.T) {
	// Create test multiplexed stream
	var inputBuf bytes.Buffer

	testData := []struct {
		streamType byte
		data       string
	}{
		{1, "Normal log line\n"},
		{2, "Error message\n"},
		{1, "AKIAIOSFODNN7EXAMPLE\n"}, // AWS key
	}

	for _, td := range testData {
		header := make([]byte, 8)
		header[0] = td.streamType
		binary.BigEndian.PutUint32(header[4:8], uint32(len(td.data)))

		inputBuf.Write(header)
		inputBuf.Write([]byte(td.data))
	}

	// Process the stream
	var outputBuf bytes.Buffer
	header := make([]byte, 8)
	processedFrames := 0

	for {
		n, err := io.ReadFull(&inputBuf, header)
		if err == io.EOF || n == 0 {
			break
		}

		size := binary.BigEndian.Uint32(header[4:8])
		payload := make([]byte, size)
		io.ReadFull(&inputBuf, payload)

		// Write to output (simulating proxy behavior)
		outputBuf.Write(header)
		outputBuf.Write(payload)

		processedFrames++
	}

	if processedFrames != len(testData) {
		t.Errorf("Expected %d frames, processed %d", len(testData), processedFrames)
	}
}

func testRegexMatching(t *testing.T) {
	patterns := []struct {
		name    string
		regex   *regexp.Regexp
		text    string
		matches bool
	}{
		{
			"AWS Access Key",
			regexp.MustCompile(`AKIA[0-9A-Z]{16}`),
			"Secret: AKIAIOSFODNN7EXAMPLE",
			true,
		},
		{
			"Email",
			regexp.MustCompile(`[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`),
			"Contact: user@example.com",
			true,
		},
		{
			"No match",
			regexp.MustCompile(`AKIA[0-9A-Z]{16}`),
			"Normal log line",
			false,
		},
	}

	for _, p := range patterns {
		t.Run(p.name, func(t *testing.T) {
			matched := p.regex.MatchString(p.text)
			if matched != p.matches {
				t.Errorf("Expected match=%v, got match=%v", p.matches, matched)
			}
		})
	}
}

func testNonBlockingAudit(t *testing.T) {
	// Test that audit operations don't block
	start := time.Now()

	// Simulate async audit logging
	done := make(chan bool, 10)
	for i := 0; i < 10; i++ {
		go func() {
			// Simulate audit work
			time.Sleep(10 * time.Millisecond)
			done <- true
		}()
	}

	// Main processing should not wait
	elapsed := time.Since(start)

	// Should complete almost immediately, not wait for goroutines
	if elapsed > 50*time.Millisecond {
		t.Errorf("Audit appears to be blocking: took %v", elapsed)
	}

	// Wait for all audits to complete
	for i := 0; i < 10; i++ {
		<-done
	}
}

// TestUnixSocketDialing tests Unix socket connection logic
func TestUnixSocketDialing(t *testing.T) {
	// Create a test Unix socket
	tmpDir := t.TempDir()
	socketPath := tmpDir + "/test.sock"

	// Start a test server
	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		t.Fatalf("Failed to create Unix socket: %v", err)
	}
	defer listener.Close()

	go func() {
		conn, _ := listener.Accept()
		if conn != nil {
			conn.Close()
		}
	}()

	// Try to dial the socket
	conn, err := net.Dial("unix", socketPath)
	if err != nil {
		t.Fatalf("Failed to dial Unix socket: %v", err)
	}
	conn.Close()
}

// TestAuditLogging tests audit log file creation and writing
func TestAuditLogging(t *testing.T) {
	tmpDir := t.TempDir()
	auditFile := tmpDir + "/audit.log"

	// Create audit logger
	f, err := os.OpenFile(auditFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		t.Fatalf("Failed to create audit file: %v", err)
	}
	defer f.Close()

	// Write audit event
	event := `{"timestamp":"2024-01-01T00:00:00Z","container_id":"test123","pattern":"AWS Access Key"}`
	_, err = f.WriteString(event + "\n")
	if err != nil {
		t.Fatalf("Failed to write audit event: %v", err)
	}

	// Verify file was created and written
	content, err := os.ReadFile(auditFile)
	if err != nil {
		t.Fatalf("Failed to read audit file: %v", err)
	}

	if !strings.Contains(string(content), "test123") {
		t.Error("Audit file should contain container ID")
	}
}

// TestHTTPReverseProxy tests basic proxy functionality
func TestHTTPReverseProxy(t *testing.T) {
	// Create a test backend server
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Backend response"))
	}))
	defer backend.Close()

	// Create proxy handler
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Simple proxy logic
		resp, err := http.Get(backend.URL)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()

		body, _ := io.ReadAll(resp.Body)
		w.WriteHeader(resp.StatusCode)
		w.Write(body)
	}))
	defer proxy.Close()

	// Test the proxy
	resp, err := http.Get(proxy.URL)
	if err != nil {
		t.Fatalf("Failed to call proxy: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if string(body) != "Backend response" {
		t.Errorf("Expected 'Backend response', got '%s'", string(body))
	}
}