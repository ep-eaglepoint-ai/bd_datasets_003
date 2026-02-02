package pool

import (
	"context"
	"net/http"
	"time"
)

type HealthChecker struct {
	pool     *Pool
	interval time.Duration
	stopCh   chan struct{}
}

func NewHealthChecker(pool *Pool, interval time.Duration) *HealthChecker {
	return &HealthChecker{
		pool:     pool,
		interval: interval,
		stopCh:   make(chan struct{}),
	}
}

func (h *HealthChecker) Start() {
	go func() {
		ticker := time.NewTicker(h.interval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				h.CheckAllConnections()
			case <-h.stopCh:
				return
			}
		}
	}()
}

func (h *HealthChecker) Stop() {
	close(h.stopCh)
}

func (h *HealthChecker) CheckAllConnections() {
	h.pool.mu.Lock()
	connections := make([]*Conn, 0)
	for _, conns := range h.pool.connections {
		connections = append(connections, conns...)
	}
	h.pool.mu.Unlock()

	for _, conn := range connections {
		go h.CheckConnection(conn)
	}
}

func (h *HealthChecker) CheckConnection(conn *Conn) {
	ctx, cancel := context.WithTimeout(context.Background(), h.pool.config.ConnectTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "HEAD", "http://"+conn.host+"/health", nil)
	if err != nil {
		conn.healthy = false
		return
	}

	client := &http.Client{
		Timeout: h.pool.config.ConnectTimeout,
	}

	resp, err := client.Do(req)
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
