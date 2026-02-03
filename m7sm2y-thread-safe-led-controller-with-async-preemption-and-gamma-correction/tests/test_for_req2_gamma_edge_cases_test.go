package tests

import (
	"testing"

	"repository_after/led"
)

// Requirement mapping:
//   REQ-02: Gamma math applied consistently (no linear bypass for 0 or 255)
// Test: TestGammaEdgeCases

func TestGammaEdgeCases(t *testing.T) {
	if led.Gamma(0) != 0 {
		RecordResult("TestGammaEdgeCases", false, "Gamma(0) != 0")
		t.Fatalf("Gamma(0) = %d, want 0", led.Gamma(0))
	}
	if led.Gamma(255) != 255 {
		RecordResult("TestGammaEdgeCases", false, "Gamma(255) != 255")
		t.Fatalf("Gamma(255) = %d, want 255", led.Gamma(255))
	}
	c := led.New()
	c.SetColor(0, 0, 0)
	buf := c.CopyBuffer()
	if len(buf) < 3 {
		RecordResult("TestGammaEdgeCases", false, "buffer too short")
		t.Fatalf("buffer too short")
	}
	if buf[0] != 0 || buf[1] != 0 || buf[2] != 0 {
		RecordResult("TestGammaEdgeCases", false, "SetColor(0,0,0) not stored as 0")
		t.Fatalf("SetColor(0,0,0): got G=%d R=%d B=%d", buf[0], buf[1], buf[2])
	}
	c.SetColor(255, 255, 255)
	buf = c.CopyBuffer()
	if buf[0] != 255 || buf[1] != 255 || buf[2] != 255 {
		RecordResult("TestGammaEdgeCases", false, "SetColor(255,255,255) not stored as 255")
		t.Fatalf("SetColor(255,255,255): got G=%d R=%d B=%d", buf[0], buf[1], buf[2])
	}
	RecordResult("TestGammaEdgeCases", true, "")
}
