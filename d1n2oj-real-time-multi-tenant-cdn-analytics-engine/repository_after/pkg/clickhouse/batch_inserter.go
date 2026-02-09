package clickhouse

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/aggregator"
	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/types"
)


type BatchConfig struct {

	BatchSize     int           
	FlushInterval time.Duration 

	// Connection pool (tuned for 2-CPU hardware)
	MaxOpenConns    int        
	MaxIdleConns    int        
	ConnMaxLifetime time.Duration 

	
	MaxRetries   int         
	RetryBackoff time.Duration
}

// DefaultBatchConfig returns production-safe defaults for 2 CPU / 4 GB RAM.
func DefaultBatchConfig() *BatchConfig {
	return &BatchConfig{
		BatchSize:       5000,
		FlushInterval:   10 * time.Second,
		MaxOpenConns:    3,
		MaxIdleConns:    2,
		ConnMaxLifetime: 30 * time.Minute,
		MaxRetries:      3,
		RetryBackoff:    500 * time.Millisecond,
	}
}


// LogRow – the shape written to ClickHouse
// LogRow is the denormalised row sent to ClickHouse in each batch.
type LogRow struct {
	EventID      string
	CustomerID   string
	Timestamp    time.Time
	StatusCode   uint16
	BytesSent    uint64
	IP           string
	Country      string
	CountryCode  string
	City         string
	Latitude     float64
	Longitude    float64
	Timezone     string
	ASN          uint32
	ASNOrg       string
	StatusClass  string
	EventVersion uint64
}

// LogRowFromEntry converts an enriched LogEntry into a LogRow.
func LogRowFromEntry(entry *types.LogEntry, eventID string) LogRow {
	row := LogRow{
		EventID:      eventID,
		CustomerID:   entry.CustomerID,
		Timestamp:    time.Unix(entry.Timestamp, 0).UTC(),
		StatusCode:   uint16(entry.StatusCode),
		BytesSent:    uint64(entry.BytesSent),
		IP:           entry.IP,
		StatusClass:  aggregator.BucketFromCode(entry.StatusCode).Label(),
		EventVersion: 1,
	}

	if entry.GeoIP != nil {
		if geo, ok := entry.GeoIP.(map[string]interface{}); ok {
			if v, ok := geo["country"].(string); ok {
				row.Country = v
			}
			if v, ok := geo["country_code"].(string); ok {
				row.CountryCode = v
			}
			if v, ok := geo["city"].(string); ok {
				row.City = v
			}
			if v, ok := geo["latitude"].(float64); ok {
				row.Latitude = v
			}
			if v, ok := geo["longitude"].(float64); ok {
				row.Longitude = v
			}
			if v, ok := geo["timezone"].(string); ok {
				row.Timezone = v
			}
		}
	}

	return row
}

type Connector interface {
	WriteBatch(ctx context.Context, rows []LogRow) error
	Ping(ctx context.Context) error
	Close() error
}


// BatchInserter – non-blocking, async batch flusher
type BatchInserter struct {
	cfg    *BatchConfig
	conn   Connector
	logger *slog.Logger

	// Incoming rows – buffered channel decouples ingestion from I/O
	rowCh chan LogRow

	// Graceful shutdown
	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup

	// Metrics
	rowsAppended atomic.Int64
	rowsFlushed  atomic.Int64
	flushCount   atomic.Int64
	flushErrors  atomic.Int64
	lastFlushAt  atomic.Int64 // unix-nano
}

// NewBatchInserter creates and starts a batch inserter.
func NewBatchInserter(cfg *BatchConfig, conn Connector, logger *slog.Logger) *BatchInserter {
	ctx, cancel := context.WithCancel(context.Background())

	bi := &BatchInserter{
		cfg:    cfg,
		conn:   conn,
		logger: logger,
		rowCh:  make(chan LogRow, cfg.BatchSize*3),
		ctx:    ctx,
		cancel: cancel,
	}

	bi.wg.Add(1)
	go bi.flushLoop()

	logger.Info("BatchInserter started",
		"batch_size", cfg.BatchSize,
		"flush_interval", cfg.FlushInterval,
		"channel_buffer", cfg.BatchSize*3,
	)

	return bi
}

// Append enqueues a row for batching. Non-blocking: if the internal
// channel is full, the row is dropped and an error is returned so the
// caller can apply back-pressure.
func (bi *BatchInserter) Append(row LogRow) error {
	select {
	case bi.rowCh <- row:
		bi.rowsAppended.Add(1)
		return nil
	case <-bi.ctx.Done():
		return bi.ctx.Err()
	default:
		return ErrBatchBufferFull
	}
}


func (bi *BatchInserter) AppendEntry(entry *types.LogEntry, eventID string) error {
	return bi.Append(LogRowFromEntry(entry, eventID))
}


func (bi *BatchInserter) Shutdown(timeout time.Duration) error {
	bi.logger.Info("Shutting down BatchInserter")


	bi.cancel()


	close(bi.rowCh)

	done := make(chan struct{})
	go func() {
		bi.wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		bi.logger.Info("BatchInserter shutdown complete",
			"rows_flushed", bi.rowsFlushed.Load(),
			"flush_count", bi.flushCount.Load(),
		)
		return nil
	case <-time.After(timeout):
		return ErrShutdownTimeout
	}
}

// GetMetrics returns operational metrics.
func (bi *BatchInserter) GetMetrics() map[string]interface{} {
	lastFlush := time.Unix(0, bi.lastFlushAt.Load())
	return map[string]interface{}{
		"rows_appended":  bi.rowsAppended.Load(),
		"rows_flushed":   bi.rowsFlushed.Load(),
		"flush_count":    bi.flushCount.Load(),
		"flush_errors":   bi.flushErrors.Load(),
		"pending_rows":   len(bi.rowCh),
		"channel_cap":    cap(bi.rowCh),
		"last_flush_at":  lastFlush.Format(time.RFC3339),
		"batch_size":     bi.cfg.BatchSize,
		"flush_interval": bi.cfg.FlushInterval.String(),
	}
}

func (bi *BatchInserter) IsHealthy(ctx context.Context) bool {
	return bi.conn.Ping(ctx) == nil
}


// Internal flush loop
func (bi *BatchInserter) flushLoop() {
	defer bi.wg.Done()

	batch := make([]LogRow, 0, bi.cfg.BatchSize)

	flushInterval := bi.cfg.FlushInterval
	if flushInterval <= 0 {
		flushInterval = 1 * time.Second
	}
	ticker := time.NewTicker(flushInterval)
	defer ticker.Stop()

	for {
		select {
		case row, ok := <-bi.rowCh:
			if !ok {
				if len(batch) > 0 {
					bi.flush(batch)
				}
				return
			}
			batch = append(batch, row)
			if len(batch) >= bi.cfg.BatchSize {
				bi.flush(batch)
				batch = make([]LogRow, 0, bi.cfg.BatchSize)
			}

		case <-ticker.C:
			if len(batch) > 0 {
				bi.flush(batch)
				batch = make([]LogRow, 0, bi.cfg.BatchSize)
			}
		}
	}
}

func (bi *BatchInserter) flush(batch []LogRow) {
	start := time.Now()
	count := len(batch)

	var err error
	for attempt := 0; attempt <= bi.cfg.MaxRetries; attempt++ {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		err = bi.conn.WriteBatch(ctx, batch)
		cancel()

		if err == nil {
			break
		}

		bi.logger.Warn("Batch flush failed, retrying",
			"attempt", attempt+1,
			"max_retries", bi.cfg.MaxRetries,
			"rows", count,
			"error", err,
		)

		if attempt < bi.cfg.MaxRetries {
			backoff := bi.cfg.RetryBackoff * time.Duration(1<<uint(attempt))
			time.Sleep(backoff)
		}
	}

	if err != nil {
		bi.flushErrors.Add(1)
		bi.logger.Error("Batch flush failed permanently",
			"rows", count,
			"error", err,
			"duration_ms", time.Since(start).Milliseconds(),
		)
		return
	}

	bi.rowsFlushed.Add(int64(count))
	bi.flushCount.Add(1)
	bi.lastFlushAt.Store(time.Now().UnixNano())

	bi.logger.Debug("Batch flushed",
		"rows", count,
		"duration_ms", time.Since(start).Milliseconds(),
	)
}

var (
	ErrBatchBufferFull = errors.New("batch inserter buffer full")
	ErrShutdownTimeout = errors.New("batch inserter shutdown timed out")
)


// MockConnector records every batch it receives for assertion.
type MockConnector struct {
	mu           sync.Mutex
	Batches      [][]LogRow
	TotalRows    int64
	WriteLatency time.Duration 
	ShouldError  bool
	PingHealthy  bool
}

func NewMockConnector() *MockConnector {
	return &MockConnector{PingHealthy: true}
}

func (m *MockConnector) WriteBatch(_ context.Context, rows []LogRow) error {
	if m.WriteLatency > 0 {
		time.Sleep(m.WriteLatency)
	}
	if m.ShouldError {
		return fmt.Errorf("mock write error")
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	m.Batches = append(m.Batches, rows)
	m.TotalRows += int64(len(rows))
	return nil
}

func (m *MockConnector) Ping(_ context.Context) error {
	if !m.PingHealthy {
		return fmt.Errorf("mock ping unhealthy")
	}
	return nil
}

func (m *MockConnector) Close() error { return nil }

func (m *MockConnector) GetTotalRows() int64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.TotalRows
}

func (m *MockConnector) GetBatchCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.Batches)
}
