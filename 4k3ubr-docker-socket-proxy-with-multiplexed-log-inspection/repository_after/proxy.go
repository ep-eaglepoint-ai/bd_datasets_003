package main

import (
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
)

// isLogsRequest checks if the request is for container logs
func isLogsRequest(r *http.Request) bool {
	path := r.URL.Path
	return regexp.MustCompile(`^(/v[\d.]+)?/containers/[^/]+/logs$`).MatchString(path)
}

// handleStandardProxy handles non-logs requests with simple proxying
func (p *DockerProxy) handleStandardProxy(w http.ResponseWriter, r *http.Request, client *http.Client) {
	proxyReq, err := http.NewRequest(r.Method, "http://localhost"+r.URL.String(), r.Body)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to create proxy request: %v", err), http.StatusInternalServerError)
		return
	}

	// Copy headers
	for key, values := range r.Header {
		for _, value := range values {
			proxyReq.Header.Add(key, value)
		}
	}

	// Execute request
	resp, err := client.Do(proxyReq)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to proxy request: %v", err), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	// Copy response headers
	for key, values := range resp.Header {
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}

	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

// handleLogsRequest handles container logs with binary stream parsing and auditing
func (p *DockerProxy) handleLogsRequest(w http.ResponseWriter, r *http.Request, client *http.Client) {
	containerID := extractContainerID(r.URL.Path)

	proxyReq, err := http.NewRequest(r.Method, "http://localhost"+r.URL.String(), r.Body)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to create proxy request: %v", err), http.StatusInternalServerError)
		return
	}

	// Copy headers
	for key, values := range r.Header {
		for _, value := range values {
			proxyReq.Header.Add(key, value)
		}
	}

	ctx := r.Context()
	proxyReq = proxyReq.WithContext(ctx)

	resp, err := client.Do(proxyReq)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to proxy request: %v", err), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	// Copy response headers
	for key, values := range resp.Header {
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}

	w.WriteHeader(resp.StatusCode)

	// Check if we can flush
	flusher, canFlush := w.(http.Flusher)

	// Check if this is a multiplexed stream
	contentType := resp.Header.Get("Content-Type")
	isMultiplexed := strings.Contains(contentType, "application/vnd.docker.raw-stream") ||
		strings.Contains(contentType, "application/vnd.docker.multiplexed-stream") ||
		r.URL.Query().Get("stdout") != "" ||
		r.URL.Query().Get("stderr") != ""

	if isMultiplexed && canFlush {
		p.auditor.AuditMultiplexedStream(ctx, resp.Body, w, containerID, flusher)
	} else {
		io.Copy(w, resp.Body)
	}
}

// extractContainerID extracts container ID from the URL path
func extractContainerID(path string) string {
	re := regexp.MustCompile(`/containers/([^/]+)/logs`)
	matches := re.FindStringSubmatch(path)
	if len(matches) > 1 {
		return matches[1]
	}
	return "unknown"
}