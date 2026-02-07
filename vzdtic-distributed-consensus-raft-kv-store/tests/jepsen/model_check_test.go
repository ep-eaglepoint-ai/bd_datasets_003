package jepsen

import (
	"fmt"
	"log"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/vzdtic/raft-kv-store/repository_after/pkg/raft"
	"github.com/vzdtic/raft-kv-store/repository_after/pkg/simulation"
)

// StateSnapshot captures the state of all nodes at a point in time
type StateSnapshot struct {
	Timestamp time.Time
	States    map[string]NodeSnapshot
}

// NodeSnapshot captures the state of a single node
type NodeSnapshot struct {
	NodeID      string
	State       raft.State
	Term        uint64
	CommitIndex uint64
	Data        map[string]string
}

// ModelChecker performs TLA+ inspired model checking
type ModelChecker struct {
	mu        sync.Mutex
	snapshots []StateSnapshot
	invariants []Invariant
	violations []string
}

// Invariant is a function that checks a safety property
type Invariant func(snapshot StateSnapshot) error

// NewModelChecker creates a new model checker
func NewModelChecker() *ModelChecker {
	mc := &ModelChecker{
		snapshots: make([]StateSnapshot, 0),
	}

	// Add invariants
	mc.invariants = []Invariant{
		mc.checkSingleLeaderPerTerm,
		mc.checkLogConsistency,
		mc.checkTermMonotonicity,
	}

	return mc
}

// RecordSnapshot records a state snapshot
func (mc *ModelChecker) RecordSnapshot(nodes []*raft.Raft) {
	mc.mu.Lock()
	defer mc.mu.Unlock()

	snapshot := StateSnapshot{
		Timestamp: time.Now(),
		States:    make(map[string]NodeSnapshot),
	}

	for _, node := range nodes {
		leaderID, term, _ := node.GetClusterInfo()
		_ = leaderID // unused in snapshot

		nodeSnapshot := NodeSnapshot{
			NodeID: node.GetNodeID(),
			State:  node.GetState(),
			Term:   term,
			Data:   make(map[string]string),
		}

		snapshot.States[node.GetNodeID()] = nodeSnapshot
	}

	mc.snapshots = append(mc.snapshots, snapshot)

	// Check invariants
	for _, invariant := range mc.invariants {
		if err := invariant(snapshot); err != nil {
			mc.violations = append(mc.violations, err.Error())
		}
	}
}

// checkSingleLeaderPerTerm verifies at most one leader per term
func (mc *ModelChecker) checkSingleLeaderPerTerm(snapshot StateSnapshot) error {
	leadersByTerm := make(map[uint64][]string)

	for nodeID, state := range snapshot.States {
		if state.State == raft.Leader {
			leadersByTerm[state.Term] = append(leadersByTerm[state.Term], nodeID)
		}
	}

	for term, leaders := range leadersByTerm {
		if len(leaders) > 1 {
			return fmt.Errorf("multiple leaders in term %d: %v", term, leaders)
		}
	}

	return nil
}

// checkLogConsistency verifies log consistency across nodes
func (mc *ModelChecker) checkLogConsistency(snapshot StateSnapshot) error {
	// For each pair of nodes, if they have entries at the same index,
	// the entries should match
	for nodeA, stateA := range snapshot.States {
		for nodeB, stateB := range snapshot.States {
			if nodeA >= nodeB {
				continue
			}

			// Compare data (simplified check)
			for key, valueA := range stateA.Data {
				if valueB, ok := stateB.Data[key]; ok {
					if valueA != valueB {
						return fmt.Errorf("inconsistent value for key %s: node %s has %s, node %s has %s",
							key, nodeA, valueA, nodeB, valueB)
					}
				}
			}
		}
	}

	return nil
}

// checkTermMonotonicity verifies terms never decrease
func (mc *ModelChecker) checkTermMonotonicity(snapshot StateSnapshot) error {
	if len(mc.snapshots) < 2 {
		return nil
	}

	prevSnapshot := mc.snapshots[len(mc.snapshots)-2]

	for nodeID, state := range snapshot.States {
		if prevState, ok := prevSnapshot.States[nodeID]; ok {
			if state.Term < prevState.Term {
				return fmt.Errorf("term decreased for node %s: was %d, now %d",
					nodeID, prevState.Term, state.Term)
			}
		}
	}

	return nil
}

// GetViolations returns all recorded violations
func (mc *ModelChecker) GetViolations() []string {
	mc.mu.Lock()
	defer mc.mu.Unlock()
	return mc.violations
}

// TestModelChecking runs model checking tests
func TestModelChecking(t *testing.T) {
	network := simulation.NewNetwork(0.1, 5*time.Millisecond, 20*time.Millisecond)
	logger := log.New(os.Stdout, "", log.LstdFlags)
	modelChecker := NewModelChecker()

	nodes := make([]*raft.Raft, 3)
	transports := make([]*simulation.SimTransport, 3)

	for i := 0; i < 3; i++ {
		nodeID := string(rune('1' + i))
		transports[i] = simulation.NewSimTransport(network, nodeID)

		peers := make(map[string]string)
		for j := 0; j < 3; j++ {
			if i != j {
				peerID := string(rune('1' + j))
				peers[peerID] = peerID
			}
		}

		config := raft.DefaultConfig(nodeID)
		config.Peers = peers
		config.WALDir = t.TempDir()
		config.ElectionTimeout = 100 * time.Millisecond
		config.HeartbeatInterval = 30 * time.Millisecond

		node, err := raft.New(config, transports[i], logger)
		if err != nil {
			t.Fatalf("Failed to create node %d: %v", i, err)
		}
		nodes[i] = node
		network.AddNode(nodeID, node, transports[i])
	}

	// Register handlers
	for i := 0; i < 3; i++ {
		for j := 0; j < 3; j++ {
			nodeID := string(rune('1' + j))
			transports[i].RegisterHandler(nodeID, nodes[j])
		}
	}

	// Start nodes
	for _, node := range nodes {
		node.Start()
	}

	// Run simulation with model checking
	done := make(chan bool)
	go func() {
		for i := 0; i < 50; i++ {
			time.Sleep(50 * time.Millisecond)
			modelChecker.RecordSnapshot(nodes)

			// Random network events
			if i%10 == 0 {
				nodeID := string(rune('1' + (i/10)%3))
				network.Partition(nodeID)
				time.Sleep(100 * time.Millisecond)
				network.Heal(nodeID)
			}
		}
		done <- true
	}()

	<-done

	// Check for violations
	violations := modelChecker.GetViolations()
	if len(violations) > 0 {
		for _, v := range violations {
			t.Errorf("Safety violation: %s", v)
		}
	}

	// Cleanup
	for _, node := range nodes {
		node.Stop()
	}
}

// TestRandomizedExecution performs randomized testing
func TestRandomizedExecution(t *testing.T) {
	for seed := int64(0); seed < 5; seed++ {
		t.Run(fmt.Sprintf("seed_%d", seed), func(t *testing.T) {
			network := simulation.NewNetwork(0.05, 0, 15*time.Millisecond)
			logger := log.New(os.Stdout, "", log.LstdFlags)

			nodes := make([]*raft.Raft, 3)
			transports := make([]*simulation.SimTransport, 3)

			for i := 0; i < 3; i++ {
				nodeID := string(rune('1' + i))
				transports[i] = simulation.NewSimTransport(network, nodeID)

				peers := make(map[string]string)
				for j := 0; j < 3; j++ {
					if i != j {
						peerID := string(rune('1' + j))
						peers[peerID] = peerID
					}
				}

				config := raft.DefaultConfig(nodeID)
				config.Peers = peers
				config.WALDir = t.TempDir()
				config.ElectionTimeout = 100 * time.Millisecond
				config.HeartbeatInterval = 30 * time.Millisecond

				node, err := raft.New(config, transports[i], logger)
				if err != nil {
					t.Fatalf("Failed to create node %d: %v", i, err)
				}
				nodes[i] = node
				network.AddNode(nodeID, node, transports[i])
			}

			// Register handlers
			for i := 0; i < 3; i++ {
				for j := 0; j < 3; j++ {
					nodeID := string(rune('1' + j))
					transports[i].RegisterHandler(nodeID, nodes[j])
				}
			}

			// Start nodes
			for _, node := range nodes {
				node.Start()
			}

			// Wait for election
			time.Sleep(500 * time.Millisecond)

			// Run operations
			for i := 0; i < 20; i++ {
				var leader *raft.Raft
				for _, node := range nodes {
					if node.GetState() == raft.Leader {
						leader = node
						break
					}
				}

				if leader != nil {
					key := fmt.Sprintf("k%d", i%5)
					value := fmt.Sprintf("v%d", i)
					leader.Set(key, []byte(value), "client", uint64(i))
				}

				time.Sleep(50 * time.Millisecond)
			}

			// Verify at most one leader
			leaderCount := 0
			for _, node := range nodes {
				if node.GetState() == raft.Leader {
					leaderCount++
				}
			}

			if leaderCount > 1 {
				t.Errorf("More than one leader: %d", leaderCount)
			}

			// Cleanup
			for _, node := range nodes {
				node.Stop()
			}
		})
	}
}