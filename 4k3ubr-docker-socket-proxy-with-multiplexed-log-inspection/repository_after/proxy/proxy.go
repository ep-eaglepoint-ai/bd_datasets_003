package proxy

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Pre-compiled regexes (avoids recompilation on every request)
var (
	logsPathRegex    = regexp.MustCompile(`^(/v[\d.]+)?/containers/[^/]+/logs$`)
	containerIDRegex = regexp.MustCompile(`/containers/([^/]+)/logs`)
)

// DockerProxy handles proxying requests to Docker socket
type DockerProxy struct {
	auditor     *LogAuditor
	socketPath  string
	client      *http.Client
	transport   *http.Transport
	dialNetwork string
	dialMu      sync.Mutex
}

// NewDockerProxy creates a new Docker proxy
func NewDockerProxy(socketPath string, config *Config, auditLogger *AuditLogger) (*DockerProxy, error) {
	p := &DockerProxy{
		socketPath: socketPath,
	}

	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			p.dialMu.Lock()
			p.dialNetwork = "unix"
			p.dialMu.Unlock()

			var d net.Dialer
			return d.DialContext(ctx, "unix", socketPath)
		},
		MaxIdleConns:       10,
		IdleConnTimeout:    30 * time.Second,
		DisableCompression: true,
		DisableKeepAlives:  false,
	}

	client := &http.Client{
		Transport: transport,
		Timeout:   0, // No timeout — streams can be long-lived
	}

	auditor := &LogAuditor{
		Config:      config,
		AuditLogger: auditLogger,
	}
	auditor.StartWorkers()

	p.transport = transport
	p.client = client
	p.auditor = auditor

	return p, nil
}

// Close gracefully shuts down the proxy
func (p *DockerProxy) Close() {
	if p.auditor != nil {
		p.auditor.StopWorkers()
	}
	if p.transport != nil {
		p.transport.CloseIdleConnections()
	}
}

// DialedNetwork returns what network the last dial used (for testing)
func (p *DockerProxy) DialedNetwork() string {
	p.dialMu.Lock()
	defer p.dialMu.Unlock()
	return p.dialNetwork
}

// GetMetrics returns observability metrics
func (p *DockerProxy) GetMetrics() map[string]interface{} {
	metrics := make(map[string]interface{})

	if p.auditor != nil {
		dropped := atomic.LoadInt64(&p.auditor.droppedCount)
		metrics["dropped_audits"] = dropped

		if p.auditor.AuditLogger != nil {
			logSize, logFile := p.auditor.AuditLogger.GetMetrics()
			metrics["audit_log_size_bytes"] = logSize
			metrics["audit_log_file"] = logFile
		}
	}

	return metrics
}

func (p *DockerProxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Handle metrics endpoint
	if r.URL.Path == "/metrics" || r.URL.Path == "/_proxy/metrics" {
		p.handleMetrics(w, r)
		return
	}

	if isLogsRequest(r) {
		if r.Method != http.MethodGet {
			http.Error(w, "Only GET method allowed for logs endpoint", http.StatusMethodNotAllowed)
			return
		}
		p.handleLogsRequest(w, r)
		return
	}

	p.handleStandardProxy(w, r)
}

func (p *DockerProxy) handleMetrics(w http.ResponseWriter, r *http.Request) {
	metrics := p.GetMetrics()

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)

	fmt.Fprintf(w, "# HELP docker_proxy_dropped_audits_total Total number of dropped audit events\n")
	fmt.Fprintf(w, "# TYPE docker_proxy_dropped_audits_total counter\n")
	fmt.Fprintf(w, "docker_proxy_dropped_audits_total %d\n", metrics["dropped_audits"])

	if size, ok := metrics["audit_log_size_bytes"].(int64); ok {
		fmt.Fprintf(w, "# HELP docker_proxy_audit_log_size_bytes Current size of audit log file\n")
		fmt.Fprintf(w, "# TYPE docker_proxy_audit_log_size_bytes gauge\n")
		fmt.Fprintf(w, "docker_proxy_audit_log_size_bytes %d\n", size)
	}
}

// isLogsRequest uses pre-compiled regex to check if the request targets container logs
func isLogsRequest(r *http.Request) bool {
	return logsPathRegex.MatchString(r.URL.Path)
}

// extractContainerID uses pre-compiled regex to extract the container ID from the path
func extractContainerID(path string) string {
	matches := containerIDRegex.FindStringSubmatch(path)
	if len(matches) > 1 {
		return matches[1]
	}
	return "unknown"
}

func (p *DockerProxy) handleStandardProxy(w http.ResponseWriter, r *http.Request) {
	proxyReq, err := http.NewRequestWithContext(r.Context(), r.Method, "http://localhost"+r.URL.String(), r.Body)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to create proxy request: %v", err), http.StatusInternalServerError)
		return
	}

	for key, values := range r.Header {
		for _, value := range values {
			proxyReq.Header.Add(key, value)
		}
	}

	resp, err := p.client.Do(proxyReq)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to proxy request: %v", err), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	for key, values := range resp.Header {
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}

	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

func (p *DockerProxy) handleLogsRequest(w http.ResponseWriter, r *http.Request) {
	containerID := extractContainerID(r.URL.Path)

	proxyReq, err := http.NewRequestWithContext(r.Context(), r.Method, "http://localhost"+r.URL.String(), r.Body)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to create proxy request: %v", err), http.StatusInternalServerError)
		return
	}

	for key, values := range r.Header {
		for _, value := range values {
			proxyReq.Header.Add(key, value)
		}
	}

	resp, err := p.client.Do(proxyReq)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to proxy request: %v", err), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	for key, values := range resp.Header {
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}

	w.WriteHeader(resp.StatusCode)

	// Determine if stream is multiplexed based on Docker's content type.
	// application/vnd.docker.raw-stream = TTY (non-multiplexed)
	// application/vnd.docker.multiplexed-stream = multiplexed (stdout+stderr interleaved)
	contentType := resp.Header.Get("Content-Type")
	isMultiplexed := strings.Contains(contentType, "application/vnd.docker.multiplexed-stream")

	// Heuristic fallback: if both stdout AND stderr are requested and content-type
	// doesn't indicate raw-stream (TTY), assume multiplexed format.
	if !isMultiplexed && !strings.Contains(contentType, "application/vnd.docker.raw-stream") {
		hasStdout := r.URL.Query().Get("stdout") != ""
		hasStderr := r.URL.Query().Get("stderr") != ""
		if hasStdout && hasStderr {
			isMultiplexed = true
		}
		// Single stream (only stdout or only stderr) without explicit content-type:
		// also treat as multiplexed since Docker still frames single streams
		if (hasStdout || hasStderr) && !(hasStdout && hasStderr) {
			isMultiplexed = true
		}
	}

	if isMultiplexed {
		flusher, _ := w.(http.Flusher)
		p.auditor.AuditMultiplexedStream(r.Context(), resp.Body, w, containerID, flusher)
	} else {
		p.auditor.AuditPlainStream(r.Context(), resp.Body, w, containerID)
	}
}