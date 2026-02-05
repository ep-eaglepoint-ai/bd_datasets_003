package tests

import (
	"testing"

	wsconv "repository_after"
)

// Req 8: GN must handle degenerate spatial dimensions (H or W = 1).
func TestReq8GroupNormDegenerateSpatialDimensions(t *testing.T) {
	passed := true
	msg := ""
	defer func() { RecordResult("TestReq8GroupNormDegenerateSpatialDimensions", passed, msg) }()

	gn, err := wsconv.NewGroupNorm(wsconv.GroupNormConfig{Channels: 4, Groups: 2, Epsilon: 1e-5})
	if err != nil {
		passed = false
		msg = "unexpected NewGroupNorm error: " + err.Error()
		t.Fatal(msg)
		return
	}

	// H=1 case.
	inputH1, _ := wsconv.NewTensor(2, 4, 1, 7)
	for i := range inputH1.Data {
		inputH1.Data[i] = float32((i%9)-4)
	}
	outH1, err := gn.Forward(inputH1)
	if err != nil {
		passed = false
		msg = "unexpected GroupNorm Forward error for H=1: " + err.Error()
		t.Fatal(msg)
		return
	}
	if outH1.H != 1 {
		passed = false
		msg = "expected output H to remain 1"
		t.Fatalf("%s: got=%d", msg, outH1.H)
		return
	}

	// W=1 case.
	inputW1, _ := wsconv.NewTensor(2, 4, 7, 1)
	for i := range inputW1.Data {
		inputW1.Data[i] = float32((i%11)-5)
	}
	outW1, err := gn.Forward(inputW1)
	if err != nil {
		passed = false
		msg = "unexpected GroupNorm Forward error for W=1: " + err.Error()
		t.Fatal(msg)
		return
	}
	if outW1.W != 1 {
		passed = false
		msg = "expected output W to remain 1"
		t.Fatalf("%s: got=%d", msg, outW1.W)
		return
	}
}
