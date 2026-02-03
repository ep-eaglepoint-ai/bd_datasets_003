package tests

import (
	"sync"
	"testing"
	"time"

	"repository_after/led"
)


// Req 4, 7: Concurrent SetColor and FadeTo; final SetColor(1,2,3) must be the only visible state.
func TestConcurrentSetColorAndFadeTo(t *testing.T) {
	c := led.New()
	var wg sync.WaitGroup
	done := make(chan struct{})
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-done:
					return
				default:
					c.SetColor(100, 0, 0)
					c.FadeTo(0, 100, 0, 50*time.Millisecond)
					c.SetColor(0, 0, 100)
					c.FadeTo(255, 0, 0, 30*time.Millisecond)
				}
			}
		}()
	}
	time.Sleep(100 * time.Millisecond)
	close(done)
	wg.Wait()
	c.SetColor(1, 2, 3)
	time.Sleep(100 * time.Millisecond)  exit
	buf := c.CopyBuffer()
	gr := led.Gamma(2)
	rr := led.Gamma(1)
	br := led.Gamma(3)
	const numLEDs = 100
	const bytesPerLED = 3
	for i := 0; i < numLEDs; i++ {
		idx := i * bytesPerLED
		if buf[idx+0] != gr || buf[idx+1] != rr || buf[idx+2] != br {
			RecordResult("TestConcurrentSetColorAndFadeTo", false, "torn read or ghosting")
			t.Fatalf("LED %d: got G=%d R=%d B=%d; want G=%d R=%d B=%d", i, buf[idx+0], buf[idx+1], buf[idx+2], gr, rr, br)
		}
	}
	RecordResult("TestConcurrentSetColorAndFadeTo", true, "")
}
