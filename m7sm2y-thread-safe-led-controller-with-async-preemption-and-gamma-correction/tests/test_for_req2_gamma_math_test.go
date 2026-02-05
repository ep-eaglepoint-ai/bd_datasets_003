package tests

import (
	"testing"

	"repository_after/led"
)


// Req 2: Input 127 must produce stored value 63 (127^2/255).
func TestGammaVerification(t *testing.T) {
	const input = 127
	const expected = 63
	got := led.Gamma(input)
	if got != expected {
		RecordResult("TestGammaVerification", false, "gamma correction incorrect")
		t.Fatalf("gamma(%d) = %d, want %d", input, got, expected)
	}
	RecordResult("TestGammaVerification", true, "")
}
