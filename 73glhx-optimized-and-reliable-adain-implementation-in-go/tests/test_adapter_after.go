//go:build after
// +build after

package tests

import "adain-go/adain"

// TestTensor wraps the modern Tensor type from repository_after
type TestTensor = adain.Tensor

func NewTestTensor(shape []int) *TestTensor {
	return adain.NewTensor(shape)
}

func TestValidate(name string, t *TestTensor) error {
	return adain.Validate(name, t)
}

func TestComputeMeanStd(x *TestTensor, mask *TestTensor, epsilon float64) (*TestTensor, *TestTensor) {
	return adain.ComputeMeanStd(x, mask, epsilon)
}

func TestApplyAdaIN(content, style *TestTensor, alpha, epsilon float64, contentMask, styleMask *TestTensor) (*TestTensor, error) {
	return adain.ApplyAdaIN(content, style, alpha, epsilon, contentMask, styleMask)
}
