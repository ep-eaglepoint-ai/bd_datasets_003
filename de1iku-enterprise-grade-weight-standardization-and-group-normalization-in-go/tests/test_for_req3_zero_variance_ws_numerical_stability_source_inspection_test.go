package tests

import (
	"os"
	"strings"
	"testing"
)

// Req 3: Standardization must handle zero-variance kernels with numerical stability.
func TestReq3ZeroVarianceWSNumericalStabilitySourceInspection(t *testing.T) {
	passed := true
	msg := ""
	defer func() { RecordResult("TestReq3ZeroVarianceWSNumericalStabilitySourceInspection", passed, msg) }()

	content, err := os.ReadFile(MainGoPath())
	if err != nil {
		passed = false
		msg = "failed to read main.go: " + err.Error()
		t.Fatal(msg)
		return
	}
	src := string(content)

	// Stability indicators:
	// - variance clamped to non-negative
	// - epsilon added before sqrt
	needles := []string{
		"if variance < 0",
		"variance = 0",
		"variance + c.config.Epsilon",
		"math.Sqrt",
	}
	for _, n := range needles {
		if !strings.Contains(src, n) {
			passed = false
			msg = "expected WS numerical stability marker missing: " + n
			t.Error(msg)
			return
		}
	}
}
