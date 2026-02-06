package tests

import (
	"limiter"
	"testing"
	"time"
)

func TestReq02_MultiTenant_IndependentLimits(t *testing.T) {
	clk := newFakeClock(time.Unix(0, 0))
	g := limiter.NewSpamGuard(3, 5*time.Second)
	g.SetClockForTests(clk)
	g.SetSweepEveryForTests(1)

	a, b := "A", "B"

	for i := 0; i < 3; i++ {
		if !g.Allow(a) {
			t.Fatalf("A request %d should be allowed", i+1)
		}
	}
	if g.Allow(a) {
		t.Fatalf("A should be blocked on the 4th")
	}

	for i := 0; i < 3; i++ {
		if !g.Allow(b) {
			t.Fatalf("B request %d should be allowed", i+1)
		}
	}
	if g.Allow(b) {
		t.Fatalf("B should be blocked on the 4th")
	}
}
