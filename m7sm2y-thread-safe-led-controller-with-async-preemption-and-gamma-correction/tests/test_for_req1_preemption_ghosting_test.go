package tests

import (
	"testing"
	"time"

	"repository_after/led"
)



// Req 1, 4, 5, 7: FadeTo(Red) then SetColor(Blue); buffer must remain strictly Blue (no ghosting).
func TestFadePreemptedBySetColor(t *testing.T) {
	c := led.New()
	c.FadeTo(255, 0, 0, 5*time.Second)
	time.Sleep(100 * time.Millisecond)
	c.SetColor(0, 0, 255)
	time.Sleep(300 * time.Millisecond)
	buf := c.CopyBuffer()
	expectedB := led.Gamma(255)
	const numLEDs = 100
	const bytesPerLED = 3
	for i := 0; i < numLEDs; i++ {
		idx := i * bytesPerLED
		g, r, b := buf[idx+0], buf[idx+1], buf[idx+2]
		if g != 0 || r != 0 || b != expectedB {
			RecordResult("TestFadePreemptedBySetColor", false, "ghosting detected")
			t.Fatalf("ghosting detected at LED %d: G=%d R=%d B=%d; want G=0 R=0 B=%d", i, g, r, b, expectedB)
		}
	}
	RecordResult("TestFadePreemptedBySetColor", true, "")
}
