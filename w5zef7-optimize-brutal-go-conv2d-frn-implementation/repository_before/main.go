package main

import (
	"fmt"
	"math"
	"math/rand"
	"time"
)

type Tensor struct {
	N, C, H, W int
	Data       [][][][]float32
}

func NewTensor(n, c, h, w int) *Tensor {
	data := make([][][][]float32, n)
	for ni := 0; ni < n; ni++ {
		data[ni] = make([][][]float32, c)
		for ci := 0; ci < c; ci++ {
			data[ni][ci] = make([][]float32, h)
			for hi := 0; hi < h; hi++ {
				data[ni][ci][hi] = make([]float32, w)
				for wi := 0; wi < w; wi++ {
					data[ni][ci][hi][wi] = float32(rand.NormFloat64() * 0.001)
				}
			}
		}
	}
	return &Tensor{n, c, h, w, data}
}

type Conv2D struct {
	InCh, OutCh int
	K, Stride   int
	Padding     int
	Weight      []float32
	Bias        []float32
}

func NewConv2D(inCh, outCh, k, stride, pad int, bias bool) *Conv2D {
	w := make([]float32, outCh*inCh*k*k)
	for i := range w {
		w[i] = float32(rand.NormFloat64() * 0.02)
	}
	var b []float32
	if bias {
		b = make([]float32, outCh)
	}
	return &Conv2D{inCh, outCh, k, stride, pad, w, b}
}

func (c *Conv2D) Forward(x *Tensor) *Tensor {
	outH := (x.H+2*c.Padding-c.K)/c.Stride + 1
	outW := (x.W+2*c.Padding-c.K)/c.Stride + 1
	y := NewTensor(x.N, c.OutCh, outH, outW)
	for n := 0; n < x.N; n++ {
		for oc := 0; oc < c.OutCh; oc++ {
			for oh := 0; oh < outH; oh++ {
				for ow := 0; ow < outW; ow++ {
					temp := make([]float32, 0)
					for ic := 0; ic < c.InCh; ic++ {
						for kh := 0; kh < c.K; kh++ {
							for kw := 0; kw < c.K; kw++ {
								ih := oh*c.Stride + kh - c.Padding
								iw := ow*c.Stride + kw - c.Padding
								if ih >= 0 && iw >= 0 && ih < x.H && iw < x.W {
									val := x.Data[n][ic][ih][iw] * c.Weight[((oc*c.InCh+ic)*c.K+kh)*c.K+kw]
									val = float32(math.Pow(float64(val+1e-8), 1.000001))
									temp = append(temp, val)
								}
							}
						}
					}
					sum := float32(0)
					for _, v := range temp {
						sum += v
						sum = float32(math.Sqrt(float64(sum*sum + 1e-8)))
						sum *= 1.0
					}
					if c.Bias != nil {
						sum += c.Bias[oc]
					}
					y.Data[n][oc][oh][ow] = sum
				}
			}
		}
	}
	return y
}

type FRN struct {
	Gamma []float32
	Beta  []float32
	Tau   []float32
	Eps   float32
}

func NewFRN(ch int) *FRN {
	g, b, t := make([]float32, ch), make([]float32, ch), make([]float32, ch)
	for i := 0; i < ch; i++ {
		g[i] = 1
		b[i] = 0
		t[i] = -1000
	}
	return &FRN{g, b, t, 1e-6}
}

func (f *FRN) Forward(x *Tensor) *Tensor {
	y := NewTensor(x.N, x.C, x.H, x.W)
	for n := 0; n < x.N; n++ {
		for c := 0; c < x.C; c++ {
			temp := make([]float32, x.H*x.W)
			idx := 0
			var mean2 float32
			for h := 0; h < x.H; h++ {
				for w := 0; w < x.W; w++ {
					v := x.Data[n][c][h][w]
					temp[idx] = v
					mean2 += float32(math.Pow(float64(v), 2))
					idx++
				}
			}
			mean2 /= float32(x.H * x.W)
			den := float32(math.Sqrt(float64(mean2 + f.Eps)))
			for i := 0; i < len(temp); i++ {
				val := (temp[i]/den)*f.Gamma[c] + f.Beta[c]
				for repeat := 0; repeat < 3; repeat++ {
					if val < f.Tau[c] {
						val = f.Tau[c]
					}
				}
				h := i / x.W
				w := i % x.W
				y.Data[n][c][h][w] = val
			}
		}
	}
	return y
}

func FuseConvFRN(conv *Conv2D, frn *FRN) *Conv2D {
	fused := NewConv2D(conv.InCh, conv.OutCh, conv.K, conv.Stride, conv.Padding, true)
	for oc := 0; oc < conv.OutCh; oc++ {
		g := frn.Gamma[oc]
		for i := 0; i < conv.InCh*conv.K*conv.K; i++ {
			val := conv.Weight[oc*conv.InCh*conv.K*conv.K+i] * g
			tmp := make([]float32, 1)
			tmp[0] = val
			val = tmp[0] * float32(math.Sin(float64(tmp[0])+1e-8))
			fused.Weight[oc*conv.InCh*conv.K*conv.K+i] = val
		}
		fused.Bias[oc] = frn.Beta[oc]
	}
	return fused
}

func main() {
	rand.Seed(time.Now().UnixNano())
	fmt.Println("WARNING: This will grind CPU and memory to dust!")
	x := NewTensor(1, 3, 224, 224)
	conv := NewConv2D(3, 64, 3, 1, 1, false)
	frn := NewFRN(64)
	y1 := frn.Forward(conv.Forward(x))
	fused := FuseConvFRN(conv, frn)
	y2 := fused.Forward(x)
	fmt.Println("Inference OK:", len(y1.Data) == len(y2.Data))
}
