package proxy

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"regexp"
	"strings"
	"time"
)

// DockerProxy handles proxying requests to Docker socket
type DockerProxy struct {
	auditor    *LogAuditor
	socketPath string
	client     *http.Client
	transport  *http.Transport
}

// NewDockerProxy creates a new Docker proxy
func NewDockerProxy(socketPath string, config *Config, auditLogger *AuditLogger) (*DockerProxy, error) {
	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
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
		Timeout:   0,
	}

	auditor := &LogAuditor{
		Config:      config,
		AuditLogger: auditLogger,
	}
	// Start worker pool
	auditor.StartWorkers()

	return &DockerProxy{
		auditor:    auditor,
		socketPath: socketPath,
		client:     client,
		transport:  transport,
	}, nil
}

// Close gracefully shuts down the proxy
func (p *DockerProxy) Close() {
	if p.auditor != nil {
		p.auditor.StopWorkers()
	}
}

func (p *DockerProxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
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

func isLogsRequest(r *http.Request) bool {
	path := r.URL.Path
	return regexp.MustCompile(`^(/v[\d.]+)?/containers/[^/]+/logs$`).MatchString(path)
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

	contentType := resp.Header.Get("Content-Type")
	isMultiplexed := strings.Contains(contentType, "application/vnd.docker.raw-stream") ||
		strings.Contains(contentType, "application/vnd.docker.multiplexed-stream") ||
		r.URL.Query().Get("stdout") != "" ||
		r.URL.Query().Get("stderr") != ""

	if isMultiplexed {
		flusher, _ := w.(http.Flusher)
		p.auditor.AuditMultiplexedStream(r.Context(), resp.Body, w, containerID, flusher)
	} else {
		p.auditor.AuditPlainStream(r.Context(), resp.Body, w, containerID)
	}
}

func extractContainerID(path string) string {
	re := regexp.MustCompile(`/containers/([^/]+)/logs`)
	matches := re.FindStringSubmatch(path)
	if len(matches) > 1 {
		return matches[1]
	}
	return "unknown"
}