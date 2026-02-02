package adain

import (
	"errors"
	"math"
)

type X struct {
	D []float64
	S []int
}

func Z(s []int) *X {
	n := 1
	for _, v := range s {
		n *= v
	}
	return &X{D: make([]float64, n), S: s}
}

func (x *X) I(a, b, c, d int) int {
	return ((a*x.S[1]+b)*x.S[2]+c)*x.S[3] + d
}

func Q(n string, t *X) error {
	if t == nil {
		return errors.New(n)
	}
	if len(t.S) < 3 {
		return errors.New(n)
	}
	for i := 0; i < len(t.D); i++ {
		v := t.D[i]
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return errors.New(n)
		}
	}
	return nil
}

func Y(f *X, e float64, m *X) (*X, *X) {
	N, C, H, W := f.S[0], f.S[1], f.S[2], f.S[3]
	u := Z([]int{N, C, 1, 1})
	v := Z([]int{N, C, 1, 1})

	for a := 0; a < N; a++ {
		for b := 0; b < C; b++ {
			t := 0.0
			c := 0.0
			for i := 0; i < H; i++ {
				for j := 0; j < W; j++ {
					w := f.D[f.I(a, b, i, j)]
					if m != nil {
						r := m.D[m.I(a, 0, i, j)]
						t += w * r
						c += r
					} else {
						t += w
						c++
					}
				}
			}
			if c < 1 {
				c = 1
			}
			p := t / c
			u.D[u.I(a, b, 0, 0)] = p
			s := 0.0
			for i := 0; i < H; i++ {
				for j := 0; j < W; j++ {
					w := f.D[f.I(a, b, i, j)]
					d := w - p
					if m != nil {
						r := m.D[m.I(a, 0, i, j)]
						s += d * d * r
					} else {
						s += d * d
					}
				}
			}
			v.D[v.I(a, b, 0, 0)] = s / c
		}
	}

	o := Z([]int{N, C, 1, 1})
	for i := 0; i < len(o.D); i++ {
		z := v.D[i]
		if z < 0 {
			z = 0
		}
		o.D[i] = math.Sqrt(z + e)
	}

	return u, o
}

func R(c *X, s *X, a float64, e float64, cm *X, sm *X) (*X, error) {
	if Q("c", c) != nil || Q("s", s) != nil {
		return nil, errors.New("x")
	}
	if c.S[1] != s.S[1] {
		return nil, errors.New("x")
	}

	m1, d1 := Y(c, e, cm)
	m2, d2 := Y(s, e, sm)

	N, C, H, W := c.S[0], c.S[1], c.S[2], c.S[3]
	o := Z([]int{N, C, H, W})

	for n := 0; n < N; n++ {
		for ch := 0; ch < C; ch++ {
			for i := 0; i < H; i++ {
				for j := 0; j < W; j++ {
					x := c.D[c.I(n, ch, i, j)]
					y := (x - m1.D[m1.I(n, ch, 0, 0)]) / (d1.D[d1.I(n, ch, 0, 0)] + e)
					z := y*d2.D[d2.I(n, ch, 0, 0)] + m2.D[m2.I(n, ch, 0, 0)]
					if a < 1 {
						z = a*z + (1-a)*x
					}
					o.D[o.I(n, ch, i, j)] = z
				}
			}
		}
	}

	for i := 0; i < len(o.D); i++ {
		v := o.D[i]
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return nil, errors.New("x")
		}
	}

	return o, nil
}
