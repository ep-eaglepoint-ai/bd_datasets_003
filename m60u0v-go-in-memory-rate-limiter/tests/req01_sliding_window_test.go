package tests

import (
	"limiter"
	"testing"
	"time"
)

func TestReq01_SlidingWindow_AllowsUpToMaxThenBlocks(t *testing.T) {
	clk := newFakeClock(time.Unix(0, 0))
	g := limiter.NewSpamGuard(60, 60*time.Second)
	g.SetClockForTests(clk)
	g.SetSweepEveryForTests(1)

	client := "clientA"

	for i := 0; i < 60; i++ {
		if !g.Allow(client) {
			t.Fatalf("expected request %d to be allowed", i+1)
		}
	}
	if g.Allow(client) {
		t.Fatalf("expected 61st request to be rate-limited")
	}

	// After enough time passes, earliest requests expire.
	clk.Advance(61 * time.Second)
	if !g.Allow(client) {
		t.Fatalf("expected request to be allowed after window elapsed")
	}
}

func TestReq01_SlidingWindow_PreciseBoundaryBehavior(t *testing.T) {
	clk := newFakeClock(time.Unix(0, 0))
	g := limiter.NewSpamGuard(2, 10*time.Second)
	g.SetClockForTests(clk)
	g.SetSweepEveryForTests(1)

	client := "c"
	if !g.Allow(client) || !g.Allow(client) {
		t.Fatalf("first two should be allowed")
	}
	if g.Allow(client) {
		t.Fatalf("third should be blocked within the window")
	}

	// Move just before expiry: still blocked.
	clk.Advance(10*time.Second - 1*time.Nanosecond)
	if g.Allow(client) {
		t.Fatalf("should still be blocked just before expiry")
	}

	// Move just past expiry: one slot should open.
	clk.Advance(2 * time.Nanosecond)
	if !g.Allow(client) {
		t.Fatalf("should be allowed after expiry")
	}
}
