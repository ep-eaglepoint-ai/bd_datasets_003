package testing

import (
	"fmt"
	"sync"

	"github.com/vzdtic/distributed-consensus-raft-kv-store/repository_after/pkg/raft"
)

// CommittedEntry represents a committed log entry
type CommittedEntry struct {
	Index   uint64
	Term    uint64
	Command raft.Command
	NodeID  string
}

// InvariantChecker checks Raft safety invariants
type InvariantChecker struct {
	mu              sync.Mutex
	committedByNode map[string][]CommittedEntry
	violations      []InvariantViolation
}

// InvariantViolation represents a safety violation
type InvariantViolation struct {
	Type        string
	Description string
	Details     map[string]interface{}
}

// NewInvariantChecker creates a new invariant checker
func NewInvariantChecker() *InvariantChecker {
	return &InvariantChecker{
		committedByNode: make(map[string][]CommittedEntry),
		violations:      make([]InvariantViolation, 0),
	}
}

// RecordCommit records a committed entry from a node
func (ic *InvariantChecker) RecordCommit(nodeID string, index, term uint64, cmd raft.Command) {
	ic.mu.Lock()
	defer ic.mu.Unlock()

	entry := CommittedEntry{
		Index:   index,
		Term:    term,
		Command: cmd,
		NodeID:  nodeID,
	}

	ic.committedByNode[nodeID] = append(ic.committedByNode[nodeID], entry)
}

// CheckSafetyInvariants checks all safety invariants
func (ic *InvariantChecker) CheckSafetyInvariants() (bool, []InvariantViolation) {
	ic.mu.Lock()
	defer ic.mu.Unlock()

	ic.violations = make([]InvariantViolation, 0)

	// Check: No two nodes commit different values at the same index
	ic.checkLogMatchingSafety()

	// Check: Committed entries are never lost (monotonic commit)
	ic.checkMonotonicCommit()

	// Check: Term numbers are consistent
	ic.checkTermConsistency()

	return len(ic.violations) == 0, ic.violations
}

// checkLogMatchingSafety verifies that all nodes have the same value at each committed index
func (ic *InvariantChecker) checkLogMatchingSafety() {
	// Build index -> (nodeID -> entry) map
	indexEntries := make(map[uint64]map[string]CommittedEntry)

	for nodeID, entries := range ic.committedByNode {
		for _, entry := range entries {
			if indexEntries[entry.Index] == nil {
				indexEntries[entry.Index] = make(map[string]CommittedEntry)
			}
			indexEntries[entry.Index][nodeID] = entry
		}
	}

	// Check each index for consistency
	for index, nodeEntries := range indexEntries {
		var refEntry *CommittedEntry
		var refNodeID string

		for nodeID, entry := range nodeEntries {
			if refEntry == nil {
				refEntry = &entry
				refNodeID = nodeID
			} else {
				// Check if entries match
				if entry.Term != refEntry.Term {
					ic.violations = append(ic.violations, InvariantViolation{
						Type: "LOG_MATCHING_VIOLATION",
						Description: fmt.Sprintf("Different terms at index %d: node %s has term %d, node %s has term %d",
							index, refNodeID, refEntry.Term, nodeID, entry.Term),
						Details: map[string]interface{}{
							"index":     index,
							"node1":     refNodeID,
							"term1":     refEntry.Term,
							"node2":     nodeID,
							"term2":     entry.Term,
							"command1":  refEntry.Command,
							"command2":  entry.Command,
						},
					})
				}

				// For SET commands, check value consistency
				if entry.Command.Type == raft.CommandSet && refEntry.Command.Type == raft.CommandSet {
					if entry.Command.Key != refEntry.Command.Key || entry.Command.Value != refEntry.Command.Value {
						ic.violations = append(ic.violations, InvariantViolation{
							Type: "VALUE_MISMATCH",
							Description: fmt.Sprintf("Different values at index %d: node %s has %s=%s, node %s has %s=%s",
								index, refNodeID, refEntry.Command.Key, refEntry.Command.Value,
								nodeID, entry.Command.Key, entry.Command.Value),
							Details: map[string]interface{}{
								"index":  index,
								"node1":  refNodeID,
								"key1":   refEntry.Command.Key,
								"value1": refEntry.Command.Value,
								"node2":  nodeID,
								"key2":   entry.Command.Key,
								"value2": entry.Command.Value,
							},
						})
					}
				}
			}
		}
	}
}

// checkMonotonicCommit verifies commit index never decreases
func (ic *InvariantChecker) checkMonotonicCommit() {
	for nodeID, entries := range ic.committedByNode {
		var lastIndex uint64 = 0
		for _, entry := range entries {
			if entry.Index < lastIndex {
				ic.violations = append(ic.violations, InvariantViolation{
					Type: "NON_MONOTONIC_COMMIT",
					Description: fmt.Sprintf("Node %s committed index %d after index %d",
						nodeID, entry.Index, lastIndex),
					Details: map[string]interface{}{
						"nodeID":    nodeID,
						"prevIndex": lastIndex,
						"currIndex": entry.Index,
					},
				})
			}
			lastIndex = entry.Index
		}
	}
}

// checkTermConsistency verifies term numbers are consistent
func (ic *InvariantChecker) checkTermConsistency() {
	// Terms at higher indices should be >= terms at lower indices
	for nodeID, entries := range ic.committedByNode {
		for i := 1; i < len(entries); i++ {
			prev := entries[i-1]
			curr := entries[i]

			if curr.Index > prev.Index && curr.Term < prev.Term {
				ic.violations = append(ic.violations, InvariantViolation{
					Type: "TERM_CONSISTENCY_VIOLATION",
					Description: fmt.Sprintf("Node %s has term %d at index %d, but term %d at higher index %d",
						nodeID, prev.Term, prev.Index, curr.Term, curr.Index),
					Details: map[string]interface{}{
						"nodeID":    nodeID,
						"prevIndex": prev.Index,
						"prevTerm":  prev.Term,
						"currIndex": curr.Index,
						"currTerm":  curr.Term,
					},
				})
			}
		}
	}
}

// Clear resets the checker
func (ic *InvariantChecker) Clear() {
	ic.mu.Lock()
	defer ic.mu.Unlock()
	ic.committedByNode = make(map[string][]CommittedEntry)
	ic.violations = make([]InvariantViolation, 0)
}

// CollectFromNodes collects committed entries from cluster nodes
func (ic *InvariantChecker) CollectFromNodes(nodes []*raft.Node) {
	ic.mu.Lock()
	defer ic.mu.Unlock()

	for _, node := range nodes {
		nodeID := node.GetID()
		log := node.GetLog()
		commitIndex := node.GetCommitIndex()

		for _, entry := range log {
			if entry.Index > 0 && entry.Index <= commitIndex {
				ic.committedByNode[nodeID] = append(ic.committedByNode[nodeID], CommittedEntry{
					Index:   entry.Index,
					Term:    entry.Term,
					Command: entry.Command,
					NodeID:  nodeID,
				})
			}
		}
	}
}

// CompareStateMachines compares final state machine states across nodes
func CompareStateMachines(stores []*SimulatedStore) (bool, []string) {
	if len(stores) == 0 {
		return true, nil
	}

	differences := make([]string, 0)
	refState := stores[0].GetSnapshot()

	for i := 1; i < len(stores); i++ {
		state := stores[i].GetSnapshot()

		// Check for missing keys
		for key, refValue := range refState {
			if value, ok := state[key]; !ok {
				differences = append(differences, fmt.Sprintf("Store %d missing key %s (expected %s)", i, key, refValue))
			} else if value != refValue {
				differences = append(differences, fmt.Sprintf("Store %d has %s=%s, expected %s", i, key, value, refValue))
			}
		}

		// Check for extra keys
		for key, value := range state {
			if _, ok := refState[key]; !ok {
				differences = append(differences, fmt.Sprintf("Store %d has unexpected key %s=%s", i, key, value))
			}
		}
	}

	return len(differences) == 0, differences
}

// JepsenStyleChecker performs randomized safety testing
type JepsenStyleChecker struct {
	history    *History
	checker    *InvariantChecker
	operations []JepsenOperation
	mu         sync.Mutex
}

// JepsenOperation records an operation for Jepsen-style analysis
type JepsenOperation struct {
	ID        int64
	Type      string // "invoke" or "ok" or "fail" or "info"
	OpType    string // "read" or "write" or "cas"
	Key       string
	Value     string
	ReadValue string
	StartTime int64
	EndTime   int64
	NodeID    string
	Success   bool
}

// NewJepsenStyleChecker creates a new Jepsen-style checker
func NewJepsenStyleChecker() *JepsenStyleChecker {
	return &JepsenStyleChecker{
		history:    NewHistory(),
		checker:    NewInvariantChecker(),
		operations: make([]JepsenOperation, 0),
	}
}

// RecordInvoke records the start of an operation
func (j *JepsenStyleChecker) RecordInvoke(nodeID, opType, key, value string, startTime int64) int64 {
	j.mu.Lock()
	defer j.mu.Unlock()

	id := int64(len(j.operations))
	j.operations = append(j.operations, JepsenOperation{
		ID:        id,
		Type:      "invoke",
		OpType:    opType,
		Key:       key,
		Value:     value,
		StartTime: startTime,
		NodeID:    nodeID,
	})

	return id
}

// RecordOk records successful completion
func (j *JepsenStyleChecker) RecordOk(id int64, readValue string, endTime int64) {
	j.mu.Lock()
	defer j.mu.Unlock()

	if id >= 0 && id < int64(len(j.operations)) {
		j.operations = append(j.operations, JepsenOperation{
			ID:        id,
			Type:      "ok",
			OpType:    j.operations[id].OpType,
			Key:       j.operations[id].Key,
			Value:     j.operations[id].Value,
			ReadValue: readValue,
			EndTime:   endTime,
			NodeID:    j.operations[id].NodeID,
			Success:   true,
		})
	}
}

// RecordFail records operation failure
func (j *JepsenStyleChecker) RecordFail(id int64, endTime int64) {
	j.mu.Lock()
	defer j.mu.Unlock()

	if id >= 0 && id < int64(len(j.operations)) {
		j.operations = append(j.operations, JepsenOperation{
			ID:      id,
			Type:    "fail",
			OpType:  j.operations[id].OpType,
			Key:     j.operations[id].Key,
			EndTime: endTime,
			NodeID:  j.operations[id].NodeID,
			Success: false,
		})
	}
}

// CheckLinearizability performs linearizability check on recorded history
func (j *JepsenStyleChecker) CheckLinearizability() (bool, []string) {
	j.mu.Lock()
	defer j.mu.Unlock()

	issues := make([]string, 0)

	// Build completed operations
	invokes := make(map[int64]JepsenOperation)
	completes := make(map[int64]JepsenOperation)

	for _, op := range j.operations {
		if op.Type == "invoke" {
			invokes[op.ID] = op
		} else if op.Type == "ok" || op.Type == "fail" {
			completes[op.ID] = op
		}
	}

	// For each key, verify read consistency
	keyWrites := make(map[string][]JepsenOperation) // key -> list of writes

	for id, complete := range completes {
		invoke, ok := invokes[id]
		if !ok {
			continue
		}

		if invoke.OpType == "write" && complete.Success {
			keyWrites[invoke.Key] = append(keyWrites[invoke.Key], complete)
		}
	}

	// Check that reads return values that were written
	for id, complete := range completes {
		invoke, ok := invokes[id]
		if !ok {
			continue
		}

		if invoke.OpType == "read" && complete.Success && complete.ReadValue != "" {
			// Check if this value was ever written
			writes, hasWrites := keyWrites[invoke.Key]
			if hasWrites {
				found := false
				for _, write := range writes {
					if write.Value == complete.ReadValue {
						found = true
						break
					}
				}
				if !found {
					issues = append(issues, fmt.Sprintf(
						"Read of key %s returned %s, but no write with that value found",
						invoke.Key, complete.ReadValue))
				}
			}
		}
	}

	return len(issues) == 0, issues
}

// GetOperations returns all recorded operations
func (j *JepsenStyleChecker) GetOperations() []JepsenOperation {
	j.mu.Lock()
	defer j.mu.Unlock()
	result := make([]JepsenOperation, len(j.operations))
	copy(result, j.operations)
	return result
}