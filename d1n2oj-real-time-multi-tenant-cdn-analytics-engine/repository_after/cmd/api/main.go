package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/clickhouse"
	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/config"
	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/handlers"
	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/middlewares"
	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/routes"
	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/service"
	"github.com/labstack/echo/v5"
)

func main() {

	cfg := config.Load()

	logger := setupLogger(cfg.LogLevel)
	slog.SetDefault(logger)

	slog.Info("Starting CDN Analytics Engine",
		"environment", cfg.Environment,
		"port", cfg.ServerPort,
	)

	var svcOpts []service.Option
	var chConn *clickhouse.ClickHouseConnector

	chCfg := &clickhouse.ConnectorConfig{
		Host:            cfg.ClickHouseHost,
		Port:            cfg.ClickHousePort,
		Database:        cfg.ClickHouseDatabase,
		User:            cfg.ClickHouseUser,
		Password:        cfg.ClickHousePassword,
		Table:           cfg.ClickHouseTable,
		MaxOpenConns:    3,
		MaxIdleConns:    2,
		ConnMaxLifetime: 30 * time.Minute,
	}

	if conn, connErr := clickhouse.NewClickHouseConnector(chCfg, logger); connErr != nil {
		slog.Warn("ClickHouse unavailable, using in-memory mock", "error", connErr)
	} else {
		chConn = conn
		slog.Info("ClickHouse connected successfully")
		svcOpts = append(svcOpts, service.WithConnector(chConn))
	}

	e := echo.New()

	middlewares.Setup(e, logger)

	svc, err := service.New(cfg, logger, svcOpts...)
	if err != nil {
		slog.Error("Failed to initialize service", "error", err)
		os.Exit(1)
	}

	h := handlers.New(svc, logger)

	tenantCache := middlewares.NewTenantCache(logger)

	routes.Setup(e, h, tenantCache)

	go func() {
		addr := ":" + cfg.ServerPort
		slog.Info("Server starting", "address", addr)
		if err := e.Start(addr); err != nil && err.Error() != "http: Server closed" {
			slog.Error("Server error", "error", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("Shutting down server...")

	if err := svc.Shutdown(context.Background()); err != nil {
		slog.Error("Service shutdown failed", "error", err)
	}

	if chConn != nil {
		if err := chConn.Close(); err != nil {
			slog.Error("ClickHouse close failed", "error", err)
		}
	}

	slog.Info("Server exited")
}

func setupLogger(level string) *slog.Logger {
	var logLevel slog.Level
	switch level {
	case "debug":
		logLevel = slog.LevelDebug
	case "info":
		logLevel = slog.LevelInfo
	case "warn":
		logLevel = slog.LevelWarn
	case "error":
		logLevel = slog.LevelError
	default:
		logLevel = slog.LevelInfo
	}

	opts := &slog.HandlerOptions{
		Level: logLevel,
	}

	return slog.New(slog.NewJSONHandler(os.Stdout, opts))
}
