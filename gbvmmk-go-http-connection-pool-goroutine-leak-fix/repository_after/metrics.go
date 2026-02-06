package pool

import (
	"sync"
)

type Stats struct {
	mu          sync.RWMutex
	TotalConns  int64
	ActiveConns int64
	IdleConns   int64
	FailedConns int64
}

func (s *Stats) GetTotal() int64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.TotalConns
}

func (s *Stats) GetActive() int64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.ActiveConns
}

func (s *Stats) GetIdle() int64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.IdleConns
}

func (s *Stats) GetFailed() int64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.FailedConns
}

func (s *Stats) IncrementFailed() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.FailedConns++
}

func (s *Stats) NewConnection() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.TotalConns++
	s.ActiveConns++
}

func (s *Stats) ReuseIdle() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.IdleConns--
	s.ActiveConns++
}

func (s *Stats) ReleaseHealthy() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ActiveConns--
	s.IdleConns++
}

func (s *Stats) ReleaseUnhealthy() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ActiveConns--
	s.TotalConns--
}

func (s *Stats) EvictIdle() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.IdleConns--
	s.TotalConns--
}
