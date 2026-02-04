package adain

import (
	"errors"
	"math"
)

// Tensor represents a 4D tensor: [N, C, H, W]
type Tensor struct {
	Data  []float64
	Shape []int
}

// NewTensor creates a zero-initialized tensor with the given shape
func NewTensor(shape []int) *Tensor {
	size := 1
	for _, v := range shape {
		size *= v
	}
	return &Tensor{Data: make([]float64, size), Shape: shape}
}

// Index converts 4D indices to flat index
func (t *Tensor) Index(n, c, h, w int) int {
	return ((n*t.Shape[1] + c) * t.Shape[2] + h) * t.Shape[3] + w
}

// Validate ensures tensor is non-nil, has enough dimensions, and no NaN/Inf
func Validate(name string, t *Tensor) error {
	if t == nil {
		return errors.New(name + " is nil")
	}
	if len(t.Shape) != 4 {
		return errors.New(name + " must be 4D")
	}
	for i, v := range t.Data {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return errors.New(name + " contains invalid value at index " + string(i))
		}
	}
	return nil
}

// ComputeMeanStd computes per-sample, per-channel mean and std over spatial dims with optional mask
func ComputeMeanStd(x *Tensor, mask *Tensor, epsilon float64) (*Tensor, *Tensor) {
	N, C, H, W := x.Shape[0], x.Shape[1], x.Shape[2], x.Shape[3]
	mean := NewTensor([]int{N, C, 1, 1})
	std := NewTensor([]int{N, C, 1, 1})

	spatialSize := H * W
	for n := 0; n < N; n++ {
		for c := 0; c < C; c++ {
			sum, weight := 0.0, 0.0
			offset := x.Index(n, c, 0, 0)
			for i := 0; i < spatialSize; i++ {
				val := x.Data[offset+i]
				w := 1.0
				if mask != nil {
					w = mask.Data[mask.Index(n, 0, i/H, i%W)]
				}
				sum += val * w
				weight += w
			}
			if weight < 1 {
				weight = 1
			}
			m := sum / weight
			mean.Data[mean.Index(n, c, 0, 0)] = m

			varSum := 0.0
			for i := 0; i < spatialSize; i++ {
				val := x.Data[offset+i]
				diff := val - m
				w := 1.0
				if mask != nil {
					w = mask.Data[mask.Index(n, 0, i/H, i%W)]
				}
				varSum += diff * diff * w
			}
			std.Data[std.Index(n, c, 0, 0)] = math.Sqrt(math.Max(varSum/weight, 0) + epsilon)
		}
	}
	return mean, std
}

// ApplyAdaIN normalizes content tensor, applies style stats, and alpha blending
func ApplyAdaIN(content, style *Tensor, alpha, epsilon float64, contentMask, styleMask *Tensor) (*Tensor, error) {
	if err := Validate("content", content); err != nil {
		return nil, err
	}
	if err := Validate("style", style); err != nil {
		return nil, err
	}
	if content.Shape[1] != style.Shape[1] {
		return nil, errors.New("channel mismatch")
	}

	meanC, stdC := ComputeMeanStd(content, contentMask, epsilon)
	meanS, stdS := ComputeMeanStd(style, styleMask, epsilon)

	N, C, H, W := content.Shape[0], content.Shape[1], content.Shape[2], content.Shape[3]
	out := NewTensor([]int{N, C, H, W})

	for n := 0; n < N; n++ {
		for c := 0; c < C; c++ {
			mc := meanC.Data[meanC.Index(n, c, 0, 0)]
			sc := stdC.Data[stdC.Index(n, c, 0, 0)]
			ms := meanS.Data[meanS.Index(n, c, 0, 0)]
			ss := stdS.Data[stdS.Index(n, c, 0, 0)]

			offset := content.Index(n, c, 0, 0)
			for i := 0; i < H*W; i++ {
				val := content.Data[offset+i]
				normalized := (val - mc) / (sc + epsilon)
				styled := normalized*ss + ms
				if alpha < 1 {
					styled = alpha*styled + (1-alpha)*val
				}
				out.Data[offset+i] = styled
			}
		}
	}

	// Final NaN/Inf check
	for i, v := range out.Data {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return nil, errors.New("output contains invalid value at index " + string(i))
		}
	}
	return out, nil
}
