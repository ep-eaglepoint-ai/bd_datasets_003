package tests

import (
	"limiter"
	"testing"
	"time"
)

func TestAdditional_CleanupDoesNotEvictActiveClient(t *testing.T) {
	clk := newFakeClock(time.Unix(0, 0))
	g := limiter.NewSpamGuard(3, 5*time.Second)
	g.SetClockForTests(clk)
	g.SetIdleGraceForTests(0)
	g.SetSweepEveryForTests(1)

	client := "active"
	if !g.Allow(client) {
		t.Fatalf("expected allow")
	}

	// Advance within the window so the client is still active.
	clk.Advance(3 * time.Second)
	if !g.Allow("other") {
		t.Fatalf("expected allow for sweep trigger")
	}

	if got := g.ClientCountForTests(); got != 2 {
		t.Fatalf("expected active client to remain, count=%d", got)
	}
}

func TestAdditional_ZeroOrNegativeConfigDefaults(t *testing.T) {
	clk := newFakeClock(time.Unix(0, 0))
	g := limiter.NewSpamGuard(0, 0)
	g.SetClockForTests(clk)
	g.SetSweepEveryForTests(1)

	if !g.Allow("client") {
		t.Fatalf("expected allow with defaulted config")
	}
	if g.Allow("client") {
		t.Fatalf("expected second to be blocked when maxReqs defaults to 1")
	}

	clk.Advance(2 * time.Second)
	if !g.Allow("client") {
		t.Fatalf("expected allow after default window elapses")
	}
}
