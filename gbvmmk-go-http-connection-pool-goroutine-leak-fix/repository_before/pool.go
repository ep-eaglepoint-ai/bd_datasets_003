package pool

import (
	"context"
	"errors"
	"net"
	"net/http"
	"sync"
	"time"
)

type Conn struct {
	client    *http.Client
	host      string
	createdAt time.Time
	lastUsed  time.Time
	healthy   bool
	inUse     bool
}

type Pool struct {
	config        *Config
	connections   map[string][]*Conn
	mu            sync.Mutex
	stats         *Stats
	healthChecker *HealthChecker
	closed        bool
}

func NewPool(config *Config) *Pool {
	if config == nil {
		config = DefaultConfig()
	}

	p := &Pool{
		config:      config,
		connections: make(map[string][]*Conn),
		stats:       &Stats{},
	}

	p.healthChecker = NewHealthChecker(p, config.HealthCheckPeriod)
	p.healthChecker.Start()

	go p.startIdleEvictor()
	go p.startDNSRefresher()

	return p
}

func (p *Pool) Get(ctx context.Context, host string) (*Conn, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.closed {
		return nil, errors.New("pool is closed")
	}

	conns := p.connections[host]
	for i, conn := range conns {
		if conn.healthy && !conn.inUse {
			conn.inUse = true
			conn.lastUsed = time.Now()
			p.connections[host] = append(conns[:i], conns[i+1:]...)
			p.stats.IncrementActive()
			return conn, nil
		}
	}

	totalConns := p.getActiveConnCount(host)
	if totalConns >= p.config.MaxConnsPerHost {
		return nil, errors.New("max connections reached")
	}

	conn, err := p.CreateConnection(ctx, host)
	if err != nil {
		p.stats.IncrementFailed()
		return nil, err
	}

	conn.inUse = true
	p.stats.IncrementTotal()
	p.stats.IncrementActive()
	return conn, nil
}

func (p *Pool) getActiveConnCount(host string) int {
	return 0
}

func (p *Pool) Release(conn *Conn) {
	p.mu.Lock()
	defer p.mu.Unlock()

	conn.inUse = false
	conn.lastUsed = time.Now()

	if conn.healthy {
		p.connections[conn.host] = append(p.connections[conn.host], conn)
		p.stats.DecrementActive()
		p.stats.IncrementIdle()
	} else {
		p.stats.DecrementActive()
	}
}

func (p *Pool) CreateConnection(ctx context.Context, host string) (*Conn, error) {
	dialer := &net.Dialer{
		Timeout:   p.config.ConnectTimeout,
		KeepAlive: 30 * time.Second,
	}

	transport := &http.Transport{
		DialContext:         dialer.DialContext,
		MaxIdleConns:        p.config.MaxIdleConns,
		MaxIdleConnsPerHost: p.config.MaxIdleConns,
		IdleConnTimeout:     p.config.IdleTimeout,
	}

	client := &http.Client{
		Transport: transport,
		Timeout:   p.config.RequestTimeout,
	}

	return &Conn{
		client:    client,
		host:      host,
		createdAt: time.Now(),
		lastUsed:  time.Now(),
		healthy:   true,
	}, nil
}

func (p *Pool) Do(ctx context.Context, req *http.Request) (*http.Response, error) {
	conn, err := p.Get(ctx, req.URL.Host)
	if err != nil {
		return nil, err
	}
	defer p.Release(conn)

	resp, err := conn.client.Do(req)
	if err != nil {
		conn.healthy = false
		p.stats.IncrementFailed()
		return nil, err
	}

	if resp.StatusCode >= 500 {
		conn.healthy = false
	}

	return resp, nil
}

func (p *Pool) startIdleEvictor() {
	ticker := time.NewTicker(p.config.IdleTimeout)
	defer ticker.Stop()

	for range ticker.C {
		p.evictIdleConnections()
	}
}

func (p *Pool) evictIdleConnections() {
	p.mu.Lock()
	defer p.mu.Unlock()

	now := time.Now()
	for host, conns := range p.connections {
		var activeConns []*Conn
		for _, conn := range conns {
			if now.Sub(conn.lastUsed) > p.config.IdleTimeout {
				p.stats.DecrementIdle()
			} else {
				activeConns = append(activeConns, conn)
			}
		}
		p.connections[host] = activeConns
	}
}

func (p *Pool) startDNSRefresher() {
	ticker := time.NewTicker(p.config.DNSRefreshPeriod)
	defer ticker.Stop()

	for range ticker.C {
		p.refreshDNS()
	}
}

func (p *Pool) refreshDNS() {
	p.mu.Lock()
	hosts := make([]string, 0, len(p.connections))
	for host := range p.connections {
		hosts = append(hosts, host)
	}
	p.mu.Unlock()

	for _, host := range hosts {
		ctx, cancel := context.WithTimeout(context.Background(), p.config.ConnectTimeout)
		defer cancel()

		_, err := net.DefaultResolver.LookupIPAddr(ctx, host)
		if err != nil {
			p.mu.Lock()
			for _, conn := range p.connections[host] {
				conn.healthy = false
			}
			p.mu.Unlock()
		}
	}
}

func (p *Pool) Close() error {
	p.mu.Lock()
	p.closed = true
	p.mu.Unlock()

	p.healthChecker.Stop()

	for _, conns := range p.connections {
		for _, conn := range conns {
			if t, ok := conn.client.Transport.(*http.Transport); ok {
				t.CloseIdleConnections()
			}
		}
	}

	return nil
}

func (p *Pool) GetStats() *Stats {
	return p.stats
}
