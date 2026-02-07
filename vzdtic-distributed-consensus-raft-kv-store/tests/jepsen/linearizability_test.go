package jepsen

import (
	"fmt"
	"log"
	"math/rand"
	"os"
	"sort"
	"sync"
	"testing"
	"time"

	"github.com/vzdtic/raft-kv-store/repository_after/pkg/raft"
	"github.com/vzdtic/raft-kv-store/repository_after/pkg/simulation"
)

// Operation for linearizability checking
type Operation struct {
	Type      string
	Key       string
	Value     string
	StartTime time.Time
	EndTime   time.Time
	Result    string
	Success   bool
	ClientID  int
	SeqNum    int
}

// History records operations
type History struct {
	mu         sync.Mutex
	operations []Operation
}

func (h *History) Add(op Operation) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.operations = append(h.operations, op)
}

func (h *History) GetOperations() []Operation {
	h.mu.Lock()
	defer h.mu.Unlock()
	result := make([]Operation, len(h.operations))
	copy(result, h.operations)
	return result
}

// waitForStableLeader with deterministic timeout
func waitForStableLeader(nodes []*raft.Raft, timeout time.Duration) *raft.Raft {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		var leader *raft.Raft
		leaderCount := 0
		for _, node := range nodes {
			if node.GetState() == raft.Leader {
				leader = node
				leaderCount++
			}
		}
		if leaderCount == 1 {
			time.Sleep(80 * time.Millisecond)
			if leader.GetState() == raft.Leader {
				return leader
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	return nil
}

// createDeterministicCluster with fixed seed
func createDeterministicCluster(t *testing.T, n int, seed int64) ([]*raft.Raft, *simulation.Network, []*simulation.SimTransport) {
	t.Helper()

	network := simulation.NewDeterministicNetwork(0.05, 0, 20*time.Millisecond, seed)
	logger := log.New(os.Stdout, "", log.LstdFlags)

	nodes := make([]*raft.Raft, n)
	transports := make([]*simulation.SimTransport, n)

	for i := 0; i < n; i++ {
		nodeID := string(rune('1' + i))
		transports[i] = simulation.NewSimTransport(network, nodeID)

		peers := make(map[string]string)
		for j := 0; j < n; j++ {
			if i != j {
				peerID := string(rune('1' + j))
				peers[peerID] = peerID
			}
		}

		config := raft.DefaultConfig(nodeID)
		config.Peers = peers
		config.WALDir = t.TempDir()
		config.ElectionTimeout = 150 * time.Millisecond
		config.HeartbeatInterval = 50 * time.Millisecond
		config.RandomSeed = seed + int64(i)

		node, err := raft.New(config, transports[i], logger)
		if err != nil {
			t.Fatalf("Failed to create node %d: %v", i, err)
		}
		nodes[i] = node
		network.AddNode(nodeID, node, transports[i])
	}

	for i := 0; i < n; i++ {
		for j := 0; j < n; j++ {
			nodeID := string(rune('1' + j))
			transports[i].RegisterHandler(nodeID, nodes[j])
		}
	}

	return nodes, network, transports
}

// TestLinearizability with proper verification
func TestLinearizability(t *testing.T) {
	const seed int64 = 12345
	nodes, network, _ := createDeterministicCluster(t, 3, seed)

	for _, node := range nodes {
		node.Start()
	}
	defer func() {
		for _, node := range nodes {
			node.Stop()
		}
	}()

	leader := waitForStableLeader(nodes, 3*time.Second)
	if leader == nil {
		t.Fatal("No leader elected")
	}

	history := &History{}
	var wg sync.WaitGroup

	numClients := 5
	numOpsPerClient := 10
	rng := rand.New(rand.NewSource(seed))

	for c := 0; c < numClients; c++ {
		wg.Add(1)
		go func(clientID int) {
			defer wg.Done()
			localRng := rand.New(rand.NewSource(seed + int64(clientID*1000)))

			for i := 0; i < numOpsPerClient; i++ {
				key := fmt.Sprintf("key%d", localRng.Intn(5))
				value := fmt.Sprintf("value%d-%d", clientID, i)

				var currentLeader *raft.Raft
				for _, node := range nodes {
					if node.GetState() == raft.Leader {
						currentLeader = node
						break
					}
				}

				if currentLeader == nil {
					time.Sleep(100 * time.Millisecond)
					continue
				}

				if localRng.Float32() < 0.7 {
					op := Operation{
						Type:      "write",
						Key:       key,
						Value:     value,
						StartTime: time.Now(),
						ClientID:  clientID,
						SeqNum:    i,
					}

					err := currentLeader.Set(key, []byte(value), fmt.Sprintf("client%d", clientID), uint64(i+1))
					op.EndTime = time.Now()
					op.Success = err == nil
					if err != nil {
						op.Result = err.Error()
					} else {
						op.Result = "ok"
					}
					history.Add(op)
				} else {
					op := Operation{
						Type:      "read",
						Key:       key,
						StartTime: time.Now(),
						ClientID:  clientID,
						SeqNum:    i,
					}

					val, found, err := currentLeader.Get(key, false)
					op.EndTime = time.Now()
					op.Success = err == nil
					if err != nil {
						op.Result = err.Error()
					} else if !found {
						op.Result = "nil"
					} else {
						op.Result = string(val)
					}
					history.Add(op)
				}

				time.Sleep(time.Duration(localRng.Intn(50)) * time.Millisecond)
			}
		}(c)
	}

	// Deterministic partition injection
	go func() {
		partitionRng := rand.New(rand.NewSource(seed + 999))
		for i := 0; i < 3; i++ {
			time.Sleep(200 * time.Millisecond)
			nodeID := string(rune('1' + partitionRng.Intn(3)))
			network.Partition(nodeID)
			time.Sleep(100 * time.Millisecond)
			network.Heal(nodeID)
		}
	}()

	wg.Wait()

	ops := history.GetOperations()
	if err := verifyLinearizabilityStrict(ops); err != nil {
		t.Errorf("Linearizability violation: %v", err)
	}

	_ = rng
}

// verifyLinearizabilityStrict implements a stricter linearizability check
func verifyLinearizabilityStrict(ops []Operation) error {
	// Group writes by key
	writesByKey := make(map[string][]Operation)
	for _, op := range ops {
		if op.Type == "write" && op.Success {
			writesByKey[op.Key] = append(writesByKey[op.Key], op)
		}
	}

	// Sort writes by start time for each key
	for key := range writesByKey {
		sort.Slice(writesByKey[key], func(i, j int) bool {
			return writesByKey[key][i].StartTime.Before(writesByKey[key][j].StartTime)
		})
	}

	// For each read, verify it could be linearized
	for _, op := range ops {
		if op.Type != "read" || !op.Success || op.Result == "nil" {
			continue
		}

		key := op.Key
		writes := writesByKey[key]
		if len(writes) == 0 {
			continue
		}

		// Find writes that could explain this read
		found := false
		for _, w := range writes {
			if w.Value == op.Result {
				// Write started before read ended (could be linearized before)
				if w.StartTime.Before(op.EndTime) {
					// No later write completed before this read started
					validLinearization := true
					for _, w2 := range writes {
						if w2.Value != w.Value &&
							w2.EndTime.Before(op.StartTime) &&
							w2.StartTime.After(w.StartTime) {
							validLinearization = false
							break
						}
					}
					if validLinearization {
						found = true
						break
					}
				}
			}
		}

		if !found {
			return fmt.Errorf(
				"read of key=%s returned %q but no valid linearization point exists",
				key, op.Result,
			)
		}
	}

	return nil
}

// TestNoTwoLeaders with deterministic seed
func TestNoTwoLeaders(t *testing.T) {
	const seed int64 = 54321
	nodes, network, _ := createDeterministicCluster(t, 5, seed)

	for _, node := range nodes {
		node.Start()
	}
	defer func() {
		for _, node := range nodes {
			node.Stop()
		}
	}()

	violations := 0
	rng := rand.New(rand.NewSource(seed))

	for round := 0; round < 10; round++ {
		time.Sleep(200 * time.Millisecond)

		if round%3 == 0 {
			nodeID := string(rune('1' + rng.Intn(5)))
			network.Partition(nodeID)
			time.Sleep(100 * time.Millisecond)
			network.Heal(nodeID)
		}

		leadersByTerm := make(map[uint64][]string)
		for _, node := range nodes {
			if node.GetState() == raft.Leader {
				_, term, _ := node.GetClusterInfo()
				leadersByTerm[term] = append(leadersByTerm[term], node.GetNodeID())
			}
		}

		for term, leaders := range leadersByTerm {
			if len(leaders) > 1 {
				t.Errorf("Multiple leaders in term %d: %v", term, leaders)
				violations++
			}
		}
	}

	if violations > 0 {
		t.Errorf("Found %d safety violations", violations)
	}
}

// TestSameIndexAgreement verifies all nodes commit same values at same indices
func TestSameIndexAgreement(t *testing.T) {
	const seed int64 = 11111
	nodes, _, _ := createDeterministicCluster(t, 3, seed)

	for _, node := range nodes {
		node.Start()
	}
	defer func() {
		for _, node := range nodes {
			node.Stop()
		}
	}()

	leader := waitForStableLeader(nodes, 3*time.Second)
	if leader == nil {
		t.Fatal("No leader elected")
	}

	// Write several values
	for i := 0; i < 10; i++ {
		key := fmt.Sprintf("key%d", i)
		value := fmt.Sprintf("value%d", i)
		err := leader.Set(key, []byte(value), "test-client", uint64(i+1))
		if err != nil {
			t.Logf("Write %d failed: %v", i, err)
		}
	}

	// Wait for replication
	time.Sleep(500 * time.Millisecond)

	// Collect committed entries from all nodes
	allCommitted := make([]map[uint64]raft.CommittedEntry, len(nodes))
	for i, node := range nodes {
		allCommitted[i] = node.GetAllCommittedEntries()
	}

	// Verify same index has same value across all nodes
	for idx := uint64(1); idx <= 20; idx++ {
		var referenceEntry *raft.CommittedEntry
		for nodeIdx, committed := range allCommitted {
			entry, exists := committed[idx]
			if !exists {
				continue
			}

			if referenceEntry == nil {
				referenceEntry = &entry
			} else {
				// Compare term
				if entry.Term != referenceEntry.Term {
					t.Errorf("Index %d: node %d has term %d, but node 0 has term %d",
						idx, nodeIdx, entry.Term, referenceEntry.Term)
				}
				// Compare command
				if string(entry.Command) != string(referenceEntry.Command) {
					t.Errorf("Index %d: node %d has different command than node 0",
						idx, nodeIdx)
				}
			}
		}
	}
}

// TestLogConsistency with proper verification
func TestLogConsistency(t *testing.T) {
	const seed int64 = 22222
	nodes, network, _ := createDeterministicCluster(t, 3, seed)

	for _, node := range nodes {
		node.Start()
	}
	defer func() {
		for _, node := range nodes {
			node.Stop()
		}
	}()

	leader := waitForStableLeader(nodes, 3*time.Second)
	if leader == nil {
		t.Fatal("No leader elected")
	}

	// Write values
	for i := 0; i < 5; i++ {
		key := fmt.Sprintf("key%d", i)
		value := fmt.Sprintf("value%d", i)
		leader.Set(key, []byte(value), "test-client", uint64(i+1))
	}

	time.Sleep(300 * time.Millisecond)

	// Record committed values
	committedValues := make(map[string]string)
	for i := 0; i < 5; i++ {
		key := fmt.Sprintf("key%d", i)
		val, found, _ := leader.Get(key, false)
		if found {
			committedValues[key] = string(val)
		}
	}

	// Partition leader
	leaderID := leader.GetNodeID()
	network.Partition(leaderID)

	time.Sleep(500 * time.Millisecond)

	network.Heal(leaderID)
	time.Sleep(300 * time.Millisecond)

	newLeader := waitForStableLeader(nodes, 3*time.Second)
	if newLeader == nil {
		t.Fatal("No leader after healing")
	}

	// Verify committed values preserved
	for key, expectedValue := range committedValues {
		val, found, _ := newLeader.Get(key, false)
		if !found {
			t.Errorf("Key %s was committed but not found after leader change", key)
		} else if string(val) != expectedValue {
			t.Errorf("Key %s had value %s but now has %s", key, expectedValue, string(val))
		}
	}
}

// TestSplitBrain with deterministic behavior
func TestSplitBrain(t *testing.T) {
	const seed int64 = 33333
	nodes, network, _ := createDeterministicCluster(t, 5, seed)

	for _, node := range nodes {
		node.Start()
	}
	defer func() {
		for _, node := range nodes {
			node.Stop()
		}
	}()

	time.Sleep(500 * time.Millisecond)

	// Create split: nodes 1,2 vs nodes 3,4,5
	network.PartitionBetween("1", "3")
	network.PartitionBetween("1", "4")
	network.PartitionBetween("1", "5")
	network.PartitionBetween("2", "3")
	network.PartitionBetween("2", "4")
	network.PartitionBetween("2", "5")

	time.Sleep(700 * time.Millisecond)

	// Majority partition should have leader
	majorityLeaders := 0
	for i := 2; i < 5; i++ {
		if nodes[i].GetState() == raft.Leader {
			majorityLeaders++
		}
	}

	if majorityLeaders == 0 {
		time.Sleep(500 * time.Millisecond)
		for i := 2; i < 5; i++ {
			if nodes[i].GetState() == raft.Leader {
				majorityLeaders++
			}
		}
	}

	if majorityLeaders != 1 {
		t.Errorf("Expected 1 leader in majority partition, got %d", majorityLeaders)
	}

	// Heal
	network.HealBetween("1", "3")
	network.HealBetween("1", "4")
	network.HealBetween("1", "5")
	network.HealBetween("2", "3")
	network.HealBetween("2", "4")
	network.HealBetween("2", "5")

	time.Sleep(500 * time.Millisecond)

	finalLeaderCount := 0
	for _, node := range nodes {
		if node.GetState() == raft.Leader {
			finalLeaderCount++
		}
	}

	if finalLeaderCount != 1 {
		t.Errorf("Expected 1 leader after healing, got %d", finalLeaderCount)
	}
}

// TestDeterministicLeaderIsolation with fixed seed for reproducibility
func TestDeterministicLeaderIsolation(t *testing.T) {
	const seed int64 = 44444
	nodes, network, _ := createDeterministicCluster(t, 3, seed)

	for _, node := range nodes {
		node.Start()
	}
	defer func() {
		for _, node := range nodes {
			node.Stop()
		}
	}()

	leader := waitForStableLeader(nodes, 3*time.Second)
	if leader == nil {
		t.Fatal("No leader elected")
	}

	// Write initial data
	err := leader.Set("isolation-key", []byte("initial"), "client", 1)
	if err != nil {
		t.Fatalf("Failed to write initial data: %v", err)
	}
	time.Sleep(200 * time.Millisecond)

	// Isolate the leader
	leaderID := leader.GetNodeID()
	t.Logf("Isolating leader %s (seed=%d)", leaderID, seed)
	network.Partition(leaderID)

	// Wait for new leader in remaining nodes
	time.Sleep(600 * time.Millisecond)

	var newLeader *raft.Raft
	for _, node := range nodes {
		if node.GetNodeID() != leaderID && node.GetState() == raft.Leader {
			newLeader = node
			break
		}
	}

	if newLeader == nil {
		time.Sleep(400 * time.Millisecond)
		for _, node := range nodes {
			if node.GetNodeID() != leaderID && node.GetState() == raft.Leader {
				newLeader = node
				break
			}
		}
	}

	if newLeader == nil {
		t.Fatal("No new leader elected after isolating old leader")
	}

	t.Logf("New leader elected: %s", newLeader.GetNodeID())

	// New leader should be able to make progress
	err = newLeader.Set("isolation-key", []byte("new-value"), "client", 2)
	if err != nil {
		t.Errorf("New leader failed to write: %v", err)
	}

	// Heal and verify convergence
	network.Heal(leaderID)
	time.Sleep(500 * time.Millisecond)

	// All nodes should agree on value
	for _, node := range nodes {
		val, found, _ := node.Get("isolation-key", false)
		if found && string(val) != "new-value" {
			t.Errorf("Node %s has value %s, expected new-value", node.GetNodeID(), string(val))
		}
	}
}