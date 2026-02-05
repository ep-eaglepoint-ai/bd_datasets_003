package pool

import (
	"context"
	"errors"
	"net"
	"sync"
	"time"
)

// Pool manages a set of net.Conn resources with a hard limit on the number of
// connections.
type Pool struct {
	mu          sync.Mutex
	conns       chan net.Conn // Using channel for idle connections might be simpler? No, explicit list needed for MaxIdleTime.
	idle        []idleConn
	waiters     []chan net.Conn
	active      int
	maxConn     int
	maxIdleTime time.Duration
	factory     func() (net.Conn, error)
	closed      bool
}

type idleConn struct {
	c          net.Conn
	lastActive time.Time
}

// NewPool creates a new connection pool.
// factory is the function used to create new connections (e.g., net.Dial).
func NewPool(maxConn int, maxIdleTime time.Duration, factory func() (net.Conn, error)) *Pool {
	if maxConn <= 0 {
		maxConn = 1
	}
	return &Pool{
		maxConn:     maxConn,
		maxIdleTime: maxIdleTime,
		factory:     factory,
		idle:        make([]idleConn, 0, maxConn),
		waiters:     make([]chan net.Conn, 0),
	}
}

// Get returns a connection from the pool.
// If the pool is empty and active connections == maxConn, it blocks until
// a connection is returned or ctx is cancelled.
func (p *Pool) Get(ctx context.Context) (net.Conn, error) {
	p.mu.Lock()

	// 1. Check for closed pool (optional but good)
	if p.closed {
		p.mu.Unlock()
		return nil, errors.New("pool is closed")
	}

	// 2. Try to get an idle connection
	for len(p.idle) > 0 {
		// Pop from end (LIFO) or front? LIFO is standard for hot conns,
		// but checking idle time handles staleness.
		lastIdx := len(p.idle) - 1
		ic := p.idle[lastIdx]
		p.idle = p.idle[:lastIdx]

		if time.Since(ic.lastActive) > p.maxIdleTime {
			// Stale connection
			p.active--
			ic.c.Close()
			continue // Try next idle
		}

		// Found valid idle
		p.mu.Unlock()
		return ic.c, nil
	}

	// 3. No idle connections. Can we create a new one?
	if p.active < p.maxConn {
		p.active++
		p.mu.Unlock()

		c, err := p.factory()
		if err != nil {
			p.mu.Lock()
			p.active--
			p.mu.Unlock()
			return nil, err
		}
		return c, nil
	}

	// 4. Pool is full. We must wait.
	req := make(chan net.Conn, 1) // Buffer 1 is CRITICAL
	p.waiters = append(p.waiters, req)
	p.mu.Unlock()

	select {
	case c := <-req:
		return c, nil
	case <-ctx.Done():
		// 5. Handle Cancellation / Ghost Grant
		p.mu.Lock()
		
		// Try to remove ourselves from the queue
		removed := false
		for i, w := range p.waiters {
			if w == req {
				// Remove element i
				p.waiters = append(p.waiters[:i], p.waiters[i+1:]...)
				removed = true
				break
			}
		}

		p.mu.Unlock()

		if removed {
			// successfully cancelled before a connection was assigned
			return nil, ctx.Err()
		}

		// If NOT removed, it means Put() already popped us and sent a connection.
		// We MUST accept it to avoid leaking.
		c := <-req
		
		// We don't want it anymore, so put it back
		p.Put(c)
		
		return nil, ctx.Err()
	}
}

// Put returns a connection to the pool.
func (p *Pool) Put(conn net.Conn) {
	if conn == nil {
		return
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	if p.closed {
		conn.Close()
		p.active--
		return
	}

	// 1. Check if there are waiters
	if len(p.waiters) > 0 {
		req := p.waiters[0]
		p.waiters = p.waiters[1:]
		// Send connection to waiter. Non-blocking because buffer 1.
		req <- conn
		return
	}

	// 2. No waiters. Put into idle.
	// Safety check: if for some reason we have more connections than allowed
	// (e.g. manual injection), we shouldn't store it if we are "full" in terms of idle?
	// Actually, p.active is the limit. 
	// If p.active > p.maxConn, we should shrink.
	// But p.active tracks in-use + idle. 
	// If we are here, in-use -> idle. active count constant.
	// Unless random injection:
	// If we inject, active might ideally increase, but we don't know.
	// Let's cap idle at maxConn just in case.
	if len(p.idle) >= p.maxConn {
		conn.Close()
		// If we are discarding, we should decrement active?
		// Only if we assume it was counted. If logic is perfect, this branch is rarely hit
		// unless active desyncs or injection.
		// Safe bet: close and ignore. Do not touch active if we suspect it's extra.
		// Or decrement active to align with "Conn is gone". 
		// If it WAS counted, decrementing is correct. 
		// If it WAS NOT counted (injection), decrementing makes active -1 ?
		// Let's assume strict usage: Only Get() produces conns.
		// But to satisfy "Put must handle case where pool is full", we might close.
		// If valid flow: active stays same.
		return
	}
	
	p.idle = append(p.idle, idleConn{
		c:          conn,
		lastActive: time.Now(),
	})
}

// ActiveCount returns key metrics for testing
func (p *Pool) ActiveCount() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.active
}

func (p *Pool) IdleCount() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return len(p.idle)
}

func (p *Pool) WaiterCount() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return len(p.waiters)
}
