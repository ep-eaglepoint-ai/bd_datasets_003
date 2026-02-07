package jepsen

import (
	"bytes"
	"fmt"
	"log"
	"math/rand"
	"os"
	"testing"
	"time"

	"github.com/vzdtic/raft-kv-store/repository_after/pkg/raft"
	"github.com/vzdtic/raft-kv-store/repository_after/pkg/simulation"
)

// StateSnapshot captures the state of all nodes
type StateSnapshot struct {
	Timestamp time.Time
	States    map[string]NodeSnapshot
}

// NodeSnapshot captures state of a single node
type NodeSnapshot struct {
	NodeID          string
	State           raft.State
	Term            uint64
	CommitIndex     uint64
	CommittedData   map[uint64][]byte
}

// ModelChecker performs TLA+ inspired model checking
type ModelChecker struct {
	snapshots  []StateSnapshot
	invariants []Invariant
	violations []string
	seed       int64
}

// Invariant checks a safety property
type Invariant func(snapshot StateSnapshot, previous *StateSnapshot) error

// NewModelChecker with deterministic seed
func NewModelChecker(seed int64) *ModelChecker {
	mc := &ModelChecker{
		snapshots: make([]StateSnapshot, 0),
		seed:      seed,
	}

	mc.invariants = []Invariant{
		mc.checkSingleLeaderPerTerm,
		mc.checkLogAgreement,
		mc.checkTermMonotonicity,
		mc.checkCommitMonotonicity,
	}

	return mc
}

// RecordSnapshot with committed data
func (mc *ModelChecker) RecordSnapshot(nodes []*raft.Raft) {
	snapshot := StateSnapshot{
		Timestamp: time.Now(),
		States:    make(map[string]NodeSnapshot),
	}

	for _, node := range nodes {
		_, term, _ := node.GetClusterInfo()
		committed := node.GetAllCommittedEntries()
		
		committedData := make(map[uint64][]byte)
		for idx, entry := range committed {
			committedData[idx] = entry.Command
		}

		snapshot.States[node.GetNodeID()] = NodeSnapshot{
			NodeID:        node.GetNodeID(),
			State:         node.GetState(),
			Term:          term,
			CommittedData: committedData,
		}
	}

	var prevSnapshot *StateSnapshot
	if len(mc.snapshots) > 0 {
		prevSnapshot = &mc.snapshots[len(mc.snapshots)-1]
	}

	mc.snapshots = append(mc.snapshots, snapshot)

	for _, invariant := range mc.invariants {
		if err := invariant(snapshot, prevSnapshot); err != nil {
			mc.violations = append(mc.violations, err.Error())
		}
	}
}

// checkSingleLeaderPerTerm - at most one leader per term
func (mc *ModelChecker) checkSingleLeaderPerTerm(snapshot StateSnapshot, _ *StateSnapshot) error {
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

// checkLogAgreement - same index must have same value across nodes
func (mc *ModelChecker) checkLogAgreement(snapshot StateSnapshot, _ *StateSnapshot) error {
	// Collect all committed indices
	allIndices := make(map[uint64]bool)
	for _, state := range snapshot.States {
		for idx := range state.CommittedData {
			allIndices[idx] = true
		}
	}

	// For each index, verify all nodes that have it agree on value
	for idx := range allIndices {
		var referenceData []byte
		var referenceNode string

		for nodeID, state := range snapshot.States {
			data, exists := state.CommittedData[idx]
			if !exists {
				continue
			}

			if referenceData == nil {
				referenceData = data
				referenceNode = nodeID
			} else {
				if !bytes.Equal(data, referenceData) {
					return fmt.Errorf("index %d: node %s has different data than node %s",
						idx, nodeID, referenceNode)
				}
			}
		}
	}

	return nil
}

// checkTermMonotonicity - terms never decrease
func (mc *ModelChecker) checkTermMonotonicity(snapshot StateSnapshot, previous *StateSnapshot) error {
	if previous == nil {
		return nil
	}

	for nodeID, state := range snapshot.States {
		if prevState, ok := previous.States[nodeID]; ok {
			if state.Term < prevState.Term {
				return fmt.Errorf("term decreased for node %s: was %d, now %d",
					nodeID, prevState.Term, state.Term)
			}
		}
	}

	return nil
}

// checkCommitMonotonicity - commit index never decreases
func (mc *ModelChecker) checkCommitMonotonicity(snapshot StateSnapshot, previous *StateSnapshot) error {
	if previous == nil {
		return nil
	}

	for nodeID, state := range snapshot.States {
		if prevState, ok := previous.States[nodeID]; ok {
			if state.CommitIndex < prevState.CommitIndex {
				return fmt.Errorf("commit index decreased for node %s: was %d, now %d",
					nodeID, prevState.CommitIndex, state.CommitIndex)
			}
		}
	}

	return nil
}

// GetViolations returns recorded violations
func (mc *ModelChecker) GetViolations() []string {
	return mc.violations
}

// GetSeed returns the seed for replay
func (mc *ModelChecker) GetSeed() int64 {
	return mc.seed
}

// TestModelChecking with deterministic seed
func TestModelChecking(t *testing.T) {
	const seed int64 = 77777
	
	network := simulation.NewDeterministicNetwork(0.1, 5*time.Millisecond, 20*time.Millisecond, seed)
	logger := log.New(os.Stdout, "", log.LstdFlags)
	modelChecker := NewModelChecker(seed)

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
		config.RandomSeed = seed + int64(i)

		node, err := raft.New(config, transports[i], logger)
		if err != nil {
			t.Fatalf("Failed to create node %d: %v", i, err)
		}
		nodes[i] = node
		network.AddNode(nodeID, node, transports[i])
	}

	for i := 0; i < 3; i++ {
		for j := 0; j < 3; j++ {
			nodeID := string(rune('1' + j))
			transports[i].RegisterHandler(nodeID, nodes[j])
		}
	}

	for _, node := range nodes {
		node.Start()
	}
	defer func() {
		for _, node := range nodes {
			node.Stop()
		}
	}()

	rng := rand.New(rand.NewSource(seed))

	done := make(chan bool)
	go func() {
		for i := 0; i < 50; i++ {
			time.Sleep(50 * time.Millisecond)
			modelChecker.RecordSnapshot(nodes)

			if i%10 == 0 {
				nodeID := string(rune('1' + rng.Intn(3)))
				network.Partition(nodeID)
				time.Sleep(100 * time.Millisecond)
				network.Heal(nodeID)
			}
		}
		done <- true
	}()

	<-done

	violations := modelChecker.GetViolations()
	if len(violations) > 0 {
		t.Logf("Test ran with seed %d (replayable)", modelChecker.GetSeed())
		for _, v := range violations {
			t.Errorf("Safety violation: %s", v)
		}
	}
}

// TestRandomizedExecution with fixed seeds per run
func TestRandomizedExecution(t *testing.T) {
	seeds := []int64{88881, 88882, 88883, 88884, 88885}

	for _, seed := range seeds {
		t.Run(fmt.Sprintf("seed_%d", seed), func(t *testing.T) {
			network := simulation.NewDeterministicNetwork(0.05, 0, 15*time.Millisecond, seed)
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
				config.RandomSeed = seed + int64(i)

				node, err := raft.New(config, transports[i], logger)
				if err != nil {
					t.Fatalf("Failed to create node %d: %v", i, err)
				}
				nodes[i] = node
				network.AddNode(nodeID, node, transports[i])
			}

			for i := 0; i < 3; i++ {
				for j := 0; j < 3; j++ {
					nodeID := string(rune('1' + j))
					transports[i].RegisterHandler(nodeID, nodes[j])
				}
			}

			for _, node := range nodes {
				node.Start()
			}
			defer func() {
				for _, node := range nodes {
					node.Stop()
				}
			}()

			time.Sleep(500 * time.Millisecond)

			rng := rand.New(rand.NewSource(seed))
			for i := 0; i < 20; i++ {
				var leader *raft.Raft
				for _, node := range nodes {
					if node.GetState() == raft.Leader {
						leader = node
						break
					}
				}

				if leader != nil {
					key := fmt.Sprintf("k%d", rng.Intn(5))
					value := fmt.Sprintf("v%d", i)
					leader.Set(key, []byte(value), "client", uint64(i+1))
				}

				time.Sleep(50 * time.Millisecond)
			}

			leaderCount := 0
			for _, node := range nodes {
				if node.GetState() == raft.Leader {
					leaderCount++
				}
			}

			if leaderCount > 1 {
				t.Errorf("Seed %d: More than one leader: %d", seed, leaderCount)
			}
		})
	}
}