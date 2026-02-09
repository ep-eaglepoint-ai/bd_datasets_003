//go:build metabug_fixture

package ringbuf

// This fixture violates FIFO ordering by popping the most recently pushed item.

type RingBuffer struct {
	cap uint64
	stk []int
}

func NewRingBuffer(size uint64) *RingBuffer {
	return &RingBuffer{cap: size, stk: make([]int, 0, size)}
}

func (r *RingBuffer) Push(v int) bool {
	if uint64(len(r.stk)) >= r.cap {
		return false
	}
	r.stk = append(r.stk, v)
	return true
}

func (r *RingBuffer) Pop() (int, bool) {
	if len(r.stk) == 0 {
		return 0, false
	}
	// BUG: LIFO pop
	idx := len(r.stk) - 1
	v := r.stk[idx]
	r.stk = r.stk[:idx]
	return v, true
}
