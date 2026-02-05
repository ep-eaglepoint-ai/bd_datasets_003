package main

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func getFreePort(t *testing.T) string {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to reserve port: %v", err)
	}
	defer ln.Close()
	_, port, err := net.SplitHostPort(ln.Addr().String())
	if err != nil {
		t.Fatalf("failed to parse reserved port: %v", err)
	}
	return port
}

func waitForServer(t *testing.T, addr string, timeout time.Duration) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", addr, 200*time.Millisecond)
		if err == nil {
			_ = conn.Close()
			return
		}
		time.Sleep(75 * time.Millisecond)
	}
	t.Fatalf("server did not become ready at %s", addr)
}

func startImplementationServer(t *testing.T, initialSeats int) (baseURL string, stop func()) {
	t.Helper()
	port := getFreePort(t)
	backendDir := filepath.Join("..", "..", "repository_after", "backend")

	cmd := exec.Command("go", "run", "main.go")
	cmd.Dir = backendDir
	cmd.Env = append(os.Environ(), "PORT="+port, fmt.Sprintf("INITIAL_SEATS=%d", initialSeats))
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Start(); err != nil {
		t.Fatalf("failed to start implementation backend: %v", err)
	}

	waitForServer(t, "127.0.0.1:"+port, 5*time.Second)

	cleanup := func() {
		_ = cmd.Process.Kill()
		_, _ = cmd.Process.Wait()
	}

	return "http://127.0.0.1:" + port, cleanup
}

func readSSELine(t *testing.T, body io.ReadCloser) string {
	t.Helper()
	reader := bufio.NewReader(body)
	line, err := reader.ReadString('\n')
	if err != nil {
		t.Fatalf("failed reading SSE line: %v", err)
	}
	return strings.TrimSpace(line)
}

// REQ-1 mapping: verifies backend implementation imports only standard-library packages.
func TestMustNotUseExternalLibraries(t *testing.T) {
	backendFile := filepath.Join("..", "..", "repository_after", "backend", "main.go")
	content, err := os.ReadFile(backendFile)
	if err != nil {
		t.Fatalf("failed to read backend implementation: %v", err)
	}

	for _, line := range strings.Split(string(content), "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "\"") {
			if strings.Contains(trimmed, "github.com") || strings.Contains(trimmed, "golang.org/x") {
				t.Fatalf("external backend dependency found: %s", trimmed)
			}
		}
	}
}

// REQ-2 mapping: validates concurrency safety around decrement operation using the real /book endpoint.
func TestMustUseSyncMutexToProtectDecrementOperation(t *testing.T) {
	baseURL, stop := startImplementationServer(t, 100)
	defer stop()

	var wg sync.WaitGroup
	successCount := 0
	var mu sync.Mutex

	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			resp, err := http.Post(baseURL+"/book", "application/json", nil)
			if err != nil {
				t.Errorf("request failed: %v", err)
				return
			}
			defer resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				mu.Lock()
				successCount++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()

	if successCount != 50 {
		t.Fatalf("expected 50 successful decrements, got %d", successCount)
	}
}

// REQ-3 mapping: validates SSE endpoint and required text/event-stream header.
func TestMustImplementServerSentEventsWithCorrectHeaders(t *testing.T) {
	baseURL, stop := startImplementationServer(t, 5)
	defer stop()

	resp, err := http.Get(baseURL + "/events")
	if err != nil {
		t.Fatalf("failed to connect to SSE endpoint: %v", err)
	}
	defer resp.Body.Close()

	if got := resp.Header.Get("Content-Type"); !strings.Contains(got, "text/event-stream") {
		t.Fatalf("expected text/event-stream header, got %q", got)
	}

	line := readSSELine(t, resp.Body)
	if !strings.HasPrefix(line, "data: ") {
		t.Fatalf("expected SSE data line, got %q", line)
	}
}

// REQ-4 mapping: validates broadcast to all active SSE clients after successful booking.
func TestMustBroadcastUpdatesToAllActiveClientsAfterSuccessfulBooking(t *testing.T) {
	baseURL, stop := startImplementationServer(t, 5)
	defer stop()

	clientA, err := http.Get(baseURL + "/events")
	if err != nil {
		t.Fatalf("client A failed to connect SSE: %v", err)
	}
	defer clientA.Body.Close()
	clientB, err := http.Get(baseURL + "/events")
	if err != nil {
		t.Fatalf("client B failed to connect SSE: %v", err)
	}
	defer clientB.Body.Close()

	_ = readSSELine(t, clientA.Body)
	_ = readSSELine(t, clientB.Body)

	bookResp, err := http.Post(baseURL+"/book", "application/json", nil)
	if err != nil {
		t.Fatalf("booking request failed: %v", err)
	}
	defer bookResp.Body.Close()
	if bookResp.StatusCode != http.StatusOK {
		t.Fatalf("expected booking success, got %d", bookResp.StatusCode)
	}

	lineA := readSSELine(t, clientA.Body)
	lineB := readSSELine(t, clientB.Body)
	if !strings.HasPrefix(lineA, "data: 4") {
		t.Fatalf("client A did not receive updated count, got %q", lineA)
	}
	if !strings.HasPrefix(lineB, "data: 4") {
		t.Fatalf("client B did not receive updated count, got %q", lineB)
	}
}

// REQ-9 mapping: with 1 initial seat and 5 concurrent bookings, verifies exactly 1 success and 4 conflicts.
func TestCriticalConcurrencyOneSeatFiveRequestsOneSuccessFourConflict(t *testing.T) {
	baseURL, stop := startImplementationServer(t, 1)
	defer stop()

	var wg sync.WaitGroup
	successes := 0
	conflicts := 0
	var mu sync.Mutex

	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			resp, err := http.Post(baseURL+"/book", "application/json", nil)
			if err != nil {
				t.Errorf("request failed: %v", err)
				return
			}
			defer resp.Body.Close()

			mu.Lock()
			defer mu.Unlock()
			if resp.StatusCode == http.StatusOK {
				successes++
			}
			if resp.StatusCode == http.StatusConflict {
				conflicts++
			}
		}()
	}
	wg.Wait()

	if successes != 1 || conflicts != 4 {
		t.Fatalf("expected 1 success and 4 conflicts, got %d success and %d conflicts", successes, conflicts)
	}
}
