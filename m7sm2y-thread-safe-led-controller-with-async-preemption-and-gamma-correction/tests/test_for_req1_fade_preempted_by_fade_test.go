package tests

import (
	"testing"
	"time"

	"repository_after/led"
)



// Req 1, 5: FadeTo(Red) then FadeTo(Green); buffer must end strictly Green (no Red ghosting).
func TestFadePreemptedByFadeTo(t *testing.T) {
	c := led.New()
	c.FadeTo(255, 0, 0, 5*time.Second)
	time.Sleep(100 * time.Millisecond)
	c.FadeTo(0, 255, 0, 2*time.Second)
	time.Sleep(2500 * time.Millisecond)
	buf := c.CopyBuffer()
	expectedG := led.Gamma(255)
	const numLEDs = 100
	const bytesPerLED = 3
	for i := 0; i < numLEDs; i++ {
		idx := i * bytesPerLED
		g, r, b := buf[idx+0], buf[idx+1], buf[idx+2]
		if g != expectedG || r != 0 || b != 0 {
			RecordResult("TestFadePreemptedByFadeTo", false, "ghosting or wrong final color")
			t.Fatalf("LED %d: got G=%d R=%d B=%d; want G=%d R=0 B=0", i, g, r, b, expectedG)
		}
	}
	RecordResult("TestFadePreemptedByFadeTo", true, "")
}
