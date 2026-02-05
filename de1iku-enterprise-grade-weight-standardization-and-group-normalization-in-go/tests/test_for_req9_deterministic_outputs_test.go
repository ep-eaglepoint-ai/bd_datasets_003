package tests

import (
	"testing"

	wsconv "repository_after"
)

// Req 9: Deterministic outputs given same inputs and weights.
func TestReq9DeterministicOutputs(t *testing.T) {
	passed := true
	msg := ""
	defer func() { RecordResult("TestReq9DeterministicOutputs", passed, msg) }()

	cfg := wsconv.WSConv2DConfig{
		InChannels:  2,
		OutChannels: 3,
		KernelHeight: 3,
		KernelWidth:  3,
		StrideH: 1,
		StrideW: 1,
		PaddingH: 1,
		PaddingW: 1,
		Epsilon:  1e-5,
		UseWS:    true,
	}

	layerA, err := wsconv.NewWSConv2D(cfg)
	if err != nil {
		passed = false
		msg = "unexpected NewWSConv2D error: " + err.Error()
		t.Fatal(msg)
		return
	}
	layerB, err := wsconv.NewWSConv2D(cfg)
	if err != nil {
		passed = false
		msg = "unexpected NewWSConv2D error (second layer): " + err.Error()
		t.Fatal(msg)
		return
	}

	input, err := wsconv.NewTensor(1, 2, 4, 4)
	if err != nil {
		passed = false
		msg = "unexpected NewTensor error: " + err.Error()
		t.Fatal(msg)
		return
	}
	for i := range input.Data {
		input.Data[i] = float32(i%7) - 3
	}

	outA, err := layerA.Forward(input)
	if err != nil {
		passed = false
		msg = "unexpected Forward error (A): " + err.Error()
		t.Fatal(msg)
		return
	}
	outB, err := layerB.Forward(input)
	if err != nil {
		passed = false
		msg = "unexpected Forward error (B): " + err.Error()
		t.Fatal(msg)
		return
	}

	for i := range outA.Data {
		if outA.Data[i] != outB.Data[i] {
			passed = false
			msg = "outputs differ for identical config/input"
			t.Fatalf("%s at index %d: a=%v b=%v", msg, i, outA.Data[i], outB.Data[i])
			return
		}
	}
}
