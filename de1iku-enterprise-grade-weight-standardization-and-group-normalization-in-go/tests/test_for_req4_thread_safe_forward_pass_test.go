package tests

import (
	"sync"
	"testing"

	wsconv "repository_after"
)

// Req 4: Thread-safe forward pass using goroutines without data races.
func TestReq4ThreadSafeForwardPass(t *testing.T) {
	passed := true
	msg := ""
	defer func() { RecordResult("TestReq4ThreadSafeForwardPass", passed, msg) }()

	cfg := wsconv.WSConv2DConfig{
		InChannels:  1,
		OutChannels: 2,
		KernelHeight: 3,
		KernelWidth:  3,
		StrideH: 1,
		StrideW: 1,
		PaddingH: 1,
		PaddingW: 1,
		Epsilon:  1e-5,
		UseWS:    true,
	}
	layer, err := wsconv.NewWSConv2D(cfg)
	if err != nil {
		passed = false
		msg = "unexpected NewWSConv2D error: " + err.Error()
		t.Fatal(msg)
		return
	}
	input, _ := wsconv.NewTensor(2, 1, 6, 6)
	for i := range input.Data {
		input.Data[i] = float32((i*17)%11) - 5
	}

	ref, err := layer.Forward(input)
	if err != nil {
		passed = false
		msg = "unexpected Forward error (reference): " + err.Error()
		t.Fatal(msg)
		return
	}

	const workers = 20
	outs := make([]*wsconv.Tensor, workers)
	errs := make([]error, workers)

	var wg sync.WaitGroup
	wg.Add(workers)
	for i := 0; i < workers; i++ {
		go func(idx int) {
			defer wg.Done()
			outs[idx], errs[idx] = layer.Forward(input)
		}(i)
	}
	wg.Wait()

	for i := 0; i < workers; i++ {
		if errs[i] != nil {
			passed = false
			msg = "unexpected Forward error in concurrent call: " + errs[i].Error()
			t.Fatal(msg)
			return
		}
		for j := range ref.Data {
			if outs[i].Data[j] != ref.Data[j] {
				passed = false
				msg = "concurrent output differs from reference output"
				t.Fatalf("%s (worker=%d index=%d): got=%v want=%v", msg, i, j, outs[i].Data[j], ref.Data[j])
				return
			}
		}
	}
}
