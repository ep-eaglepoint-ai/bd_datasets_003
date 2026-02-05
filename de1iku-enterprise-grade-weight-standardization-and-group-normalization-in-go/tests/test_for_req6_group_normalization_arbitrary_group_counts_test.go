package tests

import (
	"testing"

	wsconv "repository_after"
)

// Req 6: Group Normalization layer supporting arbitrary group counts.
func TestReq6GroupNormalizationArbitraryGroupCounts(t *testing.T) {
	passed := true
	msg := ""
	defer func() { RecordResult("TestReq6GroupNormalizationArbitraryGroupCounts", passed, msg) }()

	gn, err := wsconv.NewGroupNorm(wsconv.GroupNormConfig{Channels: 6, Groups: 3, Epsilon: 1e-5})
	if err != nil {
		passed = false
		msg = "unexpected NewGroupNorm error: " + err.Error()
		t.Fatal(msg)
		return
	}

	input, _ := wsconv.NewTensor(2, 6, 4, 4)
	for i := range input.Data {
		input.Data[i] = float32((i%13)-6)
	}

	out, err := gn.Forward(input)
	if err != nil {
		passed = false
		msg = "unexpected GroupNorm Forward error: " + err.Error()
		t.Fatal(msg)
		return
	}
	if out.N != input.N || out.C != input.C || out.H != input.H || out.W != input.W {
		passed = false
		msg = "GroupNorm output shape mismatch"
		t.Fatalf("%s: got=(%d,%d,%d,%d) want=(%d,%d,%d,%d)", msg, out.N, out.C, out.H, out.W, input.N, input.C, input.H, input.W)
		return
	}
}
