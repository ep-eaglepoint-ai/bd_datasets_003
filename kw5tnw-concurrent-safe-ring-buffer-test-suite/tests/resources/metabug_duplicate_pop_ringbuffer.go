//go:build metabug_fixture

package ringbuf

// This fixture violates the contract by not advancing the head on Pop,
// causing the same value to be popped repeatedly.

type RingBuffer struct {
	size uint64
	buf  []int
	head uint64
	tail uint64
}

func NewRingBuffer(size uint64) *RingBuffer {
	return &RingBuffer{size: size, buf: make([]int, size)}
}

func (r *RingBuffer) Push(v int) bool {
	if r.tail-r.head >= r.size {
		return false
	}
	r.buf[r.tail%r.size] = v
	r.tail++
	return true
}

func (r *RingBuffer) Pop() (int, bool) {
	if r.head >= r.tail {
		return 0, false
	}
	v := r.buf[r.head%r.size]
	// BUG: do not advance head.
	return v, true
}
