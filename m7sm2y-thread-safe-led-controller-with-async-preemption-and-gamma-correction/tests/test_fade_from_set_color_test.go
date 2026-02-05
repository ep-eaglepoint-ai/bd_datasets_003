package tests

import (
	"testing"
	"time"

	"repository_after/led"
)

// Requirement mapping:
//   Integration: Fade reads current color after SetColor and completes to target.
//   Supports REQ-01 (currentColor), REQ-04 (consistent state under mutex).
// Test: TestFadeToFromSetColor

func TestFadeToFromSetColor(t *testing.T) {
	c := led.New()
	c.SetColor(100, 0, 0)
	c.FadeTo(0, 0, 100, 200*time.Millisecond)
	time.Sleep(350 * time.Millisecond)
	buf := c.CopyBuffer()
	expectedB := led.Gamma(100)
	const numLEDs = 100
	const bytesPerLED = 3
	for i := 0; i < numLEDs; i++ {
		idx := i * bytesPerLED
		g, r, b := buf[idx+0], buf[idx+1], buf[idx+2]
		if g != 0 || r != 0 || b != expectedB {
			RecordResult("TestFadeToFromSetColor", false, "final color not blue")
			t.Fatalf("LED %d: got G=%d R=%d B=%d; want G=0 R=0 B=%d", i, g, r, b, expectedB)
		}
	}
	RecordResult("TestFadeToFromSetColor", true, "")
}
