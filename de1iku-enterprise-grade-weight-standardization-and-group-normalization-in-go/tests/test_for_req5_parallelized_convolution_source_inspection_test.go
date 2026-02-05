package tests

import (
	"os"
	"strings"
	"testing"
)

// Req 5: Parallelized convolution computations across batch, channel, and spatial dimensions.
func TestReq5ParallelizedConvolutionSourceInspection(t *testing.T) {
	passed := true
	msg := ""
	defer func() { RecordResult("TestReq5ParallelizedConvolutionSourceInspection", passed, msg) }()

	content, err := os.ReadFile(MainGoPath())
	if err != nil {
		passed = false
		msg = "failed to read main.go: " + err.Error()
		t.Fatal(msg)
		return
	}
	src := string(content)

	// Source-level indicators that Forward uses worker goroutines and distributes work over (n, oc)
	// while iterating spatial dims (oh/ow) within each worker.
	needles := []string{
		"runtime.NumCPU",
		"workChan := make(chan",
		"go func()",
		"for n := 0; n < input.N; n++",
		"for oc := 0; oc < c.config.OutChannels; oc++",
		"for oh := 0; oh < output.H; oh++",
		"for ow := 0; ow < output.W; ow++",
	}
	for _, n := range needles {
		if !strings.Contains(src, n) {
			passed = false
			msg = "expected parallel Forward implementation marker missing: " + n
			t.Error(msg)
			return
		}
	}
}
