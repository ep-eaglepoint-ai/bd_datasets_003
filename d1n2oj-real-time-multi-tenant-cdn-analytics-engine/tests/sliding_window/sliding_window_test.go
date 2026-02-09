package sliding_window_test

import (
	"fmt"
	"log/slog"
	"math"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/aggregator"
)

func logger() *slog.Logger {
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelError}))
}


func TestRecordAndQuerySingleCustomer(t *testing.T) {
	agg := aggregator.NewSlidingWindowAggregator(logger())
	now := time.Now()

	
	agg.Record("tenant-001", now, 200, 500)
	agg.Record("tenant-001", now, 201, 300)
	agg.Record("tenant-001", now, 301, 100)
	agg.Record("tenant-001", now, 404, 200)
	agg.Record("tenant-001", now, 500, 150)
	agg.Record("tenant-001", now, 503, 250)

	res := agg.Query("tenant-001", 1) 

	if res.Status2xx != 2 {
		t.Errorf("Expected 2xx=2, got %d", res.Status2xx)
	}
	if res.Status3xx != 1 {
		t.Errorf("Expected 3xx=1, got %d", res.Status3xx)
	}
	if res.Status4xx != 1 {
		t.Errorf("Expected 4xx=1, got %d", res.Status4xx)
	}
	if res.Status5xx != 2 {
		t.Errorf("Expected 5xx=2, got %d", res.Status5xx)
	}
	if res.TotalRequests != 6 {
		t.Errorf("Expected total=6, got %d", res.TotalRequests)
	}
	if res.TotalBytes != 1500 {
		t.Errorf("Expected bytes=1500, got %d", res.TotalBytes)
	}
}

func TestQueryUnknownCustomerReturnsZero(t *testing.T) {
	agg := aggregator.NewSlidingWindowAggregator(logger())

	res := agg.Query("unknown", 15)
	if res.TotalRequests != 0 {
		t.Errorf("Expected 0 requests for unknown customer, got %d", res.TotalRequests)
	}
	if res.WindowMinutes != 15 {
		t.Errorf("Expected window=15, got %d", res.WindowMinutes)
	}
}

func TestWindowClampsToMaxMinutes(t *testing.T) {
	agg := aggregator.NewSlidingWindowAggregator(logger())
	agg.Record("tenant-001", time.Now(), 200, 100)

	// Request more than WindowMinutes – should clamp
	res := agg.Query("tenant-001", 9999)
	if res.WindowMinutes != aggregator.WindowMinutes {
		t.Errorf("Expected clamped window=%d, got %d",
			aggregator.WindowMinutes, res.WindowMinutes)
	}
}



func TestRequestsPerSecond(t *testing.T) {
	agg := aggregator.NewSlidingWindowAggregator(logger())
	now := time.Now()

	// 120 requests inside a 1-minute window → 2 req/s
	for i := 0; i < 120; i++ {
		agg.Record("tenant-001", now, 200, 10)
	}

	res := agg.Query("tenant-001", 1)

	// 120 reqs / 60 seconds = 2.0
	if math.Abs(res.RequestsPerSecond-2.0) > 0.01 {
		t.Errorf("Expected ~2.0 req/s, got %.4f", res.RequestsPerSecond)
	}
}


func TestRecordsSpanMultipleMinutes(t *testing.T) {
	agg := aggregator.NewSlidingWindowAggregator(logger())
	now := time.Now()

	// Record in three different minutes
	agg.Record("tenant-001", now, 200, 10)
	agg.Record("tenant-001", now.Add(-1*time.Minute), 200, 10)
	agg.Record("tenant-001", now.Add(-2*time.Minute), 200, 10)

	// Query last 3 minutes – should see all three
	res := agg.Query("tenant-001", 3)
	if res.TotalRequests != 3 {
		t.Errorf("Expected 3 across 3 minutes, got %d", res.TotalRequests)
	}

	// Query last 1 minute – should see only the current one
	res1 := agg.Query("tenant-001", 1)
	if res1.TotalRequests != 1 {
		t.Errorf("Expected 1 in last minute, got %d", res1.TotalRequests)
	}
}


func TestOldEventsOutsideWindowDropped(t *testing.T) {
	agg := aggregator.NewSlidingWindowAggregator(logger())
	now := time.Now()

	// Record something 20 minutes ago (outside the 15-min window)
	agg.Record("tenant-001", now.Add(-20*time.Minute), 200, 100)
	// And one now
	agg.Record("tenant-001", now, 200, 200)

	res := agg.Query("tenant-001", 15)
	// The old record should have been overwritten during advance
	if res.TotalRequests != 1 {
		t.Errorf("Expected 1 (old event dropped), got %d", res.TotalRequests)
	}
	if res.TotalBytes != 200 {
		t.Errorf("Expected 200 bytes, got %d", res.TotalBytes)
	}
}

func TestMemoryDoesNotGrowWithRequests(t *testing.T) {
	agg := aggregator.NewSlidingWindowAggregator(logger())
	now := time.Now()

	// 100k requests from one customer → should still be 1 customer tracked
	for i := 0; i < 100_000; i++ {
		agg.Record("tenant-001", now, 200, 10)
	}

	if agg.CustomerCount() != 1 {
		t.Errorf("Expected 1 tracked customer, got %d", agg.CustomerCount())
	}

	res := agg.Query("tenant-001", 1)
	if res.TotalRequests != 100_000 {
		t.Errorf("Expected 100000, got %d", res.TotalRequests)
	}
}


func TestMultipleCustomersIsolated(t *testing.T) {
	agg := aggregator.NewSlidingWindowAggregator(logger())
	now := time.Now()

	agg.Record("tenant-001", now, 200, 100)
	agg.Record("tenant-001", now, 200, 100)
	agg.Record("tenant-002", now, 500, 50)

	r1 := agg.Query("tenant-001", 1)
	r2 := agg.Query("tenant-002", 1)

	if r1.TotalRequests != 2 {
		t.Errorf("tenant-001: expected 2, got %d", r1.TotalRequests)
	}
	if r2.TotalRequests != 1 {
		t.Errorf("tenant-002: expected 1, got %d", r2.TotalRequests)
	}
	if r2.Status5xx != 1 {
		t.Errorf("tenant-002: expected 5xx=1, got %d", r2.Status5xx)
	}
}


func TestQueryAll(t *testing.T) {
	agg := aggregator.NewSlidingWindowAggregator(logger())
	now := time.Now()

	for i := 0; i < 10; i++ {
		agg.Record(fmt.Sprintf("tenant-%03d", i), now, 200, 100)
	}

	all := agg.QueryAll(1)
	if len(all) != 10 {
		t.Errorf("Expected 10 customers, got %d", len(all))
	}
	for id, r := range all {
		if r.TotalRequests != 1 {
			t.Errorf("%s: expected 1 request, got %d", id, r.TotalRequests)
		}
	}
}


func TestConcurrentRecordAndQuery(t *testing.T) {
	agg := aggregator.NewSlidingWindowAggregator(logger())

	const (
		numWriters = 10
		numReaders = 5
		numOps     = 1000
	)

	var wg sync.WaitGroup

	// Writers
	for w := 0; w < numWriters; w++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			customer := fmt.Sprintf("tenant-%03d", id%5) // 5 customers
			for i := 0; i < numOps; i++ {
				agg.Record(customer, time.Now(), 200+(id%4)*100, 100)
			}
		}(w)
	}

	// Concurrent readers
	for r := 0; r < numReaders; r++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			customer := fmt.Sprintf("tenant-%03d", id%5)
			for i := 0; i < numOps; i++ {
				_ = agg.Query(customer, 15)
			}
		}(r)
	}

	wg.Wait()

	if agg.CustomerCount() != 5 {
		t.Errorf("Expected 5 customers, got %d", agg.CustomerCount())
	}
}


func TestAggregatorMetrics(t *testing.T) {
	agg := aggregator.NewSlidingWindowAggregator(logger())
	agg.Record("tenant-001", time.Now(), 200, 100)

	m := agg.GetMetrics()

	expectedKeys := []string{
		"tracked_customers",
		"window_minutes",
		"bucket_count",
		"bytes_per_customer",
	}

	for _, k := range expectedKeys {
		if _, ok := m[k]; !ok {
			t.Errorf("Missing metric key: %s", k)
		}
	}

	if m["tracked_customers"].(int) != 1 {
		t.Errorf("Expected 1 tracked customer, got %v", m["tracked_customers"])
	}
}

func TestStatusBucketClassification(t *testing.T) {
	tests := []struct {
		code   int
		bucket aggregator.StatusBucket
		label  string
	}{
		{200, aggregator.Status2xx, "2xx"},
		{201, aggregator.Status2xx, "2xx"},
		{299, aggregator.Status2xx, "2xx"},
		{301, aggregator.Status3xx, "3xx"},
		{404, aggregator.Status4xx, "4xx"},
		{500, aggregator.Status5xx, "5xx"},
		{503, aggregator.Status5xx, "5xx"},
		{599, aggregator.Status5xx, "5xx"},
		{100, aggregator.Status5xx, "5xx"}, // 1xx → treated as 5xx (unknown)
	}

	for _, tc := range tests {
		got := aggregator.BucketFromCode(tc.code)
		if got != tc.bucket {
			t.Errorf("BucketFromCode(%d) = %v, want %v", tc.code, got, tc.bucket)
		}
		if got.Label() != tc.label {
			t.Errorf("BucketFromCode(%d).Label() = %q, want %q", tc.code, got.Label(), tc.label)
		}
	}
}

func BenchmarkRecord(b *testing.B) {
	agg := aggregator.NewSlidingWindowAggregator(logger())
	now := time.Now()
	b.ResetTimer()

	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			agg.Record("tenant-001", now, 200, 1024)
		}
	})
}

func BenchmarkQuery(b *testing.B) {
	agg := aggregator.NewSlidingWindowAggregator(logger())
	now := time.Now()
	for i := 0; i < 10000; i++ {
		agg.Record("tenant-001", now, 200, 1024)
	}
	b.ResetTimer()

	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			_ = agg.Query("tenant-001", 15)
		}
	})
}
