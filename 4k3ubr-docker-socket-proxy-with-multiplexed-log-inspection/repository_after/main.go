package main

import (
	"context"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

const (
	dockerSocket = "/var/run/docker.sock"
	proxyAddr    = ":2375"
)

func main() {
	// Initialize audit logger
	auditLogger, err := NewAuditLogger("audit.log")
	if err != nil {
		log.Fatalf("Failed to initialize audit logger: %v", err)
	}
	defer auditLogger.Close()

	// Load configuration
	config := LoadConfig()

	// Create proxy handler
	proxy := &DockerProxy{
		auditor: &LogAuditor{
			config:      config,
			auditLogger: auditLogger,
		},
		socketPath: dockerSocket,
	}

	// Create HTTP server
	server := &http.Server{
		Addr:    proxyAddr,
		Handler: proxy,
	}

	// Graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
		<-sigChan

		log.Println("Shutting down proxy...")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		server.Shutdown(ctx)
	}()

	log.Printf("Docker Socket Proxy listening on %s", proxyAddr)
	log.Printf("Proxying to %s", dockerSocket)

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server error: %v", err)
	}
}

// DockerProxy handles proxying requests to Docker socket
type DockerProxy struct {
	auditor    *LogAuditor
	socketPath string
}

func (p *DockerProxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Create transport for Unix socket
	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			return net.Dial("unix", p.socketPath)
		},
	}

	// Create client
	client := &http.Client{
		Transport: transport,
	}

	// Check if this is a logs request
	if isLogsRequest(r) {
		p.handleLogsRequest(w, r, client)
		return
	}

	// Standard proxy for other requests
	p.handleStandardProxy(w, r, client)
}