package windowagg

import (
	"container/heap"
	"sync"
	"time"
)

type Event struct {
	Timestamp int64   // Unix seconds (event time). If you use millis/nanos, adjust toUnixSeconds().
	Key       string
	Value     float64
}

type EmitFunc func(key string, windowStart int64, windowEnd int64, sum float64)

type WindowedAggregator struct {
	windowSizeSec       int64
	allowedLatenessSec  int64
	mu                  sync.RWMutex
	state               map[string]map[int64]float64      // map[key]map[windowStart]sum
	windowKeys           map[int64]map[string]struct{}    // windowStart -> keys present
	maxObservedTs        int64
	watermark            int64 // monotonically increasing
	winMeta              map[int64]int64                  // windowStart -> windowEnd
	winHeap              windowHeap                       // min-heap by windowEnd
	emit                 EmitFunc
}

func NewWindowedAggregator(windowSize, allowedLateness time.Duration, emit EmitFunc) *WindowedAggregator {
	ws := int64(windowSize.Seconds())
	if ws <= 0 {
		panic("windowSize must be >= 1s")
	}
	al := int64(allowedLateness.Seconds())
	if al < 0 {
		al = 0
	}
	if emit == nil {
		emit = func(string, int64, int64, float64) {}
	}

	wa := &WindowedAggregator{
		windowSizeSec:      ws,
		allowedLatenessSec: al,
		state:              make(map[string]map[int64]float64),
		windowKeys:         make(map[int64]map[string]struct{}),
		winMeta:            make(map[int64]int64),
		emit:               emit,
	}
	heap.Init(&wa.winHeap)
	return wa
}

// Ingest consumes an event and may emit closed-window results.
// Returns late=true if the event was dropped because its window was already closed.
func (wa *WindowedAggregator) Ingest(ev Event) (late bool) {
	ts := toUnixSeconds(ev.Timestamp)

	var toEmit []emitRecord

	wa.mu.Lock()

	// (2) track max observed event time
	if ts > wa.maxObservedTs {
		wa.maxObservedTs = ts
	}

	// (2,10) compute candidate watermark and advance monotonically
	candWm := wa.maxObservedTs - wa.allowedLatenessSec
	if candWm > wa.watermark {
		wa.watermark = candWm
	}
	wm := wa.watermark

	// (1) window assignment is by event time
	wStart := (ts / wa.windowSizeSec) * wa.windowSizeSec
	wEnd := wStart + wa.windowSizeSec

	// (3,7) drop event if window already closed: closed iff watermark > windowEnd
	if wm > wEnd {
		wa.mu.Unlock()
		return true
	}

	// (4,8) nested map per key
	inner, ok := wa.state[ev.Key]
	if !ok {
		inner = make(map[int64]float64, 4)
		wa.state[ev.Key] = inner
	}
	inner[wStart] += ev.Value

	// index keys present in this window
	ks, ok := wa.windowKeys[wStart]
	if !ok {
		ks = make(map[string]struct{}, 4)
		wa.windowKeys[wStart] = ks
	}
	ks[ev.Key] = struct{}{}

	// register window once
	if _, exists := wa.winMeta[wStart]; !exists {
		wa.winMeta[wStart] = wEnd
		heap.Push(&wa.winHeap, windowItem{windowEnd: wEnd, windowStart: wStart})
	}

	// (9,5) close windows when watermark passes end, emit and delete state immediately
	for wa.winHeap.Len() > 0 {
		min := wa.winHeap[0]
		if wm <= min.windowEnd { // strict rule: close only when wm > end
			break
		}
		heap.Pop(&wa.winHeap)

		end, exists := wa.winMeta[min.windowStart]
		if !exists || end != min.windowEnd {
			continue
		}

		ws := min.windowStart
		we := min.windowEnd

		keysSet := wa.windowKeys[ws]
		for k := range keysSet {
			if perKey, ok := wa.state[k]; ok {
				if sum, ok2 := perKey[ws]; ok2 {
					toEmit = append(toEmit, emitRecord{
						key:         k,
						windowStart: ws,
						windowEnd:   we,
						sum:         sum,
					})

					// (5) reclaim per-window memory immediately
					delete(perKey, ws)
					if len(perKey) == 0 {
						delete(wa.state, k)
					}
				}
			}
		}

		// reclaim window-level index/meta
		delete(wa.windowKeys, ws)
		delete(wa.winMeta, ws)
	}

	wa.mu.Unlock()

	// emit outside lock so ingestion isn't blocked by downstream
	for _, r := range toEmit {
		wa.emit(r.key, r.windowStart, r.windowEnd, r.sum)
	}

	return false
}

func (wa *WindowedAggregator) Watermark() int64 {
	wa.mu.RLock()
	defer wa.mu.RUnlock()
	return wa.watermark
}

// --- test helpers (kept small & read-only) ---

// StateSize returns counts to validate memory reclamation in tests.
func (wa *WindowedAggregator) StateSize() (keys int, buckets int) {
	wa.mu.RLock()
	defer wa.mu.RUnlock()
	keys = len(wa.state)
	for _, perKey := range wa.state {
		buckets += len(perKey)
	}
	return keys, buckets
}

func toUnixSeconds(ts int64) int64 { return ts }

type emitRecord struct {
	key         string
	windowStart int64
	windowEnd   int64
	sum         float64
}

// --- heap ---

type windowItem struct {
	windowEnd   int64
	windowStart int64
}

type windowHeap []windowItem

func (h windowHeap) Len() int           { return len(h) }
func (h windowHeap) Less(i, j int) bool { return h[i].windowEnd < h[j].windowEnd }
func (h windowHeap) Swap(i, j int)      { h[i], h[j] = h[j], h[i] }
func (h *windowHeap) Push(x any)        { *h = append(*h, x.(windowItem)) }
func (h *windowHeap) Pop() any {
	old := *h
	n := len(old)
	x := old[n-1]
	*h = old[:n-1]
	return x
}
