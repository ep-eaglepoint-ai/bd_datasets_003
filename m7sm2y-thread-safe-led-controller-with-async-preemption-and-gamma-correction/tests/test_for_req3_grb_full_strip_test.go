package tests

import (
	"testing"

	"repository_after/led"
)

// Req 3, 8: SetColor must update all 100 LEDs in Green-Red-Blue order with gamma applied.
func TestSetColorUpdatesAll(t *testing.T) {
	c := led.New()
	r, g, b := uint8(10), uint8(20), uint8(30)
	c.SetColor(r, g, b)
	buf := c.CopyBuffer()
	const numLEDs = 100
	const bytesPerLED = 3
	if len(buf) != numLEDs*bytesPerLED {
		RecordResult("TestSetColorUpdatesAll", false, "buffer length wrong")
		t.Fatalf("buffer length = %d, want %d", len(buf), numLEDs*bytesPerLED)
	}
	gr := led.Gamma(g)
	rr := led.Gamma(r)
	br := led.Gamma(b)
	for i := 0; i < numLEDs; i++ {
		idx := i * bytesPerLED
		if buf[idx+0] != gr || buf[idx+1] != rr || buf[idx+2] != br {
			RecordResult("TestSetColorUpdatesAll", false, "LED strip not fully updated or wrong GRB order")
			t.Fatalf("LED %d: got G=%d R=%d B=%d, want G=%d R=%d B=%d (GRB order)", i, buf[idx+0], buf[idx+1], buf[idx+2], gr, rr, br)
		}
	}
	RecordResult("TestSetColorUpdatesAll", true, "")
}
