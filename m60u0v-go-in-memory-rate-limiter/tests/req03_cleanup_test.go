package tests

import (
	"limiter"
	"testing"
	"time"
)

func TestReq03_Cleanup_EvictsIdleClients(t *testing.T) {
	clk := newFakeClock(time.Unix(0, 0))
	g := limiter.NewSpamGuard(2, 10*time.Second)
	g.SetClockForTests(clk)

	// Make eviction aggressive and deterministic.
	g.SetIdleGraceForTests(0)
	g.SetSweepEveryForTests(1)

	if !g.Allow("inactive") {
		t.Fatalf("expected allow")
	}
	if got := g.ClientCountForTests(); got != 1 {
		t.Fatalf("expected 1 client, got %d", got)
	}

	// Move beyond window (and grace=0), so eviction is allowed.
	clk.Advance(11 * time.Second)

	// Trigger sweep.
	if !g.Allow("other") {
		t.Fatalf("expected allow")
	}

	if got := g.ClientCountForTests(); got != 1 {
		t.Fatalf("expected inactive to be evicted, client count=%d", got)
	}
}
