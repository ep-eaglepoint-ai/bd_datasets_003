package led

import (
	"context"
	"sync"
	"time"
)

const numLEDs = 100
const bytesPerLED = 3
const fadeStepInterval = 20 * time.Millisecond

// LEDController manages a byte slice representing the color state (GRB order) of 100 addressable LEDs.
// It is thread-safe and supports preemption of long-running fades by new commands.
type LEDController struct {
	mu         sync.Mutex
	buffer     []byte // 100 LEDs × 3 bytes, Green-Red-Blue order
	cancel     context.CancelFunc
	generation uint64 // incremented on cancel so stale fade goroutines skip their write
}

// New returns a new LEDController with a buffer for 100 LEDs (300 bytes) in GRB order.
func New() *LEDController {
	return &LEDController{
		buffer: make([]byte, numLEDs*bytesPerLED),
	}
}

// cancelActive stops any running fade goroutine and increments generation so stale fades skip their write.
func (c *LEDController) cancelActive() {
	c.mu.Lock()
	if c.cancel != nil {
		c.cancel()
		c.cancel = nil
	}
	c.generation++
	c.mu.Unlock()
}

// writeAll sets all LEDs to the given color with gamma correction and GRB order.
// If gen > 0, writeAll only writes when c.generation == gen (fade path); otherwise it skips (stale fade).
// If gen == 0, writeAll always writes (SetColor path). Caller must not hold c.mu; writeAll acquires it.
func (c *LEDController) writeAll(gen uint64, r, g, b uint8) {
	gr := Gamma(g)
	rr := Gamma(r)
	br := Gamma(b)
	c.mu.Lock()
	defer c.mu.Unlock()
	if gen != 0 && c.generation != gen {
		return
	}
	for i := 0; i < numLEDs; i++ {
		idx := i * bytesPerLED
		c.buffer[idx+0] = gr // G
		c.buffer[idx+1] = rr // R
		c.buffer[idx+2] = br // B
	}
}

// SetColor instantly sets all LEDs to the given color. It cancels any active fade and does not block.
func (c *LEDController) SetColor(r, g, b uint8) {
	c.cancelActive()
	c.writeAll(0, r, g, b)
}

// currentColor returns the current color of the first pixel (GRB) for fade start. Call with c.mu held.
func (c *LEDController) currentColor() (r, g, b uint8) {
	if len(c.buffer) >= bytesPerLED {
		g = c.buffer[0]
		r = c.buffer[1]
		b = c.buffer[2]
	}
	return r, g, b
}

// FadeTo smoothly transitions from the current color to (r, g, b) over duration.
// It returns immediately; the transition runs asynchronously. Any previous fade is cancelled.
func (c *LEDController) FadeTo(r, g, b uint8, duration time.Duration) {
	c.cancelActive()

	c.mu.Lock()
	startR, startG, startB := c.currentColor()
	ctx, cancel := context.WithCancel(context.Background())
	c.cancel = cancel
	gen := c.generation
	c.mu.Unlock()

	steps := int(duration / fadeStepInterval)
	if steps < 1 {
		steps = 1
	}

	go func() {
		ticker := time.NewTicker(fadeStepInterval)
		defer ticker.Stop()
		for i := 0; i <= steps; i++ {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if ctx.Err() != nil {
					return
				}
				ir := interpolate(startR, r, i, steps)
				ig := interpolate(startG, g, i, steps)
				ib := interpolate(startB, b, i, steps)
				c.writeAll(gen, ir, ig, ib)
			}
		}
	}()
}

func interpolate(start, end uint8, i, steps int) uint8 {
	if steps <= 0 {
		return end
	}
	s := int(start)
	e := int(end)
	return uint8(s + (e-s)*i/steps)
}

// CopyBuffer returns a copy of the internal buffer for testing. Safe to call from tests under race detector.
func (c *LEDController) CopyBuffer() []byte {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([]byte, len(c.buffer))
	copy(out, c.buffer)
	return out
}
