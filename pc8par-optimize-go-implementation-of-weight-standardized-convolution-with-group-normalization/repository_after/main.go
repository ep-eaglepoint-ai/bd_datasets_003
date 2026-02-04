package repository_after

import (
	"errors"
	"fmt"
	m "math"
)

const (
	weightStdEps = 1e-9
	groupNormEps = 1e-6
)

// Tensor is a simple N-dimensional tensor stored in contiguous row-major order.
type Tensor struct {
	Data    []float64
	Shape   []int
	strides []int
}

// NewTensor allocates a tensor and fills it deterministically with sin*cos data.
func NewTensor(shape ...int) *Tensor {
	return newTensor(shape, true)
}

func newTensor(shape []int, fill bool) *Tensor {
	if len(shape) == 0 {
		return &Tensor{Data: nil, Shape: []int{}, strides: []int{}}
	}
	size := 1
	for _, v := range shape {
		if v <= 0 {
			return &Tensor{Data: nil, Shape: append([]int{}, shape...), strides: make([]int, len(shape))}
		}
		size *= v
	}

	data := make([]float64, size)
	if fill {
		for i := 0; i < size; i++ {
			v := float64(i)
			data[i] = m.Sin(v) * m.Cos(v)
		}
	}

	strides := make([]int, len(shape))
	stride := 1
	for i := len(shape) - 1; i >= 0; i-- {
		strides[i] = stride
		stride *= shape[i]
	}

	return &Tensor{
		Data:    data,
		Shape:   append([]int{}, shape...),
		strides: strides,
	}
}

func (t *Tensor) ensureStrides() {
	if len(t.strides) == len(t.Shape) {
		return
	}
	strides := make([]int, len(t.Shape))
	stride := 1
	for i := len(t.Shape) - 1; i >= 0; i-- {
		strides[i] = stride
		stride *= t.Shape[i]
	}
	t.strides = strides
}

func (t *Tensor) Index(idxs ...int) int {
	if len(idxs) != len(t.Shape) {
		return -1
	}
	t.ensureStrides()
	result := 0
	for i := 0; i < len(t.Shape); i++ {
		v := idxs[i]
		if v < 0 || v >= t.Shape[i] {
			return -1
		}
		result += v * t.strides[i]
	}
	return result
}

func (t *Tensor) index4(n, c, h, w int) int {
	return n*t.strides[0] + c*t.strides[1] + h*t.strides[2] + w*t.strides[3]
}

// WSConv2D performs weight-standardized convolution.
type WSConv2D struct {
	InC, OutC int
	K, S, P   int
	Weights   []float64
	Bias      []float64

	ws         []float64
	wsValid    bool
	kernelSize int
}

// NewWSConv2D constructs a deterministic WSConv2D layer.
func NewWSConv2D(inC, outC, k, s, p int) *WSConv2D {
	w := make([]float64, inC*outC*k*k)
	b := make([]float64, outC)

	seed := uint32(1)
	const invUint32 = 1.0 / 4294967295.0
	for i := range w {
		seed = seed*1664525 + 1013904223
		w[i] = float64(seed) * invUint32
	}

	return &WSConv2D{
		InC:        inC,
		OutC:       outC,
		K:          k,
		S:          s,
		P:          p,
		Weights:    w,
		Bias:       b,
		kernelSize: inC * k * k,
	}
}

// Prepare recomputes standardized weights if needed.
func (c *WSConv2D) Prepare() {
	_ = c.standardizeWeights()
}

// Invalidate clears standardized weight cache if weights are modified.
func (c *WSConv2D) Invalidate() {
	c.wsValid = false
}

func (c *WSConv2D) standardizeWeights() []float64 {
	if c.kernelSize != c.InC*c.K*c.K {
		c.kernelSize = c.InC * c.K * c.K
		c.wsValid = false
	}
	if c.ws == nil || len(c.ws) != len(c.Weights) {
		c.ws = make([]float64, len(c.Weights))
		c.wsValid = false
	}
	if c.wsValid {
		return c.ws
	}

	kSize := c.kernelSize
	for oc := 0; oc < c.OutC; oc++ {
		start := oc * kSize
		end := start + kSize

		var mean float64
		for i := start; i < end; i++ {
			mean += c.Weights[i]
		}
		mean /= float64(kSize)

		var variance float64
		for i := start; i < end; i++ {
			d := c.Weights[i] - mean
			variance += d * d
		}

		std := m.Sqrt(variance/float64(kSize) + weightStdEps)
		invStd := 1.0 / std
		for i := start; i < end; i++ {
			c.ws[i] = (c.Weights[i] - mean) * invStd
		}
	}

	c.wsValid = true
	return c.ws
}

// Forward runs convolution and returns the output tensor. Errors are ignored and return an empty tensor.
func (c *WSConv2D) Forward(x *Tensor) *Tensor {
	y, _ := c.ForwardWithError(x)
	return y
}

// ForwardWithError runs convolution and returns an error for invalid shapes or parameters.
func (c *WSConv2D) ForwardWithError(x *Tensor) (*Tensor, error) {
	if x == nil || len(x.Shape) != 4 {
		return newTensor([]int{}, false), errors.New("input tensor must be 4D NCHW")
	}
	if c.InC <= 0 || c.OutC <= 0 || c.K <= 0 || c.S <= 0 || c.P < 0 {
		return newTensor([]int{}, false), errors.New("invalid convolution parameters")
	}

	N, C, H, W := x.Shape[0], x.Shape[1], x.Shape[2], x.Shape[3]
	if C != c.InC {
		return newTensor([]int{}, false), errors.New("input channel mismatch")
	}

	outH := (H + 2*c.P - c.K)
	outW := (W + 2*c.P - c.K)
	if outH < 0 || outW < 0 {
		return newTensor([]int{}, false), errors.New("kernel larger than input")
	}
	if c.S > 1 && c.P == 0 {
		return newTensor([]int{}, false), errors.New("invalid stride/padding combination")
	}
	outH = outH/c.S + 1
	outW = outW/c.S + 1

	ws := c.standardizeWeights()
	if len(ws) != len(c.Weights) {
		return newTensor([]int{}, false), errors.New("weight standardization failed")
	}

	y := newTensor([]int{N, c.OutC, outH, outW}, false)
	if len(y.Data) == 0 {
		return y, errors.New("failed to allocate output")
	}

	x.ensureStrides()
	y.ensureStrides()

	xStrideN := x.strides[0]
	xStrideC := x.strides[1]
	xStrideH := x.strides[2]
	xStrideW := x.strides[3]

	yStrideN := y.strides[0]
	yStrideC := y.strides[1]
	yStrideH := y.strides[2]
	yStrideW := y.strides[3]

	k := c.K
	kSquare := k * k
	kernelSize := c.kernelSize

	for n := 0; n < N; n++ {
		xBaseN := n * xStrideN
		yBaseN := n * yStrideN
		for oc := 0; oc < c.OutC; oc++ {
			wBaseOC := oc * kernelSize
			yBaseOC := yBaseN + oc*yStrideC
			bias := c.Bias[oc]
			for oh := 0; oh < outH; oh++ {
				ihBase := oh*c.S - c.P
				yBaseOH := yBaseOC + oh*yStrideH
				for ow := 0; ow < outW; ow++ {
					iwBase := ow*c.S - c.P
					sum := 0.0
					for ic := 0; ic < C; ic++ {
						xBaseC := xBaseN + ic*xStrideC
						wBaseIC := wBaseOC + ic*kSquare
						for kh := 0; kh < k; kh++ {
							ih := ihBase + kh
							if ih < 0 || ih >= H {
								continue
							}
							xBaseH := xBaseC + ih*xStrideH
							wBaseKH := wBaseIC + kh*k
							for kw := 0; kw < k; kw++ {
								iw := iwBase + kw
								if iw < 0 || iw >= W {
									continue
								}
								xIdx := xBaseH + iw*xStrideW
								wIdx := wBaseKH + kw
								sum += ws[wIdx] * x.Data[xIdx]
							}
						}
					}
					yIdx := yBaseOH + ow*yStrideW
					y.Data[yIdx] = sum + bias
				}
			}
		}
	}

	return y, nil
}

// GroupNorm performs group normalization over channel groups.
type GroupNorm struct {
	Groups int
	Gamma  []float64
	Beta   []float64
}

func NewGroupNorm(ch, g int) *GroupNorm {
	gamma := make([]float64, ch)
	beta := make([]float64, ch)
	for i := range gamma {
		gamma[i] = 1
	}
	return &GroupNorm{Groups: g, Gamma: gamma, Beta: beta}
}

// Forward applies group normalization; errors are ignored.
func (gn *GroupNorm) Forward(x *Tensor) {
	_ = gn.ForwardWithError(x)
}

// ForwardWithError applies group normalization and returns an error on invalid shapes.
func (gn *GroupNorm) ForwardWithError(x *Tensor) error {
	if x == nil || len(x.Shape) != 4 {
		return errors.New("input tensor must be 4D NCHW")
	}
	N, C, H, W := x.Shape[0], x.Shape[1], x.Shape[2], x.Shape[3]
	if C <= 0 || H <= 0 || W <= 0 {
		return errors.New("invalid input shape")
	}
	if gn.Groups <= 0 {
		return errors.New("groups must be positive")
	}
	if len(gn.Gamma) < C || len(gn.Beta) < C {
		return errors.New("gamma/beta length mismatch")
	}

	groups := gn.Groups
	if groups > C {
		groups = C
	}

	base := C / groups
	rem := C % groups

	x.ensureStrides()
	xStrideN := x.strides[0]
	xStrideC := x.strides[1]
	xStrideH := x.strides[2]
	xStrideW := x.strides[3]

	for n := 0; n < N; n++ {
		cStart := 0
		xBaseN := n * xStrideN
		for g := 0; g < groups; g++ {
			size := base
			if g < rem {
				size++
			}
			cEnd := cStart + size
			if size == 0 {
				continue
			}

			var mean float64
			count := float64(size * H * W)
			for c := cStart; c < cEnd; c++ {
				xBaseC := xBaseN + c*xStrideC
				for h := 0; h < H; h++ {
					xBaseH := xBaseC + h*xStrideH
					for w := 0; w < W; w++ {
						idx := xBaseH + w*xStrideW
						mean += x.Data[idx]
					}
				}
			}
			mean /= count

			var varSum float64
			for c := cStart; c < cEnd; c++ {
				xBaseC := xBaseN + c*xStrideC
				for h := 0; h < H; h++ {
					xBaseH := xBaseC + h*xStrideH
					for w := 0; w < W; w++ {
						idx := xBaseH + w*xStrideW
						d := x.Data[idx] - mean
						varSum += d * d
					}
				}
			}

			std := m.Sqrt(varSum/count + groupNormEps)
			if std == 0 {
				std = 1
			}
			invStd := 1.0 / std

			for c := cStart; c < cEnd; c++ {
				xBaseC := xBaseN + c*xStrideC
				gamma := gn.Gamma[c]
				beta := gn.Beta[c]
				for h := 0; h < H; h++ {
					xBaseH := xBaseC + h*xStrideH
					for w := 0; w < W; w++ {
						idx := xBaseH + w*xStrideW
						x.Data[idx] = (x.Data[idx]-mean)*invStd*gamma + beta
					}
				}
			}

			cStart = cEnd
		}
	}

	return nil
}

func main() {
	x := NewTensor(1, 3, 224, 224)

	conv := NewWSConv2D(3, 64, 3, 1, 1)
	gn := NewGroupNorm(64, 32)

	y, err := conv.ForwardWithError(x)
	if err != nil {
		fmt.Println("Forward error:", err)
		return
	}
	if err := gn.ForwardWithError(y); err != nil {
		fmt.Println("GroupNorm error:", err)
		return
	}

	fmt.Println("Forward pass complete")
	fmt.Println("Output shape:", y.Shape)
}
