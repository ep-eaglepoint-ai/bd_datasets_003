package tests

import (
	"testing"

	wsconv "repository_after"
)

// Req 7: GN must handle channels not divisible by groups.
func TestReq7GroupNormChannelsNotDivisibleByGroups(t *testing.T) {
	passed := true
	msg := ""
	defer func() { RecordResult("TestReq7GroupNormChannelsNotDivisibleByGroups", passed, msg) }()

	gn, err := wsconv.NewGroupNorm(wsconv.GroupNormConfig{Channels: 5, Groups: 2, Epsilon: 1e-5})
	if err != nil {
		passed = false
		msg = "unexpected NewGroupNorm error: " + err.Error()
		t.Fatal(msg)
		return
	}

	input, _ := wsconv.NewTensor(1, 5, 3, 3)
	for i := range input.Data {
		input.Data[i] = float32((i%7)-3)
	}

	out, err := gn.Forward(input)
	if err != nil {
		passed = false
		msg = "unexpected GroupNorm Forward error: " + err.Error()
		t.Fatal(msg)
		return
	}
	if out.C != 5 {
		passed = false
		msg = "expected GroupNorm to preserve channel count"
		t.Fatalf("%s: got=%d want=5", msg, out.C)
		return
	}
}
