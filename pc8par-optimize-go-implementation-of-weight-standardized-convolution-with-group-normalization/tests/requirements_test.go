package main

import (
	"math"
	"os"
	"reflect"
	"strings"
	"testing"

	after "repository_after"
	before "wsconv_gn"
)

// REQ-01: Preserve numerical correctness and public API.
func TestPublicAPIForwardShapeMatches(t *testing.T) {
	if usingAfter() {
		x := after.NewTensor(1, 3, 5, 5)
		conv := after.NewWSConv2D(3, 4, 3, 1, 1)
		y := conv.Forward(x)
		if !reflect.DeepEqual(y.Shape, []int{1, 4, 5, 5}) {
			t.Fatalf("unexpected output shape: %v", y.Shape)
		}
	} else {
		x := before.NewTensor(1, 3, 5, 5)
		conv := before.NewWSConv2D(3, 4, 3, 1, 1)
		y := conv.Forward(x)
		if !reflect.DeepEqual(y.Shape, []int{1, 4, 5, 5}) {
			t.Fatalf("unexpected output shape: %v", y.Shape)
		}
	}
}

// REQ-02: Eliminate unnecessary allocations and copies.
func TestOptimizedForwardAllocationsWithinBudget(t *testing.T) {
	if !usingAfter() {
		t.Skip("allocation target applies to optimized implementation")
	}
	x := after.NewTensor(1, 3, 5, 5)
	conv := after.NewWSConv2D(3, 4, 3, 1, 1)
	allocs := testing.AllocsPerRun(5, func() {
		_ = conv.Forward(x)
	})
	if allocs > 4 {
		t.Fatalf("too many allocations: %.2f", allocs)
	}
}

// REQ-03: Remove per-pixel goroutines and inner-loop mutexes.
func TestOptimizedImplementationNoGoroutinesOrMutex(t *testing.T) {
	if !usingAfter() {
		t.Skip("code scan applies to optimized implementation")
	}
	path := getRepoPath() + "/main.go"
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read %s: %v", path, err)
	}
	src := string(content)
	if strings.Contains(src, "sync.Mutex") {
		t.Fatalf("unexpected sync.Mutex usage")
	}
	if strings.Contains(src, "go ") {
		t.Fatalf("unexpected goroutine usage")
	}
}

// REQ-04: Precompute and reuse strides, indices, kernels, and standardized weights.
func TestPrecomputedStridesAndCachedWeightsPresent(t *testing.T) {
	if !usingAfter() {
		t.Skip("precompute/caching checks apply to optimized implementation")
	}
	tType := reflect.TypeOf(after.Tensor{})
	if _, ok := tType.FieldByName("strides"); !ok {
		t.Fatalf("Tensor missing strides field")
	}
	cType := reflect.TypeOf(after.WSConv2D{})
	if _, ok := cType.FieldByName("ws"); !ok {
		t.Fatalf("WSConv2D missing cached weights field")
	}
}

// REQ-05: Use contiguous memory and cache-friendly access patterns.
func TestOptimizedUsesContiguousMemoryPatterns(t *testing.T) {
	if !usingAfter() {
		t.Skip("contiguous access checks apply to optimized implementation")
	}
	path := getRepoPath() + "/main.go"
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read %s: %v", path, err)
	}
	src := string(content)
	if !strings.Contains(src, "xStride") || !strings.Contains(src, "yStride") {
		t.Fatalf("expected explicit stride variables for contiguous access")
	}
}

// REQ-06: Hoist invariants outside loops.
func TestHoistedInvariantsPresent(t *testing.T) {
	if !usingAfter() {
		t.Skip("hoisted invariant checks apply to optimized implementation")
	}
	path := getRepoPath() + "/main.go"
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read %s: %v", path, err)
	}
	src := string(content)
	if !strings.Contains(src, "kernelSize") || !strings.Contains(src, "kSquare") {
		t.Fatalf("expected hoisted kernel invariants")
	}
}

// REQ-07: Ensure deterministic results for all inputs.
func TestDeterministicResults(t *testing.T) {
	if !usingAfter() {
		t.Skip("determinism requirement applies to optimized implementation")
	}
	x := after.NewTensor(1, 3, 6, 6)
	conv := after.NewWSConv2D(3, 2, 3, 1, 1)
	y1 := conv.Forward(x)
	y2 := conv.Forward(x)
	if len(y1.Data) != len(y2.Data) {
		t.Fatalf("output length mismatch")
	}
	for i := range y1.Data {
		if y1.Data[i] != y2.Data[i] {
			t.Fatalf("non-deterministic output at %d: %v vs %v", i, y1.Data[i], y2.Data[i])
		}
	}
}

// REQ-08: Handle batch sizes >1 correctly.
func TestBatchSizeSupport(t *testing.T) {
	if usingAfter() {
		x := after.NewTensor(2, 3, 5, 5)
		conv := after.NewWSConv2D(3, 4, 3, 1, 1)
		y := conv.Forward(x)
		if !reflect.DeepEqual(y.Shape, []int{2, 4, 5, 5}) {
			t.Fatalf("unexpected output shape: %v", y.Shape)
		}
	} else {
		x := before.NewTensor(2, 3, 5, 5)
		conv := before.NewWSConv2D(3, 4, 3, 1, 1)
		y := conv.Forward(x)
		if !reflect.DeepEqual(y.Shape, []int{2, 4, 5, 5}) {
			t.Fatalf("unexpected output shape: %v", y.Shape)
		}
	}
}

// REQ-09: Support valid tensor shapes and detect invalid shapes/stride/padding mismatches.
func TestInvalidShapeAndStrideHandling(t *testing.T) {
	if !usingAfter() {
		t.Skip("error handling requirement applies to optimized implementation")
	}
	conv := after.NewWSConv2D(3, 4, 3, 1, 1)
	_, err := conv.ForwardWithError(&after.Tensor{Shape: []int{1, 3, 5}})
	if err == nil {
		t.Fatalf("expected error for invalid shape")
	}
	badStride := after.NewWSConv2D(3, 4, 3, 2, 0)
	_, err = badStride.ForwardWithError(after.NewTensor(1, 3, 5, 5))
	if err == nil {
		t.Fatalf("expected error for stride/padding mismatch")
	}
}

// REQ-10: Handle non-divisible group counts safely.
func TestNonDivisibleGroupCountsHandled(t *testing.T) {
	if !usingAfter() {
		t.Skip("non-divisible groups requirement applies to optimized implementation")
	}
	x := after.NewTensor(1, 5, 4, 4)
	beforeData := make([]float64, len(x.Data))
	copy(beforeData, x.Data)
	gn := after.NewGroupNorm(5, 3)
	if err := gn.ForwardWithError(x); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for c := 0; c < 5; c++ {
		changed := false
		for h := 0; h < 4; h++ {
			for w := 0; w < 4; w++ {
				idx := x.Index(0, c, h, w)
				if idx >= 0 && x.Data[idx] != beforeData[idx] {
					changed = true
					break
				}
			}
			if changed {
				break
			}
		}
		if !changed {
			t.Fatalf("channel %d unchanged after group norm", c)
		}
	}
}

// REQ-11: Ensure numerical stability for zero variance cases.
func TestZeroVarianceStability(t *testing.T) {
	if usingAfter() {
		x := after.NewTensor(1, 4, 2, 2)
		for i := range x.Data {
			x.Data[i] = 3.14
		}
		gn := after.NewGroupNorm(4, 2)
		if err := gn.ForwardWithError(x); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		for i, v := range x.Data {
			if math.IsNaN(v) || math.IsInf(v, 0) {
				t.Fatalf("invalid value at %d: %v", i, v)
			}
		}
	} else {
		x := before.NewTensor(1, 4, 2, 2)
		for i := range x.Data {
			x.Data[i] = 3.14
		}
		gn := before.NewGroupNorm(4, 2)
		gn.Forward(x)
		for i, v := range x.Data {
			if math.IsNaN(v) || math.IsInf(v, 0) {
				t.Fatalf("invalid value at %d: %v", i, v)
			}
		}
	}
}

// REQ-12: Remove forced garbage collection and artificial computations.
func TestNoForcedGCOrArtificialMath(t *testing.T) {
	if !usingAfter() {
		t.Skip("code scan applies to optimized implementation")
	}
	path := getRepoPath() + "/main.go"
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read %s: %v", path, err)
	}
	src := string(content)
	if strings.Contains(src, "runtime.GC") {
		t.Fatalf("unexpected runtime.GC usage")
	}
	if strings.Contains(src, "math.Sqrt") && strings.Contains(src, "Index") {
		t.Fatalf("unexpected artificial math in Index")
	}
}
