package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"webhook-delivery-system/internal/config"
	"webhook-delivery-system/internal/database"
	"webhook-delivery-system/internal/delivery"
	"webhook-delivery-system/internal/handlers"
	"webhook-delivery-system/internal/metrics"
	"webhook-delivery-system/internal/queue"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func main() {
	cfg := config.Load()

	db, err := database.New(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	if err := db.Migrate(); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	redisQueue, err := queue.NewRedisQueue(cfg.RedisURL)
	if err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	defer redisQueue.Close()

	metricsCollector := metrics.New()
	circuitBreaker := delivery.NewCircuitBreaker()
	rateLimiter := delivery.NewRateLimiter(100, time.Minute)

	deliveryService := delivery.NewService(db, redisQueue, metricsCollector, circuitBreaker, rateLimiter)

	if err := deliveryService.RecoverPendingDeliveries(context.Background()); err != nil {
		log.Printf("Warning: Failed to recover pending deliveries: %v", err)
	}

	workerCtx, cancelWorkers := context.WithCancel(context.Background())
	for i := 0; i < cfg.WorkerCount; i++ {
		go deliveryService.StartWorker(workerCtx, i)
	}

	h := handlers.New(db, redisQueue, deliveryService, metricsCollector)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))

	r.Post("/webhooks", h.CreateWebhook)
	r.Get("/webhooks/{id}", h.GetWebhook)
	r.Put("/webhooks/{id}", h.UpdateWebhook)
	r.Delete("/webhooks/{id}", h.DeleteWebhook)
	r.Get("/webhooks", h.ListWebhooks)

	r.Post("/events", h.CreateEvent)
	r.Get("/events/{id}", h.GetEvent)

	r.Get("/deliveries/{id}", h.GetDelivery)
	r.Get("/deliveries/{id}/logs", h.GetDeliveryLogs)
	r.Post("/deliveries/{id}/replay", h.ReplayDelivery)

	r.Get("/dead-letters", h.ListDeadLetters)
	r.Post("/dead-letters/{id}/replay", h.ReplayDeadLetter)

	r.Get("/metrics", h.GetMetrics)
	r.Get("/health", h.HealthCheck)

	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("Server starting on port %s", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")
	cancelWorkers()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited properly")
}
