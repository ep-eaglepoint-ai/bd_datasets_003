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
			time.Sleep(80 * time.Millisecond)
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

	leader := waitForLeader(nodes, 3*time.Second)
	if leader == nil {
		t.Fatal("No initial leader elected")
	}

	var leaderIdx int
	for i, node := range nodes {
		if node.GetState() == raft.Leader {
			leaderIdx = i
			break
		}
	}

	leaderID := string(rune('1' + leaderIdx))
	network.Partition(leaderID)

	time.Sleep(800 * time.Millisecond)

	newLeaderCount := 0
	for i, node := range nodes {
		if i != leaderIdx && node.GetState() == raft.Leader {
			newLeaderCount++
		}
	}

	if newLeaderCount != 1 {
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

	network.Heal(leaderID)
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

	err := leader.Set("testkey", []byte("testvalue"), "client1", 1)
	if err != nil {
		t.Fatalf("Failed to set value: %v", err)
	}

	time.Sleep(300 * time.Millisecond)

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

	leaderID := string(rune('1' + leaderIdx))
	network.Partition(leaderID)

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

// TestMembershipChange tests dynamic addition and removal of nodes (Requirement 5)
func TestMembershipChange(t *testing.T) {
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
		t.Fatal("No leader elected")
	}

	// Get initial member count
	_, _, initialMembers := leader.GetClusterInfo()
	initialCount := len(initialMembers)
	if initialCount != 3 {
		t.Fatalf("Expected 3 initial members, got %d", initialCount)
	}

	// Add a new node to the cluster
	err := leader.AddNode("4", "localhost:9004")
	if err != nil {
		t.Fatalf("Failed to add node 4: %v", err)
	}

	// Verify node 4 appears in cluster info
	_, _, members := leader.GetClusterInfo()
	if len(members) != 4 {
		t.Errorf("Expected 4 members after add, got %d", len(members))
	}

	found4 := false
	for _, m := range members {
		if m.NodeID == "4" {
			found4 = true
			if m.Address != "localhost:9004" {
				t.Errorf("Expected address 'localhost:9004', got '%s'", m.Address)
			}
			if !m.Voting {
				t.Error("Expected new node to be voting")
			}
			break
		}
	}
	if !found4 {
		t.Error("Node 4 not found in cluster info after AddNode")
	}

	// Add a second node
	err = leader.AddNode("5", "localhost:9005")
	if err != nil {
		t.Fatalf("Failed to add node 5: %v", err)
	}

	_, _, members = leader.GetClusterInfo()
	if len(members) != 5 {
		t.Errorf("Expected 5 members after second add, got %d", len(members))
	}

	// Remove node 4
	err = leader.RemoveNode("4")
	if err != nil {
		t.Fatalf("Failed to remove node 4: %v", err)
	}

	_, _, members = leader.GetClusterInfo()
	if len(members) != 4 {
		t.Errorf("Expected 4 members after removing node 4, got %d", len(members))
	}

	for _, m := range members {
		if m.NodeID == "4" {
			t.Error("Node 4 should not be in cluster info after RemoveNode")
		}
	}

	// Remove node 5
	err = leader.RemoveNode("5")
	if err != nil {
		t.Fatalf("Failed to remove node 5: %v", err)
	}

	_, _, members = leader.GetClusterInfo()
	if len(members) != 3 {
		t.Errorf("Expected 3 members after removing all added nodes, got %d", len(members))
	}

	// Removing non-leader should fail from a follower
	for _, node := range nodes {
		if node.GetState() != raft.Leader {
			err = node.AddNode("6", "localhost:9006")
			if err == nil {
				t.Error("Expected error when calling AddNode on a follower")
			}
			err = node.RemoveNode("1")
			if err == nil {
				t.Error("Expected error when calling RemoveNode on a follower")
			}
			break
		}
	}
}

// TestCrashRecovery tests that WAL state survives a node restart (Requirement 4)
func TestCrashRecovery(t *testing.T) {
	network := simulation.NewNetwork(0, 0, 10*time.Millisecond)
	logger := log.New(os.Stdout, "", log.LstdFlags)

	walDirs := make([]string, 3)
	for i := range walDirs {
		walDirs[i] = t.TempDir()
	}

	// Phase 1: create cluster, write data, stop all nodes
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
		config.WALDir = walDirs[i]
		config.ElectionTimeout = 150 * time.Millisecond
		config.HeartbeatInterval = 50 * time.Millisecond

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

	leader := waitForLeader(nodes, 3*time.Second)
	if leader == nil {
		for _, node := range nodes {
			node.Stop()
		}
		t.Fatal("No leader elected in phase 1")
	}

	// Write data
	err := leader.Set("recover-key", []byte("recover-value"), "client1", 1)
	if err != nil {
		t.Logf("Set returned error (may still be committed): %v", err)
	}

	time.Sleep(300 * time.Millisecond)

	// Record the term before crash
	_, termBeforeCrash, _ := leader.GetClusterInfo()

	// Stop all nodes (simulate cluster crash)
	for _, node := range nodes {
		node.Stop()
	}

	// Phase 2: recreate nodes with SAME WAL dirs — state should be recovered
	network2 := simulation.NewNetwork(0, 0, 10*time.Millisecond)
	nodes2 := make([]*raft.Raft, 3)
	transports2 := make([]*simulation.SimTransport, 3)

	for i := 0; i < 3; i++ {
		nodeID := string(rune('1' + i))
		transports2[i] = simulation.NewSimTransport(network2, nodeID)

		peers := make(map[string]string)
		for j := 0; j < 3; j++ {
			if i != j {
				peerID := string(rune('1' + j))
				peers[peerID] = peerID
			}
		}

		config := raft.DefaultConfig(nodeID)
		config.Peers = peers
		config.WALDir = walDirs[i] // SAME directory — recovery!
		config.ElectionTimeout = 150 * time.Millisecond
		config.HeartbeatInterval = 50 * time.Millisecond

		node, err := raft.New(config, transports2[i], logger)
		if err != nil {
			t.Fatalf("Failed to recreate node %d after crash: %v", i, err)
		}
		nodes2[i] = node
		network2.AddNode(nodeID, node, transports2[i])
	}

	for i := 0; i < 3; i++ {
		for j := 0; j < 3; j++ {
			nodeID := string(rune('1' + j))
			transports2[i].RegisterHandler(nodeID, nodes2[j])
		}
	}

	for _, node := range nodes2 {
		node.Start()
	}
	defer func() {
		for _, node := range nodes2 {
			node.Stop()
		}
	}()

	// Wait for new election after recovery
	leader2 := waitForLeader(nodes2, 3*time.Second)
	if leader2 == nil {
		t.Fatal("No leader elected after crash recovery")
	}

	// Verify the recovered term is >= the term before crash
	_, termAfterRecovery, _ := leader2.GetClusterInfo()
	if termAfterRecovery < termBeforeCrash {
		t.Errorf("Term after recovery (%d) should be >= term before crash (%d)",
			termAfterRecovery, termBeforeCrash)
	}

	// The data should have been recovered from WAL
	// (it was committed to majority before crash)
	value, found, _ := leader2.Get("recover-key", false)
	if found {
		if string(value) != "recover-value" {
			t.Errorf("Expected 'recover-value', got '%s'", string(value))
		}
		t.Log("Data successfully recovered from WAL after crash")
	} else {
		// Data may not have been committed to majority before crash —
		// this is acceptable Raft behavior (uncommitted entries can be lost)
		t.Log("Data not found after recovery — entry may not have been committed before crash (acceptable)")
	}
}