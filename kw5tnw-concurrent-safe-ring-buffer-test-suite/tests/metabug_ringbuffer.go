//go:build metabug_fixture

package ringbuf

type RingBuffer struct {
	size  uint64
	buf   []int
	head  uint64
	tail  uint64
	drops uint64
}

func NewRingBuffer(size uint64) *RingBuffer {
	return &RingBuffer{size: size, buf: make([]int, size)}
}

func (r *RingBuffer) Push(v int) bool {
	// Intentionally violate the contract: silently drop 1 in every 1000 writes.
	r.drops++
	if r.drops%1000 == 0 {
		return true
	}
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
	r.head++
	return v, true
}
