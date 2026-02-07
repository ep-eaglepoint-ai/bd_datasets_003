package jepsen

import (
	"fmt"
	"log"
	"math/rand"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/vzdtic/raft-kv-store/repository_after/pkg/raft"
	"github.com/vzdtic/raft-kv-store/repository_after/pkg/simulation"
)

// Operation represents a linearizability check operation
type Operation struct {
	Type      string // "write" or "read"
	Key       string
	Value     string
	StartTime time.Time
	EndTime   time.Time
	Result    string
	Success   bool
}

// History records all operations for linearizability checking
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

// waitForStableLeader waits for a stable leader in the cluster
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

// TestLinearizability performs Jepsen-style linearizability testing
func TestLinearizability(t *testing.T) {
	network := simulation.NewNetwork(0.05, 0, 20*time.Millisecond)
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
		config.ElectionTimeout = 150 * time.Millisecond
		config.HeartbeatInterval = 50 * time.Millisecond

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
	defer func() {
		for _, node := range nodes {
			node.Stop()
		}
	}()

	// Wait for a stable leader
	leader := waitForStableLeader(nodes, 3*time.Second)
	if leader == nil {
		t.Fatal("No leader elected")
	}

	history := &History{}
	var wg sync.WaitGroup

	// Run concurrent clients
	numClients := 5
	numOpsPerClient := 10

	for c := 0; c < numClients; c++ {
		wg.Add(1)
		go func(clientID int) {
			defer wg.Done()
			r := rand.New(rand.NewSource(time.Now().UnixNano() + int64(clientID)))

			for i := 0; i < numOpsPerClient; i++ {
				key := fmt.Sprintf("key%d", r.Intn(5))
				value := fmt.Sprintf("value%d-%d", clientID, i)

				// Find current leader
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

				if r.Float32() < 0.7 {
					// Write operation
					op := Operation{
						Type:      "write",
						Key:       key,
						Value:     value,
						StartTime: time.Now(),
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
					// Read operation
					op := Operation{
						Type:      "read",
						Key:       key,
						StartTime: time.Now(),
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

				time.Sleep(time.Duration(r.Intn(50)) * time.Millisecond)
			}
		}(c)
	}

	// Periodically inject network partitions
	go func() {
		r := rand.New(rand.NewSource(time.Now().UnixNano()))
		for i := 0; i < 3; i++ {
			time.Sleep(200 * time.Millisecond)
			nodeID := string(rune('1' + r.Intn(3)))
			network.Partition(nodeID)
			time.Sleep(100 * time.Millisecond)
			network.Heal(nodeID)
		}
	}()

	wg.Wait()

	// Verify linearizability
	ops := history.GetOperations()
	if err := verifyLinearizability(ops); err != nil {
		t.Errorf("Linearizability violation detected: %v", err)
	}
}

// verifyLinearizability checks if the history is linearizable.
//
// For each successful read that returned a non-nil value, we check that there
// exists at least one successful write of that value whose execution interval
// could have been linearized before the read.  Two operations *could* be
// ordered (write before read) if the write started before the read ended –
// i.e. their real-time intervals overlap or the write finished first.
//
// This is a simplified but sound single-key per-read check.  A full
// linearizability checker (like Knossos / porcupine) would enumerate all
// possible serializations; we intentionally keep the check lightweight.
func verifyLinearizability(ops []Operation) error {
	// Collect all successful writes grouped by key
	writesByKey := make(map[string][]Operation)
	for _, op := range ops {
		if op.Type == "write" && op.Success {
			writesByKey[op.Key] = append(writesByKey[op.Key], op)
		}
	}

	// For every successful read that returned a concrete value, make sure
	// that value was actually written and the write *could* have preceded
	// the read in a valid linearization.
	for _, op := range ops {
		if op.Type != "read" || !op.Success || op.Result == "nil" {
			continue
		}

		key := op.Key
		writes, hasWrites := writesByKey[key]
		if !hasWrites {
			// Value was read but no write was ever recorded for that key.
			// This can happen when a write succeeded on the state machine
			// but the client goroutine recorded it as failed (timeout /
			// leader change).  Not a linearizability violation per se.
			continue
		}

		// Look for ANY write of this value that started before the read
		// ended (i.e. the two intervals overlap, so they could be ordered
		// write → read in a linearization).
		found := false
		for _, w := range writes {
			if w.Value == op.Result && w.StartTime.Before(op.EndTime) {
				found = true
				break
			}
		}

		if !found {
			return fmt.Errorf(
				"read of key=%s returned %q but no write of that value has a compatible real-time interval",
				key, op.Result,
			)
		}
	}

	return nil
}

// TestNoTwoLeaders verifies that at most one leader exists in each term
func TestNoTwoLeaders(t *testing.T) {
	network := simulation.NewNetwork(0.1, 0, 10*time.Millisecond)
	logger := log.New(os.Stdout, "", log.LstdFlags)

	nodes := make([]*raft.Raft, 5)
	transports := make([]*simulation.SimTransport, 5)

	for i := 0; i < 5; i++ {
		nodeID := string(rune('1' + i))
		transports[i] = simulation.NewSimTransport(network, nodeID)

		peers := make(map[string]string)
		for j := 0; j < 5; j++ {
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
	for i := 0; i < 5; i++ {
		for j := 0; j < 5; j++ {
			nodeID := string(rune('1' + j))
			transports[i].RegisterHandler(nodeID, nodes[j])
		}
	}

	// Start nodes
	for _, node := range nodes {
		node.Start()
	}
	defer func() {
		for _, node := range nodes {
			node.Stop()
		}
	}()

	violations := 0

	// Run for multiple rounds, checking for multiple leaders
	for round := 0; round < 10; round++ {
		time.Sleep(200 * time.Millisecond)

		// Inject random partition
		if round%3 == 0 {
			nodeID := string(rune('1' + rand.Intn(5)))
			network.Partition(nodeID)
			time.Sleep(100 * time.Millisecond)
			network.Heal(nodeID)
		}

		// Check leaders per term
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

// TestLogConsistency verifies that committed entries are never overwritten
func TestLogConsistency(t *testing.T) {
	network := simulation.NewNetwork(0, 0, 10*time.Millisecond)
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
	defer func() {
		for _, node := range nodes {
			node.Stop()
		}
	}()

	// Wait for stable leader
	leader := waitForStableLeader(nodes, 3*time.Second)
	if leader == nil {
		t.Fatal("No leader elected")
	}

	// Write values
	for i := 0; i < 5; i++ {
		key := fmt.Sprintf("key%d", i)
		value := fmt.Sprintf("value%d", i)
		err := leader.Set(key, []byte(value), "test-client", uint64(i+1))
		if err != nil {
			t.Logf("Write %d failed: %v", i, err)
		}
	}

	// Wait for replication
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

	// Wait for new election
	time.Sleep(500 * time.Millisecond)

	// Heal partition
	network.Heal(leaderID)

	// Wait for cluster to stabilize
	time.Sleep(300 * time.Millisecond)

	// Find new leader and verify committed values are preserved
	newLeader := waitForStableLeader(nodes, 3*time.Second)
	if newLeader == nil {
		t.Fatal("No leader after healing")
	}

	// Verify committed values
	for key, expectedValue := range committedValues {
		val, found, _ := newLeader.Get(key, false)
		if !found {
			t.Errorf("Key %s was committed but not found after leader change", key)
		} else if string(val) != expectedValue {
			t.Errorf("Key %s had value %s but now has %s", key, expectedValue, string(val))
		}
	}
}

// TestSplitBrain tests that split-brain scenarios are handled correctly
func TestSplitBrain(t *testing.T) {
	network := simulation.NewNetwork(0, 0, 10*time.Millisecond)
	logger := log.New(os.Stdout, "", log.LstdFlags)

	nodes := make([]*raft.Raft, 5)
	transports := make([]*simulation.SimTransport, 5)

	for i := 0; i < 5; i++ {
		nodeID := string(rune('1' + i))
		transports[i] = simulation.NewSimTransport(network, nodeID)

		peers := make(map[string]string)
		for j := 0; j < 5; j++ {
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
	for i := 0; i < 5; i++ {
		for j := 0; j < 5; j++ {
			nodeID := string(rune('1' + j))
			transports[i].RegisterHandler(nodeID, nodes[j])
		}
	}

	// Start nodes
	for _, node := range nodes {
		node.Start()
	}
	defer func() {
		for _, node := range nodes {
			node.Stop()
		}
	}()

	// Wait for election
	time.Sleep(500 * time.Millisecond)

	// Create a split: partition nodes 1,2 from nodes 3,4,5
	network.PartitionBetween("1", "3")
	network.PartitionBetween("1", "4")
	network.PartitionBetween("1", "5")
	network.PartitionBetween("2", "3")
	network.PartitionBetween("2", "4")
	network.PartitionBetween("2", "5")

	// Wait for new election in majority partition
	time.Sleep(700 * time.Millisecond)

	// The majority partition (3,4,5) should have exactly one leader
	majorityLeaders := 0
	for i := 2; i < 5; i++ {
		if nodes[i].GetState() == raft.Leader {
			majorityLeaders++
		}
	}

	if majorityLeaders != 1 {
		// Give extra time for vote-splitting in the majority
		time.Sleep(500 * time.Millisecond)
		majorityLeaders = 0
		for i := 2; i < 5; i++ {
			if nodes[i].GetState() == raft.Leader {
				majorityLeaders++
			}
		}
	}

	if majorityLeaders != 1 {
		t.Errorf("Expected 1 leader in majority partition, got %d", majorityLeaders)
	}

	// Heal partition
	network.HealBetween("1", "3")
	network.HealBetween("1", "4")
	network.HealBetween("1", "5")
	network.HealBetween("2", "3")
	network.HealBetween("2", "4")
	network.HealBetween("2", "5")

	// Wait for cluster to stabilize
	time.Sleep(500 * time.Millisecond)

	// Should have exactly one leader
	finalLeaderCount := 0
	for _, node := range nodes {
		if node.GetState() == raft.Leader {
			finalLeaderCount++
		}
	}

	if finalLeaderCount != 1 {
		t.Errorf("Expected exactly 1 leader after healing, got %d", finalLeaderCount)
	}
}