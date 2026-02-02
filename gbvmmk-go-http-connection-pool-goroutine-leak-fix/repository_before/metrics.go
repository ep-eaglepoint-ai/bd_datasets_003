package pool

import "sync/atomic"

type Stats struct {
	TotalConns  int64
	ActiveConns int64
	IdleConns   int64
	FailedConns int64
}

func (s *Stats) GetTotal() int64 {
	return atomic.LoadInt64(&s.TotalConns)
}

func (s *Stats) GetActive() int64 {
	return atomic.LoadInt64(&s.ActiveConns)
}

func (s *Stats) GetIdle() int64 {
	return atomic.LoadInt64(&s.IdleConns)
}

func (s *Stats) GetFailed() int64 {
	return atomic.LoadInt64(&s.FailedConns)
}

func (s *Stats) IncrementTotal() {
	atomic.AddInt64(&s.TotalConns, 1)
}

func (s *Stats) IncrementActive() {
	atomic.AddInt64(&s.ActiveConns, 1)
}

func (s *Stats) DecrementActive() {
	atomic.AddInt64(&s.ActiveConns, -1)
}

func (s *Stats) IncrementIdle() {
	atomic.AddInt64(&s.IdleConns, 1)
}

func (s *Stats) DecrementIdle() {
	atomic.AddInt64(&s.IdleConns, -1)
}

func (s *Stats) IncrementFailed() {
	atomic.AddInt64(&s.FailedConns, 1)
}
