// filename: ringbuffer.go
package ringbuf

import (
	"runtime"
	"sync/atomic"
	"unsafe"
)

// RingBuffer is a fixed-size circular buffer using CAS for thread safety.
type RingBuffer struct {
	buffer []unsafe.Pointer
	mask   uint64
	head   uint64
	tail   uint64
	size   uint64
}

// NewRingBuffer creates a new buffer. Size must be a power of 2.
func NewRingBuffer(size uint64) *RingBuffer {
	if size&(size-1) != 0 {
		panic("size must be a power of 2")
	}
	return &RingBuffer{
		buffer: make([]unsafe.Pointer, size),
		mask:   size - 1,
		size:   size,
	}
}

// Push adds an item to the buffer. Returns false if full.
// Uses atomic CAS to reserve a slot and store data.
func (r *RingBuffer) Push(val int) bool {
	valPtr := unsafe.Pointer(uintptr(val))
	for {
		tail := atomic.LoadUint64(&r.tail)
		head := atomic.LoadUint64(&r.head)

		if tail-head >= r.size {
			return false // Buffer is full
		}

		// Attempt to reserve the slot
		if atomic.CompareAndSwapUint64(&r.tail, tail, tail+1) {
			// Slot reserved. Write the data.
			// specific slot index
			idx := tail & r.mask
			atomic.StorePointer(&r.buffer[idx], valPtr)
			return true
		}
		// CAS failed, retry
		runtime.Gosched()
	}
}

// Pop removes an item. Returns value and true, or 0 and false if empty.
func (r *RingBuffer) Pop() (int, bool) {
	for {
		head := atomic.LoadUint64(&r.head)
		tail := atomic.LoadUint64(&r.tail)

		if head >= tail {
			return 0, false // Buffer is empty
		}

		// Attempt to claim the item
		idx := head & r.mask
		valPtr := atomic.LoadPointer(&r.buffer[idx])

		if valPtr == nil {
			// Writer reserved slot but hasn't written yet. Yield and retry.
			runtime.Gosched()
			continue
		}

		if atomic.CompareAndSwapUint64(&r.head, head, head+1) {
			// Item claimed. Clear the slot for GC/safety (optional in pure int ring, but good practice)
			atomic.StorePointer(&r.buffer[idx], nil)
			return int(uintptr(valPtr)), true
		}
		// CAS failed, retry
		runtime.Gosched()
	}
}
