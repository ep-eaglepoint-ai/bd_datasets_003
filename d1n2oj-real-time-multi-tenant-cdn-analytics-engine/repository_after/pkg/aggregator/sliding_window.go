package aggregator

import (
	"log/slog"
	"sync"
	"time"
)


type StatusBucket int

const (
	Status2xx StatusBucket = iota
	Status3xx
	Status4xx
	Status5xx
	statusBucketCount 
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
		return Status5xx 
	}
}


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


const (
	WindowMinutes = 15                
	BucketCount   = WindowMinutes + 1 
)

type customerWindow struct {
	buckets  [BucketCount]minuteCounter
	startMin int64 
}


func minuteEpoch(t time.Time) int64 {
	return t.Unix() / 60
}

func (cw *customerWindow) advance(nowMin int64) {
	if cw.startMin == 0 {
		cw.startMin = nowMin - BucketCount + 1
	}

	endMin := cw.startMin + BucketCount - 1
	if nowMin <= endMin {
		return 	
	}

		
	shift := int(nowMin - endMin)
	if shift >= BucketCount {
			
		cw.buckets = [BucketCount]minuteCounter{}
		cw.startMin = nowMin - BucketCount + 1
		return
	}

		
	for i := 0; i < shift; i++ {
		idx := int((endMin+1+int64(i))-cw.startMin) % BucketCount
		cw.buckets[idx] = minuteCounter{}
	}
	cw.startMin += int64(shift)
}


func (cw *customerWindow) record(t time.Time, statusCode int, bytes int64) {
	m := minuteEpoch(t)
	cw.advance(m)

	idx := int(m-cw.startMin) % BucketCount
	if idx < 0 {
		return 
	}
	cw.buckets[idx].record(statusCode, bytes)
}

func (cw *customerWindow) query(now time.Time, minutes int) QueryResult {
	nowMin := minuteEpoch(now)
	cw.advance(nowMin) 

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

func (r *QueryResult) Finalize() {
	r.Status2xx = r.StatusCounts[Status2xx]
	r.Status3xx = r.StatusCounts[Status3xx]
	r.Status4xx = r.StatusCounts[Status4xx]
	r.Status5xx = r.StatusCounts[Status5xx]
}


type SlidingWindowAggregator struct {
	mu      sync.RWMutex
	windows map[string]*customerWindow 
	logger  *slog.Logger

		
	lastEvict time.Time
	evictTTL  time.Duration 
}


func NewSlidingWindowAggregator(logger *slog.Logger) *SlidingWindowAggregator {
	return &SlidingWindowAggregator{
		windows:   make(map[string]*customerWindow),
		logger:    logger,
		evictTTL:  30 * time.Minute, 
		lastEvict: time.Now(),
	}
}


func (a *SlidingWindowAggregator) Record(customerID string, t time.Time, statusCode int, bytes int64) {
	a.mu.Lock()
	defer a.mu.Unlock()

	cw, ok := a.windows[customerID]
	if !ok {
		cw = &customerWindow{}
		a.windows[customerID] = cw
	}
	cw.record(t, statusCode, bytes)

	if time.Since(a.lastEvict) > 5*time.Minute {
		a.evictStaleLocked(t)
	}
}


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

func (a *SlidingWindowAggregator) CustomerCount() int {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return len(a.windows)
}


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


func (a *SlidingWindowAggregator) GetMetrics() map[string]interface{} {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return map[string]interface{}{
		"tracked_customers":  len(a.windows),
		"window_minutes":     WindowMinutes,
		"bucket_count":       BucketCount,
		"bytes_per_customer": BucketCount * 48,
	}
}
