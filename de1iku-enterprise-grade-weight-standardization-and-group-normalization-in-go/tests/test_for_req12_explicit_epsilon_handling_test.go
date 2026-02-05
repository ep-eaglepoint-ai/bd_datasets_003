package tests

import (
	"math"
	"testing"

	wsconv "repository_after"
)

// Req 12: Explicit epsilon handling for floating-point precision in WS and GN.
func TestReq12ExplicitEpsilonHandling(t *testing.T) {
	passed := true
	msg := ""
	defer func() { RecordResult("TestReq12ExplicitEpsilonHandling", passed, msg) }()

	base := wsconv.WSConv2DConfig{
		InChannels:  2,
		OutChannels: 2,
		KernelHeight: 3,
		KernelWidth:  3,
		StrideH: 1,
		StrideW: 1,
		PaddingH: 1,
		PaddingW: 1,
		UseWS:    true,
	}

	cfgTinyEps := base
	cfgTinyEps.Epsilon = 1e-12
	layerTiny, err := wsconv.NewWSConv2D(cfgTinyEps)
	if err != nil {
		passed = false
		msg = "unexpected NewWSConv2D error (tiny eps): " + err.Error()
		t.Fatal(msg)
		return
	}

	cfgBigEps := base
	cfgBigEps.Epsilon = 1
	layerBig, err := wsconv.NewWSConv2D(cfgBigEps)
	if err != nil {
		passed = false
		msg = "unexpected NewWSConv2D error (big eps): " + err.Error()
		t.Fatal(msg)
		return
	}

	input, _ := wsconv.NewTensor(1, 2, 8, 8)
	for i := range input.Data {
		input.Data[i] = float32(i%9) - 4
	}

	outTiny, err := layerTiny.Forward(input)
	if err != nil {
		passed = false
		msg = "unexpected Forward error (tiny eps): " + err.Error()
		t.Fatal(msg)
		return
	}
	outBig, err := layerBig.Forward(input)
	if err != nil {
		passed = false
		msg = "unexpected Forward error (big eps): " + err.Error()
		t.Fatal(msg)
		return
	}

	// Epsilon must affect the standardization math; changing epsilon should change outputs.
	different := false
	for i := range outTiny.Data {
		if outTiny.Data[i] != outBig.Data[i] {
			different = true
			break
		}
	}
	if !different {
		passed = false
		msg = "expected outputs to differ when epsilon changes (WS should use epsilon)"
		t.Error(msg)
		return
	}

	// Floating-point safety: outputs must be finite (no NaN/Inf) even with very small epsilon.
	for i, v := range outTiny.Data {
		fv := float64(v)
		if math.IsNaN(fv) || math.IsInf(fv, 0) {
			passed = false
			msg = "non-finite output detected with tiny epsilon"
			t.Fatalf("%s at index %d: %v", msg, i, v)
			return
		}
	}

	// GN epsilon handling: changing epsilon should affect normalization results and must remain numerically stable.
	gnTiny, err := wsconv.NewGroupNorm(wsconv.GroupNormConfig{Channels: 4, Groups: 2, Epsilon: 1e-12})
	if err != nil {
		passed = false
		msg = "unexpected NewGroupNorm error (tiny eps): " + err.Error()
		t.Fatal(msg)
		return
	}
	gnBig, err := wsconv.NewGroupNorm(wsconv.GroupNormConfig{Channels: 4, Groups: 2, Epsilon: 1})
	if err != nil {
		passed = false
		msg = "unexpected NewGroupNorm error (big eps): " + err.Error()
		t.Fatal(msg)
		return
	}

	gnInput, _ := wsconv.NewTensor(2, 4, 1, 7)
	for i := range gnInput.Data {
		gnInput.Data[i] = float32((i%10)-5)
	}

	gnOutTiny, err := gnTiny.Forward(gnInput)
	if err != nil {
		passed = false
		msg = "unexpected GroupNorm Forward error (tiny eps): " + err.Error()
		t.Fatal(msg)
		return
	}
	gnOutBig, err := gnBig.Forward(gnInput)
	if err != nil {
		passed = false
		msg = "unexpected GroupNorm Forward error (big eps): " + err.Error()
		t.Fatal(msg)
		return
	}

	gnDifferent := false
	for i := range gnOutTiny.Data {
		if gnOutTiny.Data[i] != gnOutBig.Data[i] {
			gnDifferent = true
			break
		}
	}
	if !gnDifferent {
		passed = false
		msg = "expected GN outputs to differ when epsilon changes"
		t.Error(msg)
		return
	}

	for i, v := range gnOutTiny.Data {
		fv := float64(v)
		if math.IsNaN(fv) || math.IsInf(fv, 0) {
			passed = false
			msg = "non-finite GN output detected with tiny epsilon"
			t.Fatalf("%s at index %d: %v", msg, i, v)
			return
		}
	}
}
