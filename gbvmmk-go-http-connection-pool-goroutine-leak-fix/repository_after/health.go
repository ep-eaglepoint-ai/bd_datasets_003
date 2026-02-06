package pool

import (
	"context"
	"net/http"
	"sync"
	"time"
)

type HealthChecker struct {
	pool     *Pool
	interval time.Duration
	stopCh   chan struct{}
	once     sync.Once
}

func NewHealthChecker(pool *Pool, interval time.Duration) *HealthChecker {
	return &HealthChecker{
		pool:     pool,
		interval: interval,
		stopCh:   make(chan struct{}),
	}
}

func (h *HealthChecker) Start() {
	h.pool.wg.Add(1)
	go func() {
		defer h.pool.wg.Done()
		ticker := time.NewTicker(h.interval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				h.CheckAllConnections()
			case <-h.stopCh:
				return
			case <-h.pool.ctx.Done():
				return
			}
		}
	}()
}

func (h *HealthChecker) Stop() {
	h.once.Do(func() {
		close(h.stopCh)
	})
}

func (h *HealthChecker) CheckAllConnections() {
	h.pool.mu.Lock()
	var allConns []*Conn
	for _, conns := range h.pool.connections {
		allConns = append(allConns, conns...)
	}
	h.pool.mu.Unlock()

	if len(allConns) == 0 {
		return
	}

	jobs := make(chan *Conn, len(allConns))
	for _, conn := range allConns {
		jobs <- conn
	}
	close(jobs)

	numWorkers := 10
	if len(allConns) < numWorkers {
		numWorkers = len(allConns)
	}

	var wg sync.WaitGroup
	for i := 0; i < numWorkers; i++ {
		wg.Add(1)
		h.pool.wg.Add(1)
		go func() {
			defer wg.Done()
			defer h.pool.wg.Done()
			for conn := range jobs {
				h.CheckConnection(conn)
			}
		}()
	}

	// Use a separate goroutine to wait for checks and then purge,
	// so CheckAllConnections doesn't block the ticker loop for too long,
	// BUT wait, CheckAllConnections is called by the ticker. 
	// If it's slow, tickers might stack up.
	// We should wait here or ensure only one CheckAllConnections runs at a time.
	// Ticker doesn't stack if the block takes longer than interval.
	wg.Wait()
	h.pool.PurgeUnhealthy()
}

func (h *HealthChecker) CheckConnection(conn *Conn) {
	ctx, cancel := context.WithTimeout(h.pool.ctx, h.pool.config.ConnectTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "HEAD", "http://"+conn.host+"/health", nil)
	if err != nil {
		conn.healthy = false
		return
	}

	resp, err := conn.client.Do(req)
	if err != nil {
		conn.healthy = false
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 500 {
		conn.healthy = false
	} else {
		conn.healthy = true
	}
}
