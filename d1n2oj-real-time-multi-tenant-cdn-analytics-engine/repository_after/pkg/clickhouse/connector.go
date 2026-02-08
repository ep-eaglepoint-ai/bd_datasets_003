package clickhouse

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"time"
)

type ClickHouseConnector struct {
	db     *sql.DB
	table  string
	logger *slog.Logger
}

type ConnectorConfig struct {
	Host     string
	Port     int
	Database string
	User     string
	Password string
	Table    string 

	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
}


func DefaultConnectorConfig() *ConnectorConfig {
	return &ConnectorConfig{
		Host:            "localhost",
		Port:            9000,
		Database:        "cdn_analytics",
		User:            "default",
		Password:        "",
		Table:           "cdn_logs",
		MaxOpenConns:    3,
		MaxIdleConns:    2,
		ConnMaxLifetime: 30 * time.Minute,
	}
}


func (c *ConnectorConfig) DSN() string {
	return fmt.Sprintf("clickhouse://%s:%s@%s:%d/%s",
		c.User, c.Password, c.Host, c.Port, c.Database,
	)
}

func NewClickHouseConnector(cfg *ConnectorConfig, logger *slog.Logger) (*ClickHouseConnector, error) {
	dsn := cfg.DSN()

	db, err := sql.Open("clickhouse", dsn)
	if err != nil {
		return nil, fmt.Errorf("clickhouse open: %w", err)
	}

	db.SetMaxOpenConns(cfg.MaxOpenConns)
	db.SetMaxIdleConns(cfg.MaxIdleConns)
	db.SetConnMaxLifetime(cfg.ConnMaxLifetime)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("clickhouse ping: %w", err)
	}

	logger.Info("ClickHouse connected",
		"host", cfg.Host,
		"port", cfg.Port,
		"database", cfg.Database,
		"table", cfg.Table,
		"max_open_conns", cfg.MaxOpenConns,
	)

	return &ClickHouseConnector{
		db:     db,
		table:  cfg.Table,
		logger: logger,
	}, nil
}


func (c *ClickHouseConnector) WriteBatch(ctx context.Context, rows []LogRow) error {
	if len(rows) == 0 {
		return nil
	}

	query := fmt.Sprintf(`INSERT INTO %s (
		event_id, customer_id, timestamp, status_code, bytes_sent,
		ip, country, country_code, city, latitude, longitude,
		timezone, asn, asn_org, status_class, event_version
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, c.table)

	tx, err := c.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("clickhouse begin tx: %w", err)
	}

	stmt, err := tx.PrepareContext(ctx, query)
	if err != nil {
		tx.Rollback()
		return fmt.Errorf("clickhouse prepare: %w", err)
	}
	defer stmt.Close()

	for _, r := range rows {
		if _, err := stmt.ExecContext(ctx,
			r.EventID,
			r.CustomerID,
			r.Timestamp,
			r.StatusCode,
			r.BytesSent,
			r.IP,
			r.Country,
			r.CountryCode,
			r.City,
			r.Latitude,
			r.Longitude,
			r.Timezone,
			r.ASN,
			r.ASNOrg,
			r.StatusClass,
			r.EventVersion,
		); err != nil {
			tx.Rollback()
			return fmt.Errorf("clickhouse exec row: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("clickhouse commit: %w", err)
	}

	c.logger.Debug("ClickHouse batch written",
		"table", c.table,
		"rows", len(rows),
	)

	return nil
}

func (c *ClickHouseConnector) Ping(ctx context.Context) error {
	return c.db.PingContext(ctx)
}


func (c *ClickHouseConnector) Close() error {
	c.logger.Info("Closing ClickHouse connector")
	return c.db.Close()
}
