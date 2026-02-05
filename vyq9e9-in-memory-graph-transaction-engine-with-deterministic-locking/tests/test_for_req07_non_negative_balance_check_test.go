package tests

import (
	"fmt"
	"testing"
)

// TestReq07_NonNegativeBalanceCheck verifies requirement 7: must check invariant constraints (e.g. Balance >= 0) before applying writes.
func TestReq07_NonNegativeBalanceCheck(t *testing.T) {
	tm := getManager(t)
	// Single-node negative: Commit must fail and leave state unchanged.
	tx0 := tm.Begin()
	_ = tx0.Write("C", 0)
	_ = tx0.Commit()
	tx := tm.Begin()
	_ = tx.Write("C", -100)
	err := tx.Commit()
	passed := err != nil
	tx2 := tm.Begin()
	bal, _ := tx2.Read("C")
	tx2.Commit()
	passed = passed && bal == 0
	var msg string
	if !passed {
		msg = fmt.Sprintf("Commit should fail for negative balance and leave global state unchanged; err=%v balance=%d", err, bal)
		t.Error(msg)
	}
	// Multi-node: one node would go negative (M: 10-15=-5); entire commit must fail and leave all nodes unchanged.
	tx3 := tm.Begin()
	_ = tx3.Write("M", 10)
	_ = tx3.Write("N", 0)
	_ = tx3.Commit()
	tx4 := tm.Begin()
	_ = tx4.Write("M", -15) // M would become 10-15 = -5
	_ = tx4.Write("N", 10)  // N would become 0+10 = 10
	err4 := tx4.Commit()
	if err4 == nil {
		passed = false
		msg = "Commit must fail when any node would go negative; multi-node tx with M=-15 N=+10 should fail (M would be -5)"
		t.Error(msg)
	}
	tx5 := tm.Begin()
	m, _ := tx5.Read("M")
	n, _ := tx5.Read("N")
	tx5.Commit()
	if m != 10 || n != 0 {
		passed = false
		msg = fmt.Sprintf("After failed multi-node commit, state must be unchanged; got M=%d N=%d, want 10 0", m, n)
		t.Error(msg)
	}
	recordResult("TestReq07_NonNegativeBalanceCheck", passed, msg)
}
