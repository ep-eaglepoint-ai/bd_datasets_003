package tests

import (
	"fmt"
	"sync"
	"testing"
	"time"
)

// TestReq10_Stress100ConcurrentSwaps verifies requirement 10: must pass stress test of 100+ concurrent transactions swapping assets without hanging.
func TestReq10_Stress100ConcurrentSwaps(t *testing.T) {
	tm := getManager(t)
	tx0 := tm.Begin()
	_ = tx0.Write("X", 10000)
	_ = tx0.Write("Y", 10000)
	_ = tx0.Commit()
	const N = 150
	var wg sync.WaitGroup
	for i := 0; i < N; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			tx := tm.Begin()
			_ = tx.Write("X", -10)
			_ = tx.Write("Y", 10)
			_ = tx.Commit()
		}()
	}
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(30 * time.Second):
		t.Error("stress test hung (deadlock or timeout)")
		recordResult("TestReq10_Stress100ConcurrentSwaps", false, "100+ concurrent transactions hung")
		return
	}
	txFinal := tm.Begin()
	x, _ := txFinal.Read("X")
	y, _ := txFinal.Read("Y")
	txFinal.Commit()
	expectedX := int64(10000 - 10*N)
	expectedY := int64(10000 + 10*N)
	passed := x == expectedX && y == expectedY
	var msg string
	if !passed {
		msg = fmt.Sprintf("final balances X=%d (expected %d), Y=%d (expected %d)", x, expectedX, y, expectedY)
		t.Error(msg)
	}
	recordResult("TestReq10_Stress100ConcurrentSwaps", passed, msg)
}
