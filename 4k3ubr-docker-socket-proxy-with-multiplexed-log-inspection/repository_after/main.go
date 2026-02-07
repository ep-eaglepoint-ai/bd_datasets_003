package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"docker-socket-proxy/repository_after/proxy"
)

const (
	dockerSocket = "/var/run/docker.sock"
	proxyAddr    = ":2375"
)

func main() {
	config, err := proxy.LoadConfig()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	auditLogger, err := proxy.NewAuditLoggerWithRotation("audit.log", config.MaxLogSizeMB, config.MaxLogFiles)
	if err != nil {
		log.Fatalf("Failed to initialize audit logger: %v", err)
	}
	defer auditLogger.Close()

	proxyHandler, err := proxy.NewDockerProxy(dockerSocket, config, auditLogger)
	if err != nil {
		log.Fatalf("Failed to create proxy: %v", err)
	}
	defer proxyHandler.Close()

	server := &http.Server{
		Addr:    proxyAddr,
		Handler: proxyHandler,
	}

	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
		<-sigChan

		log.Println("Shutting down proxy...")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if err := server.Shutdown(ctx); err != nil {
			log.Printf("Server shutdown error: %v", err)
		}
	}()

	log.Printf("Docker Socket Proxy listening on %s", proxyAddr)
	log.Printf("Proxying to %s", dockerSocket)
	log.Printf("Loaded %d sensitive patterns", len(config.SensitivePatterns))

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server error: %v", err)
	}

	log.Println("Proxy shut down cleanly")
}