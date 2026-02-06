package testing

import (
	"fmt"
	"sort"
	"sync"
)

// Operation represents a single operation in the history
type Operation struct {
	ID        int64
	Type      string // "invoke" or "ok" or "fail"
	OpType    string // "read" or "write"
	Key       string
	Value     string
	StartTime int64
	EndTime   int64
}

// History records all operations for linearizability checking
type History struct {
	mu         sync.Mutex
	operations []Operation
	nextID     int64
}

// NewHistory creates a new history recorder
func NewHistory() *History {
	return &History{
		operations: make([]Operation, 0),
	}
}

// RecordInvoke records the start of an operation
func (h *History) RecordInvoke(opType, key, value string, startTime int64) int64 {
	h.mu.Lock()
	defer h.mu.Unlock()

	id := h.nextID
	h.nextID++

	h.operations = append(h.operations, Operation{
		ID:        id,
		Type:      "invoke",
		OpType:    opType,
		Key:       key,
		Value:     value,
		StartTime: startTime,
	})

	return id
}

// RecordOk records the successful completion of an operation
func (h *History) RecordOk(id int64, value string, endTime int64) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.operations = append(h.operations, Operation{
		ID:      id,
		Type:    "ok",
		Value:   value,
		EndTime: endTime,
	})
}

// RecordFail records the failure of an operation
func (h *History) RecordFail(id int64, endTime int64) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.operations = append(h.operations, Operation{
		ID:      id,
		Type:    "fail",
		EndTime: endTime,
	})
}

// OperationPair pairs an invoke with its response
type OperationPair struct {
	Invoke   Operation
	Response Operation
	Complete bool
}

// LinearizabilityChecker verifies linearizability of a history
type LinearizabilityChecker struct {
	history *History
}

// NewLinearizabilityChecker creates a new linearizability checker
func NewLinearizabilityChecker(h *History) *LinearizabilityChecker {
	return &LinearizabilityChecker{history: h}
}

// Check performs linearizability verification
func (lc *LinearizabilityChecker) Check() (bool, error) {
	lc.history.mu.Lock()
	ops := make([]Operation, len(lc.history.operations))
	copy(ops, lc.history.operations)
	lc.history.mu.Unlock()

	// Build invoke-response pairs
	pairs := make(map[int64]*OperationPair)
	for _, op := range ops {
		if op.Type == "invoke" {
			pairs[op.ID] = &OperationPair{
				Invoke: op,
			}
		} else if op.Type == "ok" {
			if pair, ok := pairs[op.ID]; ok {
				pair.Response = op
				pair.Complete = true
			}
		}
	}

	// Extract complete operations
	complete := make([]*OperationPair, 0)
	for _, pair := range pairs {
		if pair.Complete {
			complete = append(complete, pair)
		}
	}

	// Sort by start time
	sort.Slice(complete, func(i, j int) bool {
		return complete[i].Invoke.StartTime < complete[j].Invoke.StartTime
	})

	// Simple sequential consistency check for key-value store
	state := make(map[string]string)

	for _, pair := range complete {
		if pair.Invoke.OpType == "write" {
			state[pair.Invoke.Key] = pair.Invoke.Value
		} else if pair.Invoke.OpType == "read" {
			expected := state[pair.Invoke.Key]
			if pair.Response.Value != expected {
				// Check if there's a concurrent write that could explain this
				if !lc.hasConcurrentWrite(complete, pair, pair.Response.Value) {
					return false, fmt.Errorf("read of %s returned %s, expected %s",
						pair.Invoke.Key, pair.Response.Value, expected)
				}
			}
		}
	}

	return true, nil
}

func (lc *LinearizabilityChecker) hasConcurrentWrite(ops []*OperationPair, readOp *OperationPair, value string) bool {
	for _, op := range ops {
		if op.Invoke.OpType == "write" &&
			op.Invoke.Key == readOp.Invoke.Key &&
			op.Invoke.Value == value {
			// Check if operations overlap in time
			if op.Invoke.StartTime <= readOp.Response.EndTime &&
				op.Response.EndTime >= readOp.Invoke.StartTime {
				return true
			}
		}
	}
	return false
}