package tests

import (
	"testing"

	"repository_after/led"
)



// Req 3: Prove buffer stores Green at index 0, Red at 1, Blue at 2 per pixel.
func TestGRBByteOrderExplicit(t *testing.T) {
	c := led.New()
	// SetColor(R, G, B) = (0, 255, 0) -> pure green
	c.SetColor(0, 255, 0)
	buf := c.CopyBuffer()
	if len(buf) < 3 {
		RecordResult("TestGRBByteOrderExplicit", false, "buffer too short")
		t.Fatalf("buffer too short")
	}
	wantG := led.Gamma(255)
	wantR := led.Gamma(0)
	wantB := led.Gamma(0)
	if buf[0] != wantG || buf[1] != wantR || buf[2] != wantB {
		RecordResult("TestGRBByteOrderExplicit", false, "byte order not GRB")
		t.Fatalf("GRB order failed: got buf[0]=%d buf[1]=%d buf[2]=%d, want G=%d R=%d B=%d", buf[0], buf[1], buf[2], wantG, wantR, wantB)
	}
	RecordResult("TestGRBByteOrderExplicit", true, "")
}
