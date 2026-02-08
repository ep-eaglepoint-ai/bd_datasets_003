package batch_insertion_test

import (
	"context"
	"log/slog"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/clickhouse"
	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/types"
)

func logger() *slog.Logger {
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelError}))
}

func TestFlushOnBatchSizeFull(t *testing.T) {
	mock := clickhouse.NewMockConnector()
	cfg := clickhouse.DefaultBatchConfig()
	cfg.BatchSize = 10
	cfg.FlushInterval = 10 * time.Minute // disable timer flush

	bi := clickhouse.NewBatchInserter(cfg, mock, logger())

	for i := 0; i < 10; i++ {
		row := clickhouse.LogRow{
			EventID:    "evt-" + string(rune('a'+i)),
			CustomerID: "tenant-001",
			Timestamp:  time.Now(),
			StatusCode: 200,
			BytesSent:  1024,
			IP:         "8.8.8.8",
		}
		if err := bi.Append(row); err != nil {
			t.Fatalf("Append failed: %v", err)
		}
	}

	time.Sleep(200 * time.Millisecond)

	if mock.GetTotalRows() != 10 {
		t.Errorf("Expected 10 rows flushed, got %d", mock.GetTotalRows())
	}
	if mock.GetBatchCount() != 1 {
		t.Errorf("Expected 1 batch, got %d", mock.GetBatchCount())
	}

	bi.Shutdown(5 * time.Second)
}

func TestFlushOnTimerInterval(t *testing.T) {
	mock := clickhouse.NewMockConnector()
	cfg := clickhouse.DefaultBatchConfig()
	cfg.BatchSize = 1000 // won't fill up
	cfg.FlushInterval = 200 * time.Millisecond

	bi := clickhouse.NewBatchInserter(cfg, mock, logger())

	// Append fewer rows than BatchSize
	for i := 0; i < 5; i++ {
		bi.Append(clickhouse.LogRow{
			EventID:    "evt",
			CustomerID: "tenant-001",
			Timestamp:  time.Now(),
			StatusCode: 200,
			BytesSent:  512,
			IP:         "1.1.1.1",
		})
	}

	time.Sleep(500 * time.Millisecond)

	if mock.GetTotalRows() != 5 {
		t.Errorf("Expected 5 rows after timer flush, got %d", mock.GetTotalRows())
	}

	bi.Shutdown(5 * time.Second)
}

func TestShutdownDrainsRemainingRows(t *testing.T) {
	mock := clickhouse.NewMockConnector()
	cfg := clickhouse.DefaultBatchConfig()
	cfg.BatchSize = 1000
	cfg.FlushInterval = 1 * time.Hour // won't fire

	bi := clickhouse.NewBatchInserter(cfg, mock, logger())

	for i := 0; i < 7; i++ {
		bi.Append(clickhouse.LogRow{
			EventID:    "evt",
			CustomerID: "tenant-001",
			Timestamp:  time.Now(),
			StatusCode: 200,
			BytesSent:  100,
			IP:         "1.1.1.1",
		})
	}

	err := bi.Shutdown(5 * time.Second)
	if err != nil {
		t.Fatalf("Shutdown failed: %v", err)
	}

	if mock.GetTotalRows() != 7 {
		t.Errorf("Expected 7 rows drained on shutdown, got %d", mock.GetTotalRows())
	}
}

func TestAppendReturnsErrorWhenBufferFull(t *testing.T) {
	mock := clickhouse.NewMockConnector()
	mock.WriteLatency = 5 * time.Second

	cfg := clickhouse.DefaultBatchConfig()
	cfg.BatchSize = 2
	cfg.FlushInterval = 100 * time.Millisecond

	bi := clickhouse.NewBatchInserter(cfg, mock, logger())

	var errCount int
	for i := 0; i < 50; i++ {
		err := bi.Append(clickhouse.LogRow{
			EventID:    "evt",
			CustomerID: "tenant-001",
			Timestamp:  time.Now(),
			StatusCode: 200,
			BytesSent:  100,
			IP:         "1.1.1.1",
		})
		if err != nil {
			errCount++
		}
	}

	if errCount == 0 {
		t.Error("Expected some ErrBatchBufferFull errors")
	}
	t.Logf("Got %d buffer-full errors out of 50 appends", errCount)

	bi.Shutdown(1 * time.Second)
}

func TestRetryOnWriteError(t *testing.T) {
	mock := clickhouse.NewMockConnector()
	mock.ShouldError = true // force errors

	cfg := clickhouse.DefaultBatchConfig()
	cfg.BatchSize = 5
	cfg.FlushInterval = 100 * time.Millisecond
	cfg.MaxRetries = 2
	cfg.RetryBackoff = 10 * time.Millisecond // speed up test

	bi := clickhouse.NewBatchInserter(cfg, mock, logger())

	for i := 0; i < 5; i++ {
		bi.Append(clickhouse.LogRow{
			EventID:    "evt",
			CustomerID: "tenant-001",
			Timestamp:  time.Now(),
			StatusCode: 200,
			BytesSent:  100,
			IP:         "1.1.1.1",
		})
	}

	time.Sleep(500 * time.Millisecond)

	metrics := bi.GetMetrics()
	flushErrors := metrics["flush_errors"].(int64)
	if flushErrors == 0 {
		t.Error("Expected flush errors to be recorded")
	}
	t.Logf("Flush errors: %d", flushErrors)

	bi.Shutdown(1 * time.Second)
}

func TestLogRowFromEntry(t *testing.T) {
	entry := &types.LogEntry{
		Timestamp:  1700000000,
		CustomerID: "tenant-001",
		StatusCode: 404,
		BytesSent:  2048,
		IP:         "203.0.113.50",
	}

	row := clickhouse.LogRowFromEntry(entry, "evt-123")

	if row.EventID != "evt-123" {
		t.Errorf("EventID: got %s, want evt-123", row.EventID)
	}
	if row.CustomerID != "tenant-001" {
		t.Errorf("CustomerID: got %s, want tenant-001", row.CustomerID)
	}
	if row.StatusCode != 404 {
		t.Errorf("StatusCode: got %d, want 404", row.StatusCode)
	}
	if row.BytesSent != 2048 {
		t.Errorf("BytesSent: got %d, want 2048", row.BytesSent)
	}
	if row.StatusClass != "4xx" {
		t.Errorf("StatusClass: got %s, want 4xx", row.StatusClass)
	}
	if row.Timestamp.UTC().Unix() != 1700000000 {
		t.Errorf("Timestamp: got %v, want 1700000000", row.Timestamp.Unix())
	}
}

func TestConcurrentAppends(t *testing.T) {
	mock := clickhouse.NewMockConnector()
	cfg := clickhouse.DefaultBatchConfig()
	cfg.BatchSize = 100
	cfg.FlushInterval = 100 * time.Millisecond

	bi := clickhouse.NewBatchInserter(cfg, mock, logger())

	const (
		numGoroutines = 10
		numAppends    = 100
	)

	var wg sync.WaitGroup
	var successCount int64
	for g := 0; g < numGoroutines; g++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for i := 0; i < numAppends; i++ {
				err := bi.Append(clickhouse.LogRow{
					EventID:    "evt",
					CustomerID: "tenant-001",
					Timestamp:  time.Now(),
					StatusCode: 200,
					BytesSent:  100,
					IP:         "1.1.1.1",
				})
				if err == nil {
					atomic.AddInt64(&successCount, 1)
				}
			}
		}(g)
	}

	wg.Wait()

	bi.Shutdown(5 * time.Second)

	flushed := mock.GetTotalRows()
	if flushed != atomic.LoadInt64(&successCount) {
		t.Errorf("Expected %d flushed rows (= successful appends), got %d",
			atomic.LoadInt64(&successCount), flushed)
	}
	t.Logf("Concurrent: %d/%d appends succeeded, all flushed",
		atomic.LoadInt64(&successCount), numGoroutines*numAppends)
}

func TestBatchInserterMetrics(t *testing.T) {
	mock := clickhouse.NewMockConnector()
	cfg := clickhouse.DefaultBatchConfig()
	bi := clickhouse.NewBatchInserter(cfg, mock, logger())
	defer bi.Shutdown(5 * time.Second)

	m := bi.GetMetrics()

	required := []string{
		"rows_appended",
		"rows_flushed",
		"flush_count",
		"flush_errors",
		"pending_rows",
		"channel_cap",
		"last_flush_at",
		"batch_size",
		"flush_interval",
	}

	for _, k := range required {
		if _, ok := m[k]; !ok {
			t.Errorf("Missing metric key: %s", k)
		}
	}
}

func TestHealthCheck(t *testing.T) {
	mock := clickhouse.NewMockConnector()
	cfg := clickhouse.DefaultBatchConfig()
	bi := clickhouse.NewBatchInserter(cfg, mock, logger())
	defer bi.Shutdown(5 * time.Second)

	if !bi.IsHealthy(context.TODO()) {
		t.Error("Expected healthy inserter")
	}

	mock.PingHealthy = false
	if bi.IsHealthy(context.TODO()) {
		t.Error("Expected unhealthy inserter")
	}
}

func TestDefaultBatchConfig(t *testing.T) {
	cfg := clickhouse.DefaultBatchConfig()

	if cfg.BatchSize != 5000 {
		t.Errorf("BatchSize: got %d, want 5000", cfg.BatchSize)
	}
	if cfg.FlushInterval != 10*time.Second {
		t.Errorf("FlushInterval: got %v, want 10s", cfg.FlushInterval)
	}
	if cfg.MaxOpenConns != 3 {
		t.Errorf("MaxOpenConns: got %d, want 3", cfg.MaxOpenConns)
	}
	if cfg.MaxIdleConns != 2 {
		t.Errorf("MaxIdleConns: got %d, want 2", cfg.MaxIdleConns)
	}
	if cfg.ConnMaxLifetime != 30*time.Minute {
		t.Errorf("ConnMaxLifetime: got %v, want 30m", cfg.ConnMaxLifetime)
	}
	if cfg.MaxRetries != 3 {
		t.Errorf("MaxRetries: got %d, want 3", cfg.MaxRetries)
	}
}

func BenchmarkAppend(b *testing.B) {
	mock := clickhouse.NewMockConnector()
	cfg := clickhouse.DefaultBatchConfig()
	cfg.BatchSize = 5000
	cfg.FlushInterval = 1 * time.Second

	bi := clickhouse.NewBatchInserter(cfg, mock, logger())
	defer bi.Shutdown(5 * time.Second)

	row := clickhouse.LogRow{
		EventID:    "bench-evt",
		CustomerID: "tenant-001",
		Timestamp:  time.Now(),
		StatusCode: 200,
		BytesSent:  1024,
		IP:         "8.8.8.8",
	}

	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			bi.Append(row)
		}
	})
}
