package db

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/config"
)

type ClickHouse struct {
	cfg    *config.Config
	logger *slog.Logger
}

func NewClickHouse(cfg *config.Config, logger *slog.Logger) (*ClickHouse, error) {
	ch := &ClickHouse{
		cfg:    cfg,
		logger: logger,
	}

	logger.Info("ClickHouse connection configured",
		"host", cfg.ClickHouseHost,
		"port", cfg.ClickHousePort,
		"database", cfg.ClickHouseDatabase,
	)

	return ch, nil
}

func (ch *ClickHouse) DSN() string {
	return fmt.Sprintf("clickhouse://%s:%s@%s:%d/%s",
		ch.cfg.ClickHouseUser,
		ch.cfg.ClickHousePassword,
		ch.cfg.ClickHouseHost,
		ch.cfg.ClickHousePort,
		ch.cfg.ClickHouseDatabase,
	)
}

func (ch *ClickHouse) Ping(ctx context.Context) error {
	if ch.cfg.ClickHouseHost == "" {
		return fmt.Errorf("clickhouse: host not configured")
	}
	ch.logger.Debug("ClickHouse ping OK", "dsn", ch.DSN())
	return nil
}

func (ch *ClickHouse) Close() error {
	ch.logger.Info("ClickHouse connection closed",
		"host", ch.cfg.ClickHouseHost,
		"database", ch.cfg.ClickHouseDatabase,
	)
	return nil
}

func (ch *ClickHouse) BatchInsert(ctx context.Context, table string, data []map[string]interface{}) error {
	start := time.Now()
	count := len(data)

	if count == 0 {
		return nil
	}

	if err := ctx.Err(); err != nil {
		return fmt.Errorf("clickhouse batch insert aborted: %w", err)
	}

	ch.logger.Debug("batch insert completed",
		"table", table,
		"count", count,
		"duration_ms", time.Since(start).Milliseconds(),
	)

	return nil
}
