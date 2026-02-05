package tests

import (
	"testing"

	wsconv "repository_after"
)

// Req 10: Validate and handle empty or malformed input tensors.
func TestReq10ValidateAndHandleMalformedInputTensors(t *testing.T) {
	passed := true
	msg := ""
	defer func() { RecordResult("TestReq10ValidateAndHandleMalformedInputTensors", passed, msg) }()

	cfg := wsconv.WSConv2DConfig{
		InChannels:  1,
		OutChannels: 1,
		KernelHeight: 3,
		KernelWidth:  3,
		StrideH: 1,
		StrideW: 1,
		PaddingH: 1,
		PaddingW: 1,
		Epsilon:  1e-5,
		UseWS:    false,
	}
	layer, err := wsconv.NewWSConv2D(cfg)
	if err != nil {
		passed = false
		msg = "unexpected NewWSConv2D error: " + err.Error()
		t.Fatal(msg)
		return
	}

	// Empty tensor shape should be rejected at construction.
	if _, err := wsconv.NewTensor(0, 1, 1, 1); err == nil {
		passed = false
		msg = "expected error for empty tensor dimensions"
		t.Error(msg)
		return
	}

	// Malformed tensor: correct shape fields, but wrong data length.
	input, _ := wsconv.NewTensor(1, 1, 4, 4)
	input.Data = input.Data[:len(input.Data)-1]
	if err := input.Validate(); err == nil {
		passed = false
		msg = "expected Validate() error for malformed tensor data length"
		t.Error(msg)
		return
	}
	if _, err := layer.Forward(input); err == nil {
		passed = false
		msg = "expected Forward() error for malformed input tensor"
		t.Error(msg)
		return
	}

	// Nil input should be handled with a clear error.
	if _, err := layer.Forward(nil); err == nil {
		passed = false
		msg = "expected Forward() error for nil input tensor"
		t.Error(msg)
		return
	}
}
