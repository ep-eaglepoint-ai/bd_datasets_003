package tests

import (
	"testing"

	"repository_after/led"
)

// Req 6: SetColor must store gamma-corrected values in the buffer (e.g. 127 -> 63).
func TestGammaAppliedToBuffer(t *testing.T) {
	c := led.New()
	c.SetColor(127, 127, 127)
	buf := c.CopyBuffer()
	if len(buf) < 3 {
		RecordResult("TestGammaAppliedToBuffer", false, "buffer too short")
		t.Fatalf("buffer too short")
	}
	expected := led.Gamma(127)
	if buf[0] != expected || buf[1] != expected || buf[2] != expected {
		RecordResult("TestGammaAppliedToBuffer", false, "buffer has linear values")
		t.Fatalf("buffer has linear values; expected gamma(127)=%d, got G=%d R=%d B=%d", expected, buf[0], buf[1], buf[2])
	}
	RecordResult("TestGammaAppliedToBuffer", true, "")
}
