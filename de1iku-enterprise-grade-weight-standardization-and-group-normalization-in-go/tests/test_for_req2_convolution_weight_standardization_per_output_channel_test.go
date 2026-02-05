package tests

import (
	"testing"

	wsconv "repository_after"
)

// Req 2: Convolution layer with weight standardization per output channel.
func TestReq2ConvolutionWeightStandardizationPerOutputChannel(t *testing.T) {
	passed := true
	msg := ""
	defer func() { RecordResult("TestReq2ConvolutionWeightStandardizationPerOutputChannel", passed, msg) }()

	base := wsconv.WSConv2DConfig{
		InChannels:  1,
		OutChannels: 2,
		KernelHeight: 3,
		KernelWidth:  3,
		StrideH: 1,
		StrideW: 1,
		PaddingH: 1,
		PaddingW: 1,
		Epsilon:  1e-5,
	}
	layerNoWS, err := wsconv.NewWSConv2D(func() wsconv.WSConv2DConfig { c := base; c.UseWS = false; return c }())
	if err != nil {
		passed = false
		msg = "unexpected NewWSConv2D error (no WS): " + err.Error()
		t.Fatal(msg)
		return
	}
	layerWS, err := wsconv.NewWSConv2D(func() wsconv.WSConv2DConfig { c := base; c.UseWS = true; return c }())
	if err != nil {
		passed = false
		msg = "unexpected NewWSConv2D error (WS): " + err.Error()
		t.Fatal(msg)
		return
	}

	input, _ := wsconv.NewTensor(1, 1, 4, 4)
	for i := range input.Data {
		input.Data[i] = float32(i%5) - 2
	}

	outNoWS, err := layerNoWS.Forward(input)
	if err != nil {
		passed = false
		msg = "unexpected Forward error (no WS): " + err.Error()
		t.Fatal(msg)
		return
	}
	outWS, err := layerWS.Forward(input)
	if err != nil {
		passed = false
		msg = "unexpected Forward error (WS): " + err.Error()
		t.Fatal(msg)
		return
	}

	// WS should change behavior compared to non-WS.
	different := false
	for i := range outNoWS.Data {
		if !floatsAlmostEqual(outNoWS.Data[i], outWS.Data[i], 1e-6) {
			different = true
			break
		}
	}
	if !different {
		passed = false
		msg = "expected WS-enabled output to differ from non-WS output"
		t.Error(msg)
		return
	}
}
