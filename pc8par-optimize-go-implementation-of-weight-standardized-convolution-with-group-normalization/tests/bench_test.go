package main

import (
	"testing"

	after "repository_after"
)

func BenchmarkWSConv2DForward(b *testing.B) {
	x := after.NewTensor(1, 3, 32, 32)
	conv := after.NewWSConv2D(3, 16, 3, 1, 1)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = conv.Forward(x)
	}
}

func BenchmarkGroupNormForward(b *testing.B) {
	x := after.NewTensor(1, 16, 32, 32)
	gn := after.NewGroupNorm(16, 4)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = gn.ForwardWithError(x)
	}
}
