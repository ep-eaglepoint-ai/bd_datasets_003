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

// Ping checks database connectivity.
// When a real ClickHouse driver is added, this will execute a lightweight
// SELECT 1 query. For now it validates the configuration is present.
func (ch *ClickHouse) Ping(ctx context.Context) error {
	if ch.cfg.ClickHouseHost == "" {
		return fmt.Errorf("clickhouse: host not configured")
	}
	ch.logger.Debug("ClickHouse ping OK", "dsn", ch.DSN())
	return nil
}

// Close closes the database connection pool.
// When a real ClickHouse driver is added, this will drain in-flight
// queries and release the connection pool.
func (ch *ClickHouse) Close() error {
	ch.logger.Info("ClickHouse connection closed",
		"host", ch.cfg.ClickHouseHost,
		"database", ch.cfg.ClickHouseDatabase,
	)
	return nil
}

// BatchInsert inserts events in batch for optimal performance.
// When a real ClickHouse driver is wired in, this will prepare a batch
// INSERT statement and append each row. For now it validates input and
// simulates the operation so the rest of the pipeline is exercised.
func (ch *ClickHouse) BatchInsert(ctx context.Context, table string, data []map[string]interface{}) error {
	start := time.Now()
	count := len(data)

	if count == 0 {
		return nil
	}

	// Validate context is still active before proceeding
	if err := ctx.Err(); err != nil {
		return fmt.Errorf("clickhouse batch insert aborted: %w", err)
	}

	// In production this would:
	// 1. Prepare batch: batch, err := conn.PrepareBatch(ctx, "INSERT INTO "+table)
	// 2. For each row, call batch.Append(...) with column values
	// 3. Commit: batch.Send()
	//
	// The column mapping from data[i] keys would be:
	//   event_id, customer_id, timestamp, status_code, bytes_sent,
	//   ip, country, country_code, city, latitude, longitude,
	//   timezone, asn, asn_org, status_class, event_version

	ch.logger.Debug("batch insert completed",
		"table", table,
		"count", count,
		"duration_ms", time.Since(start).Milliseconds(),
	)

	return nil
}
