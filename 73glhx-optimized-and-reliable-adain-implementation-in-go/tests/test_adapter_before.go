//go:build !after
// +build !after

package tests

import "adain-go/adain"

// TestTensor wraps the legacy X type from repository_before
type TestTensor struct {
	Data  []float64
	Shape []int
}

func (t *TestTensor) Index(n, c, h, w int) int {
	return ((n*t.Shape[1] + c) * t.Shape[2] + h) * t.Shape[3] + w
}

func (t *TestTensor) toX() *adain.X {
	if t == nil {
		return nil
	}
	return &adain.X{D: t.Data, S: t.Shape}
}

func fromX(x *adain.X) *TestTensor {
	if x == nil {
		return nil
	}
	return &TestTensor{Data: x.D, Shape: x.S}
}

func NewTestTensor(shape []int) *TestTensor {
	return fromX(adain.Z(shape))
}

func TestValidate(name string, t *TestTensor) error {
	return adain.Q(name, t.toX())
}

func TestComputeMeanStd(x *TestTensor, mask *TestTensor, epsilon float64) (*TestTensor, *TestTensor) {
	var maskX *adain.X
	if mask != nil {
		maskX = mask.toX()
	}
	m, s := adain.Y(x.toX(), epsilon, maskX)
	return fromX(m), fromX(s)
}

func TestApplyAdaIN(content, style *TestTensor, alpha, epsilon float64, contentMask, styleMask *TestTensor) (*TestTensor, error) {
	var cMask, sMask *adain.X
	if contentMask != nil {
		cMask = contentMask.toX()
	}
	if styleMask != nil {
		sMask = styleMask.toX()
	}
	res, err := adain.R(content.toX(), style.toX(), alpha, epsilon, cMask, sMask)
	return fromX(res), err
}
