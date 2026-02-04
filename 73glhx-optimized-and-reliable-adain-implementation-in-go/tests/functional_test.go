package tests

import (
	"math"
	"math/rand"
	"testing"

)

// --- Reference Implementation (The "Golden" Logic) ---

type refX struct {
	D []float64
	S []int
}

func refZ(s []int) *refX {
	n := 1
	for _, v := range s {
		n *= v
	}
	return &refX{D: make([]float64, n), S: s}
}

func (x *refX) I(a, b, c, d int) int {
	return ((a*x.S[1]+b)*x.S[2]+c)*x.S[3] + d
}

func refY(f *refX, e float64, m *refX) (*refX, *refX) {
	N, C, H, W := f.S[0], f.S[1], f.S[2], f.S[3]
	u := refZ([]int{N, C, 1, 1})
	v := refZ([]int{N, C, 1, 1})

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

	o := refZ([]int{N, C, 1, 1})
	for i := 0; i < len(o.D); i++ {
		z := v.D[i]
		if z < 0 {
			z = 0
		}
		o.D[i] = math.Sqrt(z + e)
	}

	return u, o
}

func refApplyAdaIN(c *refX, s *refX, a float64, e float64, cm *refX, sm *refX) *refX {
	m1, d1 := refY(c, e, cm)
	m2, d2 := refY(s, e, sm)
	N, C, H, W := c.S[0], c.S[1], c.S[2], c.S[3]
	o := refZ([]int{N, C, H, W})

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
	return o
}

// Helper to convert adain.Tensor to refX
func toRef(t *TestTensor) *refX {
	if t == nil {
		return nil
	}
	// Manual copy to ensure independence
	d := make([]float64, len(t.Data))
	copy(d, t.Data)
	s := make([]int, len(t.Shape))
	copy(s, t.Shape)
	return &refX{D: d, S: s}
}

// --- Tests ---

const EPSILON = 1e-6

func tensorsApproxEqual(t *testing.T, got *TestTensor, ref *refX, tolerance float64) {
	t.Helper()
	if len(got.Data) != len(ref.D) {
		t.Fatalf("Data length mismatch: %d vs %d", len(got.Data), len(ref.D))
	}
	for i := range got.Data {
		diff := math.Abs(got.Data[i] - ref.D[i])
		if diff > tolerance {
			t.Errorf("Mismatch at index %d: got %v, expected %v (diff %v)", i, got.Data[i], ref.D[i], diff)
			return // Fail fast to avoid spam
		}
	}
}

func randomTensor(shape []int) *TestTensor {
	t := NewTestTensor(shape)
	for i := range t.Data {
		t.Data[i] = rand.Float64()
	}
	return t
}

func TestReq1_MeanStdCalculation(t *testing.T) {
	defer func() { RecordResult("TestReq1_MeanStdCalculation", !t.Failed(), "") }()
	// Req 1: Compute per-channel, per-sample mean and standard deviation correctly.
	rand.Seed(42)
	shape := []int{2, 3, 10, 10}
	input := randomTensor(shape)
	
	// Check against Ref
	refIn := toRef(input)
	refMean, refStd := refY(refIn, 1e-5, nil)
	
	gotMean, gotStd := TestComputeMeanStd(input, nil, 1e-5)
	
	tensorsApproxEqual(t, gotMean, refMean, 1e-5)
	tensorsApproxEqual(t, gotStd, refStd, 1e-5)
}

func TestReq2_MaskingSupport(t *testing.T) {
	defer func() { RecordResult("TestReq2_MaskingSupport", !t.Failed(), "") }()
	// Req 2: Support optional spatial masking for both content and style.
	rand.Seed(43)
	N, C, H, W := 1, 2, 4, 4
	content := randomTensor([]int{N, C, H, W})
	style := randomTensor([]int{N, C, H, W})
	
	// Create a checkerboard mask
	mask := NewTestTensor([]int{N, 1, H, W})
	for i := range mask.Data {
		if i%2 == 0 {
			mask.Data[i] = 1.0
		} else {
			mask.Data[i] = 0.0
		}
	}
	
	refContent := toRef(content)
	refStyle := toRef(style)
	refMask := toRef(mask)
	
	refOut := refApplyAdaIN(refContent, refStyle, 1.0, 1e-5, refMask, refMask)
	gotOut, err := TestApplyAdaIN(content, style, 1.0, 1e-5, mask, mask)
	
	if err != nil {
		t.Fatalf("ApplyAdaIN failed: %v", err)
	}
	
	tensorsApproxEqual(t, gotOut, refOut, 1e-5)
}

func TestReq3_AlphaBlending(t *testing.T) {
	defer func() { RecordResult("TestReq3_AlphaBlending", !t.Failed(), "") }()
	// Req 3: Preserve alpha-based blending with the original content.
	rand.Seed(44)
	content := randomTensor([]int{1, 2, 4, 4})
	style := randomTensor([]int{1, 2, 4, 4})
	
	refContent := toRef(content)
	refStyle := toRef(style)
	
	// Test alpha = 0.5
	refOut := refApplyAdaIN(refContent, refStyle, 0.5, 1e-5, nil, nil)
	gotOut, err := TestApplyAdaIN(content, style, 0.5, 1e-5, nil, nil)
	if err != nil { t.Fatal(err) }
	
	tensorsApproxEqual(t, gotOut, refOut, 1e-5)
	
	// Test alpha = 0.0 (Should be close to content, normalized/denormalized with style stats? No, formula: z = alpha * z + (1-alpha)*x)
	// Actually alpha blending happens at the end. at alpha=0, z = x.
	// Wait, the formula in Before is:
	// z = y * d2 + m2
    // if a < 1 { z = a*z + (1-a)*x }
    // So if a=0, z = x.
    
    gotZero, _ := TestApplyAdaIN(content, style, 0.0, 1e-5, nil, nil)
    // Check if gotZero is exactly content?
    // Not necessarily bitwise exact due to floats, but very close.
    xRef := toRef(content)
    tensorsApproxEqual(t, gotZero, xRef, 1e-9) 
}

func TestReq4_NumericalEquivalence(t *testing.T) {
	defer func() { RecordResult("TestReq4_NumericalEquivalence", !t.Failed(), "") }()
	// Req 4: Produce numerically equivalent outputs within floating-point tolerance.
	rand.Seed(45)
	for i := 0; i < 5; i++ {
		content := randomTensor([]int{2, 4, 16, 16})
		style := randomTensor([]int{2, 4, 16, 16})
		
		refOut := refApplyAdaIN(toRef(content), toRef(style), 1.0, 1e-5, nil, nil)
		gotOut, err := TestApplyAdaIN(content, style, 1.0, 1e-5, nil, nil)
		if err != nil { t.Fatal(err) }
		
		tensorsApproxEqual(t, gotOut, refOut, 1e-4) // Slightly looser for complex ops
	}
}

func TestReq9_ZeroMaskAndEdgeCases(t *testing.T) {
	defer func() { RecordResult("TestReq9_ZeroMaskAndEdgeCases", !t.Failed(), "") }()
	// Req 9: Handle zero-mask and edge cases without NaN or Inf.
	
	// Case 1: Zero mask (should clamp count to 1 to avoid div by zero)
	content := NewTestTensor([]int{1, 1, 2, 2})
	content.Data = []float64{1, 2, 3, 4}
	style := NewTestTensor([]int{1, 1, 2, 2})
	style.Data = []float64{1, 1, 1, 1}
	
	zeroMask := NewTestTensor([]int{1, 1, 2, 2}) // All zero
	
	out, err := TestApplyAdaIN(content, style, 1.0, 1e-5, zeroMask, zeroMask)
	if err != nil {
		t.Fatalf("Failed with zero mask: %v", err)
	}
	
	// Check for NaNs
	if err := TestValidate("out", out); err != nil {
		t.Errorf("Output contained invalid values with zero mask: %v", err)
	}
}

func TestReq10_DeterministicBehavior(t *testing.T) {
	defer func() { RecordResult("TestReq10_DeterministicBehavior", !t.Failed(), "") }()
	// Req 10: Maintain deterministic behavior for identical inputs.
	content := randomTensor([]int{1, 2, 8, 8})
	style := randomTensor([]int{1, 2, 8, 8})
	
	out1, _ := TestApplyAdaIN(content, style, 1.0, 1e-5, nil, nil)
	out2, _ := TestApplyAdaIN(content, style, 1.0, 1e-5, nil, nil)
	
	for i := range out1.Data {
		if out1.Data[i] != out2.Data[i] {
			t.Fatalf("Non-deterministic output at index %d", i)
		}
	}
}

func TestReq11_ValidationErrors(t *testing.T) {
	defer func() { RecordResult("TestReq11_ValidationErrors", !t.Failed(), "") }()
	// Req 11: Include proper shape validation and error handling.
	
	// Case 1: Nil input
	if _, err := TestApplyAdaIN(nil, nil, 1.0, 0, nil, nil); err == nil {
		t.Error("Expected error for nil input")
	}
	
	// Case 2: Channel mismatch
	c := NewTestTensor([]int{1, 3, 2, 2})
	s := NewTestTensor([]int{1, 4, 2, 2})
	if _, err := TestApplyAdaIN(c, s, 1.0, 0, nil, nil); err == nil {
		t.Error("Expected error for channel mismatch")
	}
	
	// Case 3: Invalid shape (not 4D?)
	// Hard to construct via NewTensor as it implies 4D usage usually, 
	// but if we manipulate Shape manually:
	c.Shape = []int{1, 2, 3} // Corrupt shape
	if err := TestValidate("bad", c); err == nil {
		t.Error("Expected error for non-4D shape")
	}
}
