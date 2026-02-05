package tests

import (
	"testing"

	wsconv "repository_after"
)

// Req 11: Maintain predictable memory usage and performance for large inputs.
func TestReq11PredictableMemoryUsageAndPerformance(t *testing.T) {
	passed := true
	msg := ""
	defer func() { RecordResult("TestReq11PredictableMemoryUsageAndPerformance", passed, msg) }()

	cfg := wsconv.WSConv2DConfig{
		InChannels:  8,
		OutChannels: 8,
		KernelHeight: 3,
		KernelWidth:  3,
		StrideH: 1,
		StrideW: 1,
		PaddingH: 1,
		PaddingW: 1,
		Epsilon:  1e-5,
		UseWS:    true,
	}
	layer, err := wsconv.NewWSConv2D(cfg)
	if err != nil {
		passed = false
		msg = "unexpected NewWSConv2D error: " + err.Error()
		t.Fatal(msg)
		return
	}

	// A reasonably large (but Docker-friendly) tensor.
	input, err := wsconv.NewTensor(2, 8, 32, 32)
	if err != nil {
		passed = false
		msg = "unexpected NewTensor error: " + err.Error()
		t.Fatal(msg)
		return
	}
	for i := range input.Data {
		input.Data[i] = float32((i*31)%17) - 8
	}

	// Warm-up to populate any internal caches (e.g., standardized weights).
	if _, err := layer.Forward(input); err != nil {
		passed = false
		msg = "unexpected Forward error during warm-up: " + err.Error()
		t.Fatal(msg)
		return
	}

	run := func() {
		out, err := layer.Forward(input)
		if err != nil || out == nil {
			// Fail fast inside the measurement too.
			panic("Forward failed")
		}
	}

	allocs1 := testing.AllocsPerRun(3, run)
	allocs2 := testing.AllocsPerRun(3, run)

	// Predictability: allocations should be stable across repeated measurements.
	if diff := allocs1 - allocs2; diff < -1.0 || diff > 1.0 {
		passed = false
		msg = "unexpected variability in allocations per run"
		t.Fatalf("%s: allocs1=%.2f allocs2=%.2f", msg, allocs1, allocs2)
		return
	}

	// Guardrail: keep a generous upper bound to catch accidental quadratic allocations.
	if allocs1 > 2000 {
		passed = false
		msg = "too many allocations per Forward run for large input"
		t.Fatalf("%s: allocs=%.2f", msg, allocs1)
		return
	}
}
