package aggregator

import (
	"log/slog"
	"sync"
	"time"
)

// StatusBucket groups HTTP status codes into standard classes.
type StatusBucket int

const (
	Status2xx StatusBucket = iota
	Status3xx
	Status4xx
	Status5xx
	statusBucketCount // sentinel – always last
)

func BucketFromCode(code int) StatusBucket {
	switch {
	case code >= 200 && code < 300:
		return Status2xx
	case code >= 300 && code < 400:
		return Status3xx
	case code >= 400 && code < 500:
		return Status4xx
	case code >= 500 && code < 600:
		return Status5xx
	default:
		return Status5xx // treat unknown as server error
	}
}

// BucketLabel returns a human-readable label for the bucket.
func (b StatusBucket) Label() string {
	switch b {
	case Status2xx:
		return "2xx"
	case Status3xx:
		return "3xx"
	case Status4xx:
		return "4xx"
	case Status5xx:
		return "5xx"
	default:
		return "unknown"
	}
}

// -------------------------------------------------------------------
// minuteCounter – fixed-size counter for a single 1-minute bucket
// -------------------------------------------------------------------

// minuteCounter stores aggregate counters for one calendar minute.
type minuteCounter struct {
	statusCounts [statusBucketCount]int64 // 2xx, 3xx, 4xx, 5xx
	totalReqs    int64
	totalBytes   int64
}

func (mc *minuteCounter) record(statusCode int, bytes int64) {
	b := BucketFromCode(statusCode)
	mc.statusCounts[b]++
	mc.totalReqs++
	mc.totalBytes += bytes
}

// -------------------------------------------------------------------
// customerWindow – circular buffer of 1-minute counters per customer
// -------------------------------------------------------------------

const (
	WindowMinutes = 15                // queryable window size
	BucketCount   = WindowMinutes + 1 // +1 to avoid aliasing at boundary
)

// customerWindow is a ring of minute counters for a single customer_id.
// It never allocates per-request; the ring has a fixed upper size of
// BucketCount entries regardless of traffic volume.
type customerWindow struct {
	buckets  [BucketCount]minuteCounter
	startMin int64 // minute-epoch of buckets[0]
}

// minuteEpoch converts a time to a minute-granularity epoch.
func minuteEpoch(t time.Time) int64 {
	return t.Unix() / 60
}

// advance slides the window forward so that nowMin falls inside it,
// zeroing any newly created buckets.
func (cw *customerWindow) advance(nowMin int64) {
	if cw.startMin == 0 {
		// first touch – initialise
		cw.startMin = nowMin - BucketCount + 1
	}

	endMin := cw.startMin + BucketCount - 1
	if nowMin <= endMin {
		return // still inside the ring
	}

	// Number of slots we need to clear
	shift := int(nowMin - endMin)
	if shift >= BucketCount {
		// Entire ring is stale – reset everything
		cw.buckets = [BucketCount]minuteCounter{}
		cw.startMin = nowMin - BucketCount + 1
		return
	}

	// Zero only the buckets we're overwriting
	for i := 0; i < shift; i++ {
		idx := int((endMin+1+int64(i))-cw.startMin) % BucketCount
		cw.buckets[idx] = minuteCounter{}
	}
	cw.startMin += int64(shift)
}

// record adds a request into the correct minute bucket.
func (cw *customerWindow) record(t time.Time, statusCode int, bytes int64) {
	m := minuteEpoch(t)
	cw.advance(m)

	idx := int(m-cw.startMin) % BucketCount
	if idx < 0 {
		return // event older than the window – drop silently
	}
	cw.buckets[idx].record(statusCode, bytes)
}

// query returns aggregated counters for the most recent `minutes` minutes
// from `now`. minutes must be ≤ WindowMinutes.
func (cw *customerWindow) query(now time.Time, minutes int) QueryResult {
	nowMin := minuteEpoch(now)
	cw.advance(nowMin) // ensure ring is current

	var res QueryResult
	for i := 0; i < minutes; i++ {
		m := nowMin - int64(i)
		if m < cw.startMin {
			break
		}
		idx := int(m-cw.startMin) % BucketCount
		mc := &cw.buckets[idx]
		for b := 0; b < int(statusBucketCount); b++ {
			res.StatusCounts[b] += mc.statusCounts[b]
		}
		res.TotalRequests += mc.totalReqs
		res.TotalBytes += mc.totalBytes
	}

	if minutes > 0 {
		res.RequestsPerSecond = float64(res.TotalRequests) / float64(minutes*60)
	}
	res.WindowMinutes = minutes
	return res
}

// -------------------------------------------------------------------
// QueryResult – returned to callers
// -------------------------------------------------------------------

// QueryResult is the public read-out from a window query.
type QueryResult struct {
	StatusCounts      [statusBucketCount]int64 `json:"-"`
	Status2xx         int64                    `json:"status_2xx"`
	Status3xx         int64                    `json:"status_3xx"`
	Status4xx         int64                    `json:"status_4xx"`
	Status5xx         int64                    `json:"status_5xx"`
	TotalRequests     int64                    `json:"total_requests"`
	TotalBytes        int64                    `json:"total_bytes"`
	RequestsPerSecond float64                  `json:"requests_per_second"`
	WindowMinutes     int                      `json:"window_minutes"`
}

// Finalize populates the exported fields from the internal array.
func (r *QueryResult) Finalize() {
	r.Status2xx = r.StatusCounts[Status2xx]
	r.Status3xx = r.StatusCounts[Status3xx]
	r.Status4xx = r.StatusCounts[Status4xx]
	r.Status5xx = r.StatusCounts[Status5xx]
}

// -------------------------------------------------------------------
// SlidingWindowAggregator – the top-level, thread-safe aggregator
// -------------------------------------------------------------------

// SlidingWindowAggregator maintains per-customer sliding windows.
// The memory footprint is O(customers × BucketCount), not O(requests).
type SlidingWindowAggregator struct {
	mu      sync.RWMutex
	windows map[string]*customerWindow // keyed by customer_id
	logger  *slog.Logger

	// Eviction
	lastEvict time.Time
	evictTTL  time.Duration // evict idle customers after this duration
}

// NewSlidingWindowAggregator creates a new aggregator.
func NewSlidingWindowAggregator(logger *slog.Logger) *SlidingWindowAggregator {
	return &SlidingWindowAggregator{
		windows:   make(map[string]*customerWindow),
		logger:    logger,
		evictTTL:  30 * time.Minute, // evict customers idle for 30 min
		lastEvict: time.Now(),
	}
}

// Record adds a single request observation. Thread-safe.
func (a *SlidingWindowAggregator) Record(customerID string, t time.Time, statusCode int, bytes int64) {
	a.mu.Lock()
	defer a.mu.Unlock()

	cw, ok := a.windows[customerID]
	if !ok {
		cw = &customerWindow{}
		a.windows[customerID] = cw
	}
	cw.record(t, statusCode, bytes)

	// Periodic eviction of stale customers (cheap amortised cost)
	if time.Since(a.lastEvict) > 5*time.Minute {
		a.evictStaleLocked(t)
	}
}

// Query returns the aggregate for `customerID` over the last `minutes` min.
// If minutes > WindowMinutes it is clamped.
func (a *SlidingWindowAggregator) Query(customerID string, minutes int) QueryResult {
	if minutes > WindowMinutes {
		minutes = WindowMinutes
	}
	if minutes <= 0 {
		minutes = WindowMinutes
	}

	a.mu.RLock()
	defer a.mu.RUnlock()

	cw, ok := a.windows[customerID]
	if !ok {
		return QueryResult{WindowMinutes: minutes}
	}

	res := cw.query(time.Now(), minutes)
	res.Finalize()
	return res
}

// QueryAll returns aggregates for every known customer.
func (a *SlidingWindowAggregator) QueryAll(minutes int) map[string]QueryResult {
	if minutes > WindowMinutes {
		minutes = WindowMinutes
	}
	if minutes <= 0 {
		minutes = WindowMinutes
	}

	a.mu.RLock()
	defer a.mu.RUnlock()

	now := time.Now()
	results := make(map[string]QueryResult, len(a.windows))
	for id, cw := range a.windows {
		r := cw.query(now, minutes)
		r.Finalize()
		results[id] = r
	}
	return results
}

// CustomerCount returns the number of tracked customers.
func (a *SlidingWindowAggregator) CustomerCount() int {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return len(a.windows)
}

// evictStaleLocked removes customers whose entire ring is zeroed.
// Must be called with a.mu held for writing.
func (a *SlidingWindowAggregator) evictStaleLocked(now time.Time) {
	a.lastEvict = now
	nowMin := minuteEpoch(now)
	cutoff := nowMin - WindowMinutes - 1

	evicted := 0
	for id, cw := range a.windows {
		latest := cw.startMin + BucketCount - 1
		if latest < cutoff {
			delete(a.windows, id)
			evicted++
		}
	}

	if evicted > 0 {
		a.logger.Debug("Evicted stale customer windows",
			"evicted", evicted,
			"remaining", len(a.windows),
		)
	}
}

// GetMetrics returns aggregator-level metrics.
func (a *SlidingWindowAggregator) GetMetrics() map[string]interface{} {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return map[string]interface{}{
		"tracked_customers":  len(a.windows),
		"window_minutes":     WindowMinutes,
		"bucket_count":       BucketCount,
		"bytes_per_customer": BucketCount * 48, // approx struct size
	}
}
