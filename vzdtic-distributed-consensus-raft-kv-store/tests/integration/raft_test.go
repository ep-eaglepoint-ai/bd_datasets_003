package integration

import (
	"log"
	"os"
	"testing"
	"time"

	"github.com/vzdtic/raft-kv-store/repository_after/pkg/raft"
	"github.com/vzdtic/raft-kv-store/repository_after/pkg/simulation"
)

// waitForLeader waits for a stable leader to be elected and returns it
func waitForLeader(nodes []*raft.Raft, timeout time.Duration) *raft.Raft {
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
			// Wait a bit more to ensure stability
			time.Sleep(50 * time.Millisecond)
			// Verify still leader
			if leader.GetState() == raft.Leader {
				return leader
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	return nil
}

func TestThreeNodeClusterElection(t *testing.T) {
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

	// Wait for election
	time.Sleep(500 * time.Millisecond)

	// Count leaders
	leaderCount := 0
	for _, node := range nodes {
		if node.GetState() == raft.Leader {
			leaderCount++
		}
	}

	if leaderCount != 1 {
		t.Errorf("Expected exactly 1 leader, got %d", leaderCount)
	}

	// Cleanup
	for _, node := range nodes {
		node.Stop()
	}
}

func TestLeaderElectionAfterPartition(t *testing.T) {
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

	// Wait for initial election
	time.Sleep(500 * time.Millisecond)

	// Find current leader
	var leaderIdx int
	for i, node := range nodes {
		if node.GetState() == raft.Leader {
			leaderIdx = i
			break
		}
	}

	// Partition the leader
	leaderID := string(rune('1' + leaderIdx))
	network.Partition(leaderID)

	// Wait for new election among remaining nodes
	time.Sleep(700 * time.Millisecond)

	// Count leaders among non-partitioned nodes
	newLeaderCount := 0
	for i, node := range nodes {
		if i != leaderIdx && node.GetState() == raft.Leader {
			newLeaderCount++
		}
	}

	if newLeaderCount != 1 {
		t.Errorf("Expected exactly 1 new leader after partition, got %d", newLeaderCount)
	}

	// Heal partition
	network.Heal(leaderID)

	// Wait for cluster to stabilize
	time.Sleep(500 * time.Millisecond)

	// Should have exactly 1 leader in entire cluster
	finalLeaderCount := 0
	for _, node := range nodes {
		if node.GetState() == raft.Leader {
			finalLeaderCount++
		}
	}

	if finalLeaderCount != 1 {
		t.Errorf("Expected exactly 1 leader after healing, got %d", finalLeaderCount)
	}

	// Cleanup
	for _, node := range nodes {
		node.Stop()
	}
}

func TestLogReplication(t *testing.T) {
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

	// Wait for a stable leader with retry
	leader := waitForLeader(nodes, 2*time.Second)
	if leader == nil {
		t.Fatal("No leader elected within timeout")
	}

	// Set a value through leader
	err := leader.Set("testkey", []byte("testvalue"), "client1", 1)
	if err != nil {
		t.Fatalf("Failed to set value: %v", err)
	}

	// Wait for replication
	time.Sleep(200 * time.Millisecond)

	// Verify value on leader
	value, found, err := leader.Get("testkey", false)
	if err != nil {
		t.Fatalf("Failed to get value: %v", err)
	}
	if !found {
		t.Error("Expected to find testkey on leader")
	}
	if string(value) != "testvalue" {
		t.Errorf("Expected 'testvalue', got '%s'", string(value))
	}

	// Cleanup
	for _, node := range nodes {
		node.Stop()
	}
}

func TestTermNumbering(t *testing.T) {
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

	// Wait for election
	time.Sleep(500 * time.Millisecond)

	// Find leader and record term
	var leaderIdx int
	var initialTerm uint64
	for i, node := range nodes {
		if node.GetState() == raft.Leader {
			leaderIdx = i
			_, initialTerm, _ = node.GetClusterInfo()
			break
		}
	}

	// Partition leader to force new election
	leaderID := string(rune('1' + leaderIdx))
	network.Partition(leaderID)

	// Wait for new election
	time.Sleep(700 * time.Millisecond)

	// Find new leader and check term increased
	var newTerm uint64
	for i, node := range nodes {
		if i != leaderIdx && node.GetState() == raft.Leader {
			_, newTerm, _ = node.GetClusterInfo()
			break
		}
	}

	if newTerm <= initialTerm {
		t.Errorf("Expected term to increase after new election, was %d now %d", initialTerm, newTerm)
	}

	// Cleanup
	for _, node := range nodes {
		node.Stop()
	}
}

func TestFiveNodeCluster(t *testing.T) {
	network := simulation.NewNetwork(0, 0, 10*time.Millisecond)
	logger := log.New(os.Stdout, "", log.LstdFlags)

	numNodes := 5
	nodes := make([]*raft.Raft, numNodes)
	transports := make([]*simulation.SimTransport, numNodes)

	for i := 0; i < numNodes; i++ {
		nodeID := string(rune('1' + i))
		transports[i] = simulation.NewSimTransport(network, nodeID)

		peers := make(map[string]string)
		for j := 0; j < numNodes; j++ {
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
	for i := 0; i < numNodes; i++ {
		for j := 0; j < numNodes; j++ {
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

	// Should have exactly one leader
	leaderCount := 0
	for _, node := range nodes {
		if node.GetState() == raft.Leader {
			leaderCount++
		}
	}

	if leaderCount != 1 {
		t.Errorf("Expected exactly 1 leader in 5-node cluster, got %d", leaderCount)
	}

	// Cleanup
	for _, node := range nodes {
		node.Stop()
	}
}

func TestMessageLoss(t *testing.T) {
	// Create network with 20% message loss
	network := simulation.NewNetwork(0.2, 0, 10*time.Millisecond)
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
		config.HeartbeatInterval = 40 * time.Millisecond

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

	// Wait for election (longer due to message loss)
	time.Sleep(1000 * time.Millisecond)

	// Should eventually elect a leader despite message loss
	leaderCount := 0
	for _, node := range nodes {
		if node.GetState() == raft.Leader {
			leaderCount++
		}
	}

	if leaderCount != 1 {
		t.Errorf("Expected exactly 1 leader despite message loss, got %d", leaderCount)
	}

	// Cleanup
	for _, node := range nodes {
		node.Stop()
	}
}