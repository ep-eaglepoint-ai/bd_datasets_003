package pool_test

import (
	"connection-pool/repository_after"
	"context"
	"net"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// mockConn implements net.Conn for testing
type mockConn struct {
	net.Conn
	closed bool
	id     int
}

func (m *mockConn) Close() error {
	m.closed = true
	return nil
}

// factory factory
func mockFactory() (net.Conn, error) {
	return &mockConn{}, nil
}

func TestNewPool(t *testing.T) {
	p := pool.NewPool(5, time.Minute, mockFactory)
	if p == nil {
		t.Fatal("NewPool returned nil")
	}
	if p.ActiveCount() != 0 {
		t.Errorf("New pool should have 0 active connections, got %d", p.ActiveCount())
	}
	if p.IdleCount() != 0 {
		t.Errorf("New pool should have 0 idle connections, got %d", p.IdleCount())
	}
}


func TestGetPutBasic(t *testing.T) {
	p := pool.NewPool(2, time.Minute, mockFactory)
	ctx := context.Background()

	c1, err := p.Get(ctx)
	if err != nil {
		t.Fatalf("Get failed: %v", err)
	}
	if p.ActiveCount() != 1 {
		t.Errorf("expected active 1, got %d", p.ActiveCount())
	}

	c2, err := p.Get(ctx)
	if err != nil {
		t.Fatalf("Get 2 failed: %v", err)
	}
	if p.ActiveCount() != 2 {
		t.Errorf("expected active 2, got %d", p.ActiveCount())
	}

	p.Put(c1)
	if p.ActiveCount() != 2 {
		t.Errorf("active should stay 2 after Put (1 idle, 1 busy), got %d", p.ActiveCount())
	}
	if p.IdleCount() != 1 {
		t.Errorf("expected 1 idle conn, got %d", p.IdleCount())
	}

	p.Put(c2)
	if p.IdleCount() != 2 {
		t.Errorf("expected 2 idle conns, got %d", p.IdleCount())
	}
}

func TestMaxConnBlocking(t *testing.T) {
	p := pool.NewPool(1, time.Minute, mockFactory)
	ctx := context.Background()

	// 1. Take the only connection
	c1, err := p.Get(ctx)
	if err != nil {
		t.Fatalf("first get failed: %v", err)
	}

	// 2. Launch a goroutine to Get() which should block
	done := make(chan struct{})
	go func() {
		c2, err := p.Get(ctx)
		if err != nil {
			t.Errorf("blocked get failed: %v", err)
			return
		}
		c2.Close()
		p.Put(c2)
		close(done)
	}()

	// Ensure the goroutine has time to start and block
	time.Sleep(50 * time.Millisecond)
	select {
	case <-done:
		t.Fatal("second Get should have blocked")
	default:
		// expected
	}

	// 3. Return c1, releasing the waiter
	p.Put(c1)

	select {
	case <-done:
		// success
	case <-time.After(1 * time.Second):
		t.Fatal("waiter did not unblock")
	}
}

func TestMaxIdleTime(t *testing.T) {
    // Short max idle time
	p := pool.NewPool(1, 10*time.Millisecond, mockFactory)
	ctx := context.Background()

	c1, _ := p.Get(ctx)
	p.Put(c1) // Now idle

	// Wait for expiration
	time.Sleep(50 * time.Millisecond)

	// Get should discard stale c1 and create new
	// We can verify this if we could ID the connections, but checking p.active behavior is easier.
	// Or simply usage.
	// Let's rely on internal state checks for whitebox testing since we are in same package.
	
	if p.IdleCount() != 1 {
        // Technically it's still in the list until we Get call
        t.Errorf("idle list should still have the item until Get is called, got %d", p.IdleCount())
    }

	c2, _ := p.Get(ctx)
    // The previous one (c1) should have been closed.
    // Ideally c2 is a *new* object.
    if c2 == c1 {
        t.Error("expected new connection, got stale one")
    }

    // Verify the old one was closed?
    mc, ok := c1.(*mockConn)
    if ok && !mc.closed {
        t.Error("stale connection was not closed")
    }
}

// TestGhostGrant verifies that a timed-out waiter does not lose a connection.
func TestGhostGrant(t *testing.T) {
	p := pool.NewPool(1, time.Minute, mockFactory)
	ctx := context.Background()

	// 1. Fill pool
	c1, _ := p.Get(ctx)

	// 2. Waiter triggers "Get" with short timeout
	// We want to force the race where Put happens around the timeout.
	// But simply ensuring correctness:
    // If Waiter times out, the message sent by Put effectively goes into the buffer channel.
    // The waiter code must drain it + Put it back.
    // If it works, the pool should not lose capacity.
    
    // Launch many waiters that timeout.
    // Launch one Put.
    // Check if capacity is restored.

    var wg sync.WaitGroup
    for i := 0; i < 10; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
            defer cancel()
            _, err := p.Get(ctx)
            if err == nil {
               
            }
        }()
    }

    // Wait for timeouts
    time.Sleep(50 * time.Millisecond)
    
    // Now return the connection
    p.Put(c1)
    
    // Wait a bit for potential cleanup races
    time.Sleep(50 * time.Millisecond)
    
    // Now try to Get again. If leak occurred (connection sent to dead waiter and not returned), active=1 (stuck). Use would block.
    ctx2, cancel2 := context.WithTimeout(context.Background(), 100*time.Millisecond)
    defer cancel2()
    
    c2, err := p.Get(ctx2)
    if err != nil {
        t.Fatalf("Pool lost capacity! Error: %v. State: Active=%d, Idle=%d", err, p.ActiveCount(), p.IdleCount())
    }
    p.Put(c2)
}

func TestHighConcurrency(t *testing.T) {
	maxConn := 5
	requesters := 50
	p := pool.NewPool(maxConn, time.Minute, func() (net.Conn, error) {
		// Small delay to simulate dial
		time.Sleep(time.Millisecond)
		return &mockConn{}, nil
	})

	var wg sync.WaitGroup
	wg.Add(requesters)

	errCh := make(chan error, requesters)

    
    
    maxSeen := int32(0)

	for i := 0; i < requesters; i++ {
		go func(id int) {
			defer wg.Done()
			
			// Some have short timeouts, some long
			timeout := 100 * time.Millisecond
			if id%5 == 0 {
				timeout = 5 * time.Millisecond // fast timeout
			}
			
			ctx, cancel := context.WithTimeout(context.Background(), timeout)
			defer cancel()

			c, err := p.Get(ctx)
			if err != nil {
				// Errors are expected for timeouts
				if err != context.DeadlineExceeded && err != context.Canceled {
				    errCh <- err
				}
				return
			}
			
		
			
			// Simulate work
			time.Sleep(10 * time.Millisecond)
			
			p.Put(c)
		}(i)
	}
	
	// Monitor active count in background
    stopMon := make(chan struct{})
    go func() {
        for {
            select {
            case <-stopMon:
                return
            default:
                act := p.ActiveCount()
                if act > maxConn {
                    atomic.StoreInt32(&maxSeen, int32(act))
                }
                time.Sleep(1 * time.Millisecond)
            }
        }
    }()

	wg.Wait()
	close(stopMon)

	close(errCh)
	for err := range errCh {
		t.Errorf("Unexpected error: %v", err)
	}

    seen := atomic.LoadInt32(&maxSeen)
	if seen > int32(maxConn) {
		t.Errorf("Max connections exceeded! Saw %d", seen)
	}
	
	// Final state check
	if p.WaiterCount() != 0 {
	    t.Errorf("Leaked waiters: %d", p.WaiterCount())
	}
	// Active should match len(idle) since all returned.
	if p.ActiveCount() != p.IdleCount() {
	     t.Errorf("State mismatch: active=%d, idle=%d", p.ActiveCount(), p.IdleCount())
	}
}

func TestPutOverflow(t *testing.T) {
	// 6. Put must handle the case where the pool is full
	p := pool.NewPool(1, time.Minute, mockFactory)
	ctx := context.Background()

	c1, err := p.Get(ctx)
	if err != nil {
		t.Fatalf("Get 1 failed: %v", err)
	}

	p.Put(c1) 

	// Create a manual connection (simulating injection)
	c2 := &mockConn{}
	
	// Try to Put it. Pool should reject/close it and not overflow.
	p.Put(c2)
	
	if p.IdleCount() != 1 {
		t.Errorf("Idle count should not exceed maxConn 1, got %d", p.IdleCount())
	}
	
	// c2 should be closed
	if !c2.closed {
		t.Errorf("Overflown connection should be closed")
	}
}

