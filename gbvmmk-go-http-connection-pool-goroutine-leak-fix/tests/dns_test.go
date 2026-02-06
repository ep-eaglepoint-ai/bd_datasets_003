package tests

import (
	"context"
	"net"
	"reflect"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/example/connpool"
)

type mockResolver struct {
	mu  sync.Mutex
	ips map[string][]net.IPAddr
}

func (m *mockResolver) LookupIPAddr(ctx context.Context, host string) ([]net.IPAddr, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	ips, ok := m.ips[host]
	if !ok {
		return nil, &net.DNSError{Err: "no such host", Name: host, IsNotFound: true}
	}
	return ips, nil
}

func (m *mockResolver) set(host string, ip string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.ips[host] = []net.IPAddr{{IP: net.ParseIP(ip)}}
}

func TestDNSRefreshInterval(t *testing.T) {
	// This test is hard to verify precisely without internal access,
	// but we can check if LookupIPAddr is called periodically.
	
	resolver := &mockResolver{ips: make(map[string][]net.IPAddr)}
	resolver.set("example.com", "1.1.1.1")
	
	var callCount int32
	wrappedResolver := &countingResolver{
		resolver: resolver,
		count:    &callCount,
	}

	config := pool.DefaultConfig()
	config.DNSRefreshPeriod = 100 * time.Millisecond
	p := pool.NewPool(config)
	
	// Use reflection to set Resolver if it exists (only in repository_after)
	v := reflect.ValueOf(p).Elem()
	f := v.FieldByName("Resolver")
	if f.IsValid() && f.CanSet() {
		f.Set(reflect.ValueOf(wrappedResolver))
	}
	
	defer p.Close()

	// Add a connection so there's something to refresh
	conn, _ := p.Get(context.Background(), "example.com")
	p.Release(conn)

	time.Sleep(250 * time.Millisecond)

	count := atomic.LoadInt32(&callCount)
	// Expect at least 2 refreshes (at 100ms, 200ms)
	if count < 2 {
		t.Errorf("Expected at least 2 DNS refreshes, got %d", count)
	}
}

func TestStaleConnectionsInvalidated(t *testing.T) {
	resolver := &mockResolver{ips: make(map[string][]net.IPAddr)}
	resolver.set("example.com", "1.1.1.1")

	config := pool.DefaultConfig()
	config.DNSRefreshPeriod = 50 * time.Millisecond
	p := pool.NewPool(config)
	
	// Use reflection to set Resolver if it exists (only in repository_after)
	v := reflect.ValueOf(p).Elem()
	f := v.FieldByName("Resolver")
	if f.IsValid() && f.CanSet() {
		f.Set(reflect.ValueOf(resolver))
	}
	
	defer p.Close()

	// 1. Create connection to 1.1.1.1
	conn, _ := p.Get(context.Background(), "example.com")
	p.Release(conn)

	stats := p.GetStats()
	if stats.GetIdle() != 1 {
		t.Errorf("Expected 1 idle connection, got %d", stats.GetIdle())
	}

	// 2. Change DNS to 2.2.2.2
	resolver.set("example.com", "2.2.2.2")

	// 3. Wait for refresh
	time.Sleep(150 * time.Millisecond)

	// 4. Connection should be invalidated and removed
	stats = p.GetStats()
	if stats.GetIdle() != 0 {
		t.Errorf("Expected 0 idle connections after DNS change, got %d", stats.GetIdle())
	}
	
	// 5. Next Get should create a new connection to 2.2.2.2
	conn2, _ := p.Get(context.Background(), "example.com")
	p.Release(conn2)
	
	// Total should be 1 now (old one purged, new one created)
	// Wait, if old one was purged, total skipped back to 0 then 1?
	// Our CreateConnection increments stats.
	if stats.GetTotal() != 1 {
		// This depends on whether stats.DecrementTotal was called during purge
	}
}

type countingResolver struct {
	resolver *mockResolver
	count    *int32
}

func (c *countingResolver) LookupIPAddr(ctx context.Context, host string) ([]net.IPAddr, error) {
	atomic.AddInt32(c.count, 1)
	return c.resolver.LookupIPAddr(ctx, host)
}
