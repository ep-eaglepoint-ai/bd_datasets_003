package metrics

import (
	"sync/atomic"
)

type Collector struct {
	totalDeliveries int64
	successCount    int64
	failureCount    int64
	deadLetterCount int64
}

func New() *Collector {
	return &Collector{}
}

func (c *Collector) RecordDelivery() {
	atomic.AddInt64(&c.totalDeliveries, 1)
}

func (c *Collector) RecordSuccess() {
	atomic.AddInt64(&c.successCount, 1)
}

func (c *Collector) RecordFailure() {
	atomic.AddInt64(&c.failureCount, 1)
}

func (c *Collector) RecordDeadLetter() {
	atomic.AddInt64(&c.deadLetterCount, 1)
}

func (c *Collector) GetTotalDeliveries() int64 {
	return atomic.LoadInt64(&c.totalDeliveries)
}

func (c *Collector) GetSuccessCount() int64 {
	return atomic.LoadInt64(&c.successCount)
}

func (c *Collector) GetFailureCount() int64 {
	return atomic.LoadInt64(&c.failureCount)
}

func (c *Collector) GetDeadLetterCount() int64 {
	return atomic.LoadInt64(&c.deadLetterCount)
}

func (c *Collector) GetSuccessRate() float64 {
	total := c.GetSuccessCount() + c.GetFailureCount()
	if total == 0 {
		return 0
	}
	return float64(c.GetSuccessCount()) / float64(total) * 100
}

type Stats struct {
	TotalDeliveries int64   `json:"total_deliveries"`
	SuccessCount    int64   `json:"success_count"`
	FailureCount    int64   `json:"failure_count"`
	DeadLetterCount int64   `json:"dead_letter_count"`
	SuccessRate     float64 `json:"success_rate_percent"`
}

func (c *Collector) GetStats() Stats {
	return Stats{
		TotalDeliveries: c.GetTotalDeliveries(),
		SuccessCount:    c.GetSuccessCount(),
		FailureCount:    c.GetFailureCount(),
		DeadLetterCount: c.GetDeadLetterCount(),
		SuccessRate:     c.GetSuccessRate(),
	}
}

func (c *Collector) Reset() {
	atomic.StoreInt64(&c.totalDeliveries, 0)
	atomic.StoreInt64(&c.successCount, 0)
	atomic.StoreInt64(&c.failureCount, 0)
	atomic.StoreInt64(&c.deadLetterCount, 0)
}
