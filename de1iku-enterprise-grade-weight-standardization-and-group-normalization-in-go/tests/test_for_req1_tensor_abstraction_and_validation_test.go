package tests

import (
	"testing"

	wsconv "repository_after"
)

// Req 1: Implement a tensor abstraction with NCHW layout and bounds-checked indexing.
func TestReq1TensorAbstractionWithBoundsCheckedIndexing(t *testing.T) {
	passed := true
	msg := ""
	defer func() { RecordResult("TestReq1TensorAbstractionWithBoundsCheckedIndexing", passed, msg) }()

	if _, err := wsconv.NewTensor(0, 1, 1, 1); err == nil {
		passed = false
		msg = "expected error for non-positive tensor dimension"
		t.Error(msg)
		return
	}

	tensor, err := wsconv.NewTensor(2, 3, 4, 5)
	if err != nil {
		passed = false
		msg = "unexpected error creating valid tensor: " + err.Error()
		t.Fatal(msg)
		return
	}
	if err := tensor.Validate(); err != nil {
		passed = false
		msg = "tensor.Validate() unexpectedly failed: " + err.Error()
		t.Fatal(msg)
		return
	}
	if got, want := len(tensor.Data), 2*3*4*5; got != want {
		passed = false
		msg = "unexpected tensor data length"
		t.Fatalf("%s: got=%d want=%d", msg, got, want)
		return
	}

	// Deterministic allocation expectation: newly allocated slices are zeroed.
	for i, v := range tensor.Data {
		if v != 0 {
			passed = false
			msg = "new tensor data should be zero-initialized"
			t.Fatalf("%s at index %d: got=%v", msg, i, v)
			return
		}
	}

	// Bounds-checked indexing must panic on out-of-bounds.
	func() {
		defer func() {
			if r := recover(); r == nil {
				passed = false
				msg = "expected panic for out-of-bounds At()"
				t.Error(msg)
			}
		}()
		_ = tensor.At(0, 0, 0, 999)
	}()

	func() {
		defer func() {
			if r := recover(); r == nil {
				passed = false
				msg = "expected panic for out-of-bounds Set()"
				t.Error(msg)
			}
		}()
		tensor.Set(0, 0, 0, -1, 123)
	}()
}
