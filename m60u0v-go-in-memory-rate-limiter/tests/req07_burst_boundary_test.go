package tests

import (
	"limiter"
	"testing"
	"time"
)

func TestReq07_BurstBoundaryAttack_SlidingWindowSlidesOff(t *testing.T) {
	// Requirement: "Send 60 requests in the last 1 second of a window, wait 1 second,
	// and ensure the count correctly slides off to allow new requests."
	//
	// Sliding window correctness is about timestamps expiring exactly as time moves.
	// Using windowSize=1s makes the test strict and deterministic.
	clk := newFakeClock(time.Unix(0, 0))
	g := limiter.NewSpamGuard(60, 1*time.Second)
	g.SetClockForTests(clk)
	g.SetSweepEveryForTests(1)

	client := "attacker"

	// Put 60 requests within the last 1 second of the window:
	// we place them all at t=0 (still within the 1s window).
	for i := 0; i < 60; i++ {
		if !g.Allow(client) {
			t.Fatalf("expected request %d allowed", i+1)
		}
	}

	// 61st immediately should be blocked.
	if g.Allow(client) {
		t.Fatalf("expected 61st to be blocked")
	}

	// After exactly 1 second, all 60 are expired (<= cutoff), so should allow again.
	clk.Advance(1 * time.Second)
	if !g.Allow(client) {
		t.Fatalf("expected allow after 1s slide-off")
	}
}
