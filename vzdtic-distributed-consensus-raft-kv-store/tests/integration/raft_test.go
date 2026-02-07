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
			time.Sleep(80 * time.Millisecond)
			// Verify still leader
			if leader.GetState() == raft.Leader {
				return leader
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	return nil
}

// createCluster is a helper to build an N-node simulated cluster
func createCluster(t *testing.T, n int, network *simulation.Network, logger *log.Logger, electionTimeout, heartbeatInterval time.Duration) ([]*raft.Raft, []*simulation.SimTransport) {
	t.Helper()

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
		config.ElectionTimeout = electionTimeout
		config.HeartbeatInterval = heartbeatInterval

		node, err := raft.New(config, transports[i], logger)
		if err != nil {
			t.Fatalf("Failed to create node %d: %v", i, err)
		}
		nodes[i] = node
		network.AddNode(nodeID, node, transports[i])
	}

	// Register all handlers
	for i := 0; i < n; i++ {
		for j := 0; j < n; j++ {
			nodeID := string(rune('1' + j))
			transports[i].RegisterHandler(nodeID, nodes[j])
		}
	}

	return nodes, transports
}

func TestThreeNodeClusterElection(t *testing.T) {
	network := simulation.NewNetwork(0, 0, 10*time.Millisecond)
	logger := log.New(os.Stdout, "", log.LstdFlags)

	nodes, _ := createCluster(t, 3, network, logger, 150*time.Millisecond, 50*time.Millisecond)

	for _, node := range nodes {
		node.Start()
	}
	defer func() {
		for _, node := range nodes {
			node.Stop()
		}
	}()

	leader := waitForLeader(nodes, 3*time.Second)
	if leader == nil {
		t.Fatal("Expected exactly 1 leader, none elected within timeout")
	}

	// Verify only one leader
	leaderCount := 0
	for _, node := range nodes {
		if node.GetState() == raft.Leader {
			leaderCount++
		}
	}
	if leaderCount != 1 {
		t.Errorf("Expected exactly 1 leader, got %d", leaderCount)
	}
}

func TestLeaderElectionAfterPartition(t *testing.T) {
	network := simulation.NewNetwork(0, 0, 10*time.Millisecond)
	logger := log.New(os.Stdout, "", log.LstdFlags)

	nodes, _ := createCluster(t, 3, network, logger, 150*time.Millisecond, 50*time.Millisecond)

	for _, node := range nodes {
		node.Start()
	}
	defer func() {
		for _, node := range nodes {
			node.Stop()
		}
	}()

	// Wait for initial leader
	leader := waitForLeader(nodes, 3*time.Second)
	if leader == nil {
		t.Fatal("No initial leader elected")
	}

	// Find leader index
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

	// Wait for new leader among remaining nodes
	time.Sleep(800 * time.Millisecond)

	newLeaderCount := 0
	for i, node := range nodes {
		if i != leaderIdx && node.GetState() == raft.Leader {
			newLeaderCount++
		}
	}

	if newLeaderCount != 1 {
		// Give more time — vote-splitting can happen
		time.Sleep(500 * time.Millisecond)
		newLeaderCount = 0
		for i, node := range nodes {
			if i != leaderIdx && node.GetState() == raft.Leader {
				newLeaderCount++
			}
		}
	}

	if newLeaderCount != 1 {
		t.Errorf("Expected exactly 1 new leader after partition, got %d", newLeaderCount)
	}

	// Heal partition
	network.Heal(leaderID)

	// Wait for cluster to stabilize
	time.Sleep(500 * time.Millisecond)

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

func TestLogReplication(t *testing.T) {
	network := simulation.NewNetwork(0, 0, 10*time.Millisecond)
	logger := log.New(os.Stdout, "", log.LstdFlags)

	nodes, _ := createCluster(t, 3, network, logger, 150*time.Millisecond, 50*time.Millisecond)

	for _, node := range nodes {
		node.Start()
	}
	defer func() {
		for _, node := range nodes {
			node.Stop()
		}
	}()

	leader := waitForLeader(nodes, 3*time.Second)
	if leader == nil {
		t.Fatal("No leader elected within timeout")
	}

	// Set a value through leader
	err := leader.Set("testkey", []byte("testvalue"), "client1", 1)
	if err != nil {
		t.Fatalf("Failed to set value: %v", err)
	}

	// Wait for replication
	time.Sleep(300 * time.Millisecond)

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
}

func TestTermNumbering(t *testing.T) {
	network := simulation.NewNetwork(0, 0, 10*time.Millisecond)
	logger := log.New(os.Stdout, "", log.LstdFlags)

	nodes, _ := createCluster(t, 3, network, logger, 150*time.Millisecond, 50*time.Millisecond)

	for _, node := range nodes {
		node.Start()
	}
	defer func() {
		for _, node := range nodes {
			node.Stop()
		}
	}()

	leader := waitForLeader(nodes, 3*time.Second)
	if leader == nil {
		t.Fatal("No initial leader elected")
	}

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
	time.Sleep(800 * time.Millisecond)

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
	network.Heal(leaderID)
}

func TestFiveNodeCluster(t *testing.T) {
	network := simulation.NewNetwork(0, 0, 10*time.Millisecond)
	logger := log.New(os.Stdout, "", log.LstdFlags)

	nodes, _ := createCluster(t, 5, network, logger, 200*time.Millisecond, 60*time.Millisecond)

	for _, node := range nodes {
		node.Start()
	}
	defer func() {
		for _, node := range nodes {
			node.Stop()
		}
	}()

	// 5-node clusters are more prone to vote-splitting; give plenty of time
	leader := waitForLeader(nodes, 5*time.Second)
	if leader == nil {
		t.Fatal("Expected exactly 1 leader in 5-node cluster, none elected within timeout")
	}

	leaderCount := 0
	for _, node := range nodes {
		if node.GetState() == raft.Leader {
			leaderCount++
		}
	}

	if leaderCount != 1 {
		t.Errorf("Expected exactly 1 leader in 5-node cluster, got %d", leaderCount)
	}
}

func TestMessageLoss(t *testing.T) {
	// Create network with 20% message loss
	network := simulation.NewNetwork(0.2, 0, 10*time.Millisecond)
	logger := log.New(os.Stdout, "", log.LstdFlags)

	nodes, _ := createCluster(t, 3, network, logger, 200*time.Millisecond, 60*time.Millisecond)

	for _, node := range nodes {
		node.Start()
	}
	defer func() {
		for _, node := range nodes {
			node.Stop()
		}
	}()

	// Longer timeout because message loss slows things down
	leader := waitForLeader(nodes, 5*time.Second)
	if leader == nil {
		t.Fatal("Expected exactly 1 leader despite message loss, none elected within timeout")
	}

	leaderCount := 0
	for _, node := range nodes {
		if node.GetState() == raft.Leader {
			leaderCount++
		}
	}

	if leaderCount != 1 {
		t.Errorf("Expected exactly 1 leader despite message loss, got %d", leaderCount)
	}
}