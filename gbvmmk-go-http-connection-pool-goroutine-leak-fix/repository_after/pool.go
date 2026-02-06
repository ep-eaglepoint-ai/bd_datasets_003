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
	ip        string
}

type Pool struct {
	config        *Config
	connections   map[string][]*Conn
	mu            sync.Mutex
	stats         *Stats
	healthChecker *HealthChecker
	closed        bool
	ctx           context.Context
	cancel        context.CancelFunc
	wg            sync.WaitGroup
	once          sync.Once
	hostCounts    map[string]int
	waiters       map[string][]chan struct{}
	Resolver      interface {
		LookupIPAddr(context.Context, string) ([]net.IPAddr, error)
	}
}

func NewPool(config *Config) *Pool {
	if config == nil {
		config = DefaultConfig()
	}

	ctx, cancel := context.WithCancel(context.Background())

	p := &Pool{
		config:      config,
		connections: make(map[string][]*Conn),
		stats:       &Stats{},
		ctx:         ctx,
		cancel:      cancel,
		hostCounts:  make(map[string]int),
		waiters:     make(map[string][]chan struct{}),
		Resolver:    net.DefaultResolver,
	}

	p.healthChecker = NewHealthChecker(p, config.HealthCheckPeriod)
	p.healthChecker.Start()

	p.wg.Add(1)
	go p.startIdleEvictor()
	p.wg.Add(1)
	go p.startDNSRefresher()

	return p
}

func (p *Pool) Get(ctx context.Context, host string) (*Conn, error) {
	p.mu.Lock()

	for {
		if p.closed {
			p.mu.Unlock()
			return nil, errors.New("pool is closed")
		}

		conns := p.connections[host]
		for i, conn := range conns {
			if conn.healthy && !conn.inUse {
				conn.inUse = true
				conn.lastUsed = time.Now()
				p.connections[host] = append(conns[:i], conns[i+1:]...)
				p.stats.ReuseIdle()
				p.mu.Unlock()
				return conn, nil
			}
		}

		if p.hostCounts[host] < p.config.MaxConnsPerHost {
			p.hostCounts[host]++
			p.mu.Unlock()
			conn, err := p.CreateConnection(ctx, host)
			if err != nil {
				p.mu.Lock()
				p.hostCounts[host]--
				p.stats.IncrementFailed()
				p.signalWaiter(host)
				p.mu.Unlock()
				return nil, err
			}
			conn.inUse = true
			p.stats.NewConnection()
			return conn, nil
		}

		waitCh := make(chan struct{}, 1)
		p.waiters[host] = append(p.waiters[host], waitCh)
		p.mu.Unlock()

		select {
		case <-ctx.Done():
			p.mu.Lock()
			for i, ch := range p.waiters[host] {
				if ch == waitCh {
					p.waiters[host] = append(p.waiters[host][:i], p.waiters[host][i+1:]...)
					break
				}
			}
			p.mu.Unlock()
			return nil, ctx.Err()
		case <-waitCh:
			p.mu.Lock()
		}
	}
}

func (p *Pool) signalWaiter(host string) {
	if len(p.waiters[host]) > 0 {
		ch := p.waiters[host][0]
		p.waiters[host] = p.waiters[host][1:]
		close(ch)
	}
}

func (p *Pool) getActiveConnCount(host string) int {
	return p.hostCounts[host]
}

func (p *Pool) Release(conn *Conn) {
	if conn == nil {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()

	conn.inUse = false
	conn.lastUsed = time.Now()

	if conn.healthy {
		p.connections[conn.host] = append(p.connections[conn.host], conn)
		p.stats.ReleaseHealthy()
	} else {
		p.hostCounts[conn.host]--
		p.stats.ReleaseUnhealthy()
	}
	p.signalWaiter(conn.host)
}

func (p *Pool) CreateConnection(ctx context.Context, host string) (*Conn, error) {
	hostname, _, err := net.SplitHostPort(host)
	if err != nil {
		hostname = host // Assume no port
	}

	ips, err := p.Resolver.LookupIPAddr(ctx, hostname)
	if err != nil {
		return nil, err
	}
	if len(ips) == 0 {
		return nil, errors.New("no IPs found for host")
	}
	ip := ips[0].IP.String()

	dialer := &net.Dialer{
		Timeout:   p.config.ConnectTimeout,
		KeepAlive: 30 * time.Second,
	}

	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			_, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}
			return dialer.DialContext(ctx, network, net.JoinHostPort(ip, port))
		},
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
		ip:        ip,
	}, nil
}

func (p *Pool) Do(ctx context.Context, req *http.Request) (*http.Response, error) {
	conn, err := p.Get(ctx, req.URL.Host)
	if err != nil {
		return nil, err
	}
	defer p.Release(conn)

	// Create a new request with the provided context to ensure cancellation propagates
	req = req.WithContext(ctx)

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
	defer p.wg.Done()
	ticker := time.NewTicker(p.config.IdleTimeout)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			p.evictIdleConnections()
		case <-p.ctx.Done():
			return
		}
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
				p.stats.EvictIdle()
				p.hostCounts[host]--
				
				// Explicitly close the connection
				if t, ok := conn.client.Transport.(*http.Transport); ok {
					t.CloseIdleConnections()
				}
				
				p.signalWaiter(host)
			} else {
				activeConns = append(activeConns, conn)
			}
		}
		p.connections[host] = activeConns
	}
}

func (p *Pool) startDNSRefresher() {
	defer p.wg.Done()
	ticker := time.NewTicker(p.config.DNSRefreshPeriod)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			p.refreshDNS()
		case <-p.ctx.Done():
			return
		}
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
		func() {
			ctx, cancel := context.WithTimeout(p.ctx, p.config.ConnectTimeout)
			defer cancel()

			hostname, _, err := net.SplitHostPort(host)
			if err != nil {
				hostname = host
			}

			ips, err := p.Resolver.LookupIPAddr(ctx, hostname)
			if err != nil {
				p.mu.Lock()
				for _, conn := range p.connections[host] {
					conn.healthy = false
				}
				p.mu.Unlock()
				return
			}

			if len(ips) > 0 {
				newIP := ips[0].IP.String()
				p.mu.Lock()
				for _, conn := range p.connections[host] {
					if conn.ip != newIP {
						conn.healthy = false
					}
				}
				p.mu.Unlock()
			}
		}()
	}
	p.PurgeUnhealthy()
}

func (p *Pool) Close() error {
	p.once.Do(func() {
		p.mu.Lock()
		p.closed = true
		p.mu.Unlock()

		p.cancel()
		p.healthChecker.Stop()
		p.wg.Wait()

		p.mu.Lock()
		for _, conns := range p.connections {
			for _, conn := range conns {
				if t, ok := conn.client.Transport.(*http.Transport); ok {
					t.CloseIdleConnections()
				}
			}
		}
		p.mu.Unlock()
	})

	return nil
}

func (p *Pool) GetStats() *Stats {
	return p.stats
}

func (p *Pool) PurgeUnhealthy() {
	p.mu.Lock()
	defer p.mu.Unlock()

	for host, conns := range p.connections {
		var healthyConns []*Conn
		for _, conn := range conns {
			if conn.healthy {
				healthyConns = append(healthyConns, conn)
			} else {
				p.hostCounts[host]--
				p.stats.EvictIdle()
				p.signalWaiter(host)
			}
		}
		p.connections[host] = healthyConns
	}
}
