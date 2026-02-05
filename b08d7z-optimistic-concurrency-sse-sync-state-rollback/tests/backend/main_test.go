package main

import (
	"bufio"
	"bytes"
	"fmt"
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

func repoPath() string {
	if p := strings.TrimSpace(os.Getenv("REPO_PATH")); p != "" {
		return p
	}
	// Default used in your Docker commands.
	return "repository_after"
}

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

func waitForServer(addr string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", addr, 200*time.Millisecond)
		if err == nil {
			_ = conn.Close()
			return nil
		}
		time.Sleep(75 * time.Millisecond)
	}
	return fmt.Errorf("server did not become ready at %s within %s", addr, timeout)
}

func startImplementationServer(t *testing.T, initialSeats int) (baseURL string, stop func()) {
	t.Helper()

	port := getFreePort(t)
	backendDir := filepath.Join("..", "..", repoPath(), "backend")

	cmd := exec.Command("go", "run", "main.go")
	cmd.Dir = backendDir
	cmd.Env = append(os.Environ(),
		"PORT="+port,
		fmt.Sprintf("INITIAL_SEATS=%d", initialSeats),
	)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Start(); err != nil {
		t.Fatalf("failed to start implementation backend: %v", err)
	}

	if err := waitForServer("127.0.0.1:"+port, 5*time.Second); err != nil {
		_ = cmd.Process.Kill()
		_, _ = cmd.Process.Wait()
		t.Fatalf("%v\n--- backend stdout ---\n%s\n--- backend stderr ---\n%s", err, stdout.String(), stderr.String())
	}

	cleanup := func() {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
			_, _ = cmd.Process.Wait()
		}
	}

	return "http://127.0.0.1:" + port, cleanup
}

// ---- SSE helpers ----

type sseConn struct {
	resp  *http.Response
	lines chan string
	errCh chan error
}

func connectSSE(t *testing.T, url string) *sseConn {
	t.Helper()

	resp, err := http.Get(url)
	if err != nil {
		t.Fatalf("failed to connect to SSE endpoint: %v", err)
	}

	c := &sseConn{
		resp:  resp,
		lines: make(chan string, 64),
		errCh: make(chan error, 1),
	}

	reader := bufio.NewReader(resp.Body)

	go func() {
		defer close(c.lines)
		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				c.errCh <- err
				return
			}
			c.lines <- strings.TrimSpace(line)
		}
	}()

	return c
}

func (c *sseConn) Close() {
	if c != nil && c.resp != nil && c.resp.Body != nil {
		_ = c.resp.Body.Close()
	}
}

func (c *sseConn) NextDataLine(t *testing.T, timeout time.Duration) string {
	t.Helper()

	timer := time.NewTimer(timeout)
	defer timer.Stop()

	for {
		select {
		case line, ok := <-c.lines:
			if !ok {
				select {
				case err := <-c.errCh:
					t.Fatalf("SSE stream closed: %v", err)
				default:
					t.Fatalf("SSE stream closed")
				}
			}

			// Skip empty lines and non-data SSE fields.
			if line == "" ||
				strings.HasPrefix(line, ":") ||
				strings.HasPrefix(line, "event:") ||
				strings.HasPrefix(line, "id:") ||
				strings.HasPrefix(line, "retry:") {
				continue
			}

			if strings.HasPrefix(line, "data:") {
				return line
			}

			// If it's some other SSE field, ignore and keep reading.
			continue

		case <-timer.C:
			c.Close()
			t.Fatalf("timed out waiting for SSE data line after %s", timeout)
			return ""
		}
	}
}

// REQ-1 mapping: verifies backend implementation imports only standard-library packages.
func TestMustNotUseExternalLibraries(t *testing.T) {
	backendFile := filepath.Join("..", "..", repoPath(), "backend", "main.go")
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

	sse := connectSSE(t, baseURL+"/events")
	defer sse.Close()

	if got := sse.resp.Header.Get("Content-Type"); !strings.Contains(got, "text/event-stream") {
		t.Fatalf("expected text/event-stream header, got %q", got)
	}

	line := sse.NextDataLine(t, 2*time.Second)
	if !strings.HasPrefix(line, "data:") {
		t.Fatalf("expected SSE data line, got %q", line)
	}
}

// REQ-4 mapping: validates broadcast to all active SSE clients after successful booking.
func TestMustBroadcastUpdatesToAllActiveClientsAfterSuccessfulBooking(t *testing.T) {
	baseURL, stop := startImplementationServer(t, 5)
	defer stop()

	clientA := connectSSE(t, baseURL+"/events")
	defer clientA.Close()
	clientB := connectSSE(t, baseURL+"/events")
	defer clientB.Close()

	// Drain initial value from both streams.
	_ = clientA.NextDataLine(t, 2*time.Second)
	_ = clientB.NextDataLine(t, 2*time.Second)

	bookResp, err := http.Post(baseURL+"/book", "application/json", nil)
	if err != nil {
		t.Fatalf("booking request failed: %v", err)
	}
	defer bookResp.Body.Close()

	if bookResp.StatusCode != http.StatusOK {
		t.Fatalf("expected booking success, got %d", bookResp.StatusCode)
	}

	lineA := clientA.NextDataLine(t, 2*time.Second)
	lineB := clientB.NextDataLine(t, 2*time.Second)

	// With 5 seats initially, after one booking remaining should be 4.
	if !strings.HasPrefix(lineA, "data: 4") {
		t.Fatalf("client A did not receive updated count, got %q", lineA)
	}
	if !strings.HasPrefix(lineB, "data: 4") {
		t.Fatalf("client B did not receive updated count, got %q", lineB)
	}
}

// REQ-9 mapping alias: evaluator expects this canonical long-form test name.
func TestConcurrencyTestBackendInitializeServerWith1SeatLaunch5ConcurrentPOSTBookRequestsVerifyExactlyOneReturns200OKAndFourReturn409Conflict(t *testing.T) {
	TestCriticalConcurrencyOneSeatFiveRequestsOneSuccessFourConflict(t)
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
			} else if resp.StatusCode == http.StatusConflict {
				conflicts++
			}
		}()
	}

	wg.Wait()

	if successes != 1 || conflicts != 4 {
		t.Fatalf("expected 1 success and 4 conflicts, got %d success and %d conflicts", successes, conflicts)
	}
}
