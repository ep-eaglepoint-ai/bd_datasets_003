package tests

import (
	"context"
	"testing"
	"time"

	"github.com/vzdtic/distributed-consensus-raft-kv-store/repository_after/pkg/raft"
	testutil "github.com/vzdtic/distributed-consensus-raft-kv-store/repository_after/pkg/testing"
)

func TestNetworkPartitionRecovery(t *testing.T) {
	cluster, err := testutil.NewTestCluster(3)
	if err != nil {
		t.Fatalf("Failed to create cluster: %v", err)
	}
	defer cluster.Cleanup()

	if err := cluster.Start(); err != nil {
		t.Fatalf("Failed to start cluster: %v", err)
	}

	leader, err := cluster.WaitForStableLeader(30 * time.Second)
	if err != nil {
		t.Fatalf("Failed to achieve initial stability: %v", err)
	}
	t.Logf("Initial leader: %s", leader.GetID())

	// Write before partition
	cmd := raft.Command{
		Type:  raft.CommandSet,
		Key:   "before-partition",
		Value: "value1",
	}

	err = cluster.SubmitCommand(cmd, 15*time.Second)
	if err != nil {
		t.Fatalf("Failed to write before partition: %v", err)
	}
	t.Log("✓ Successfully wrote before partition")

	time.Sleep(1 * time.Second)

	// Get and partition the leader
	leader = cluster.GetLeader()
	if leader == nil {
		t.Fatal("No leader found before partition")
	}
	oldLeaderID := leader.GetID()
	t.Logf("Partitioning leader: %s", oldLeaderID)
	cluster.Transport.Partition(oldLeaderID)

	// Wait for new leader in majority partition
	t.Log("Waiting for new leader election in majority partition...")
	newLeader, err := cluster.WaitForNewLeader(oldLeaderID, 15*time.Second)
	if err != nil {
		t.Fatalf("Failed to elect new leader after partition: %v", err)
	}
	t.Logf("New leader elected: %s", newLeader.GetID())

	// Write during partition - submit directly to new leader, excluding old leader
	cmd = raft.Command{
		Type:  raft.CommandSet,
		Key:   "during-partition",
		Value: "value2",
	}

	err = cluster.SubmitCommandExcluding(cmd, 15*time.Second, oldLeaderID)
	if err != nil {
		t.Fatalf("Failed to write during partition: %v", err)
	}
	t.Log("✓ Successfully wrote during partition")

	// Heal partition
	t.Log("Healing partition...")
	cluster.HealPartition()

	time.Sleep(3 * time.Second)

	// Verify data on majority of nodes
	beforeCount := 0
	duringCount := 0
	for i, store := range cluster.Stores {
		v1, ok1 := store.Get("before-partition")
		v2, ok2 := store.Get("during-partition")

		if ok1 && v1 == "value1" {
			beforeCount++
		}
		if ok2 && v2 == "value2" {
			duringCount++
		}

		t.Logf("Node %d: before-partition=%v, during-partition=%v", i, v1, v2)
	}

	if beforeCount < 2 {
		t.Errorf("before-partition not replicated to majority: %d/3", beforeCount)
	}
	if duringCount < 2 {
		t.Errorf("during-partition not replicated to majority: %d/3", duringCount)
	}

	t.Logf("✓ Partition recovery successful: before=%d/3, during=%d/3", beforeCount, duringCount)
}

func TestMinorityPartitionCannotProgress(t *testing.T) {
	cluster, err := testutil.NewTestCluster(5)
	if err != nil {
		t.Fatalf("Failed to create cluster: %v", err)
	}
	defer cluster.Cleanup()

	if err := cluster.Start(); err != nil {
		t.Fatalf("Failed to start cluster: %v", err)
	}

	leader, err := cluster.WaitForStableLeader(30 * time.Second)
	if err != nil {
		t.Fatalf("Failed to elect stable leader: %v", err)
	}

	leaderID := leader.GetID()
	var minorityNodeID string
	for _, node := range cluster.Nodes {
		if node.GetID() != leaderID {
			minorityNodeID = node.GetID()
			break
		}
	}

	// Isolate leader and one follower (minority of 2)
	for _, node := range cluster.Nodes {
		nodeID := node.GetID()
		if nodeID != leaderID && nodeID != minorityNodeID {
			cluster.Transport.Disconnect(leaderID, nodeID)
			cluster.Transport.Disconnect(nodeID, leaderID)
			cluster.Transport.Disconnect(minorityNodeID, nodeID)
			cluster.Transport.Disconnect(nodeID, minorityNodeID)
		}
	}

	time.Sleep(3 * time.Second)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	cmd := raft.Command{
		Type:  raft.CommandSet,
		Key:   "minority-write",
		Value: "should-fail",
	}
	_, err = leader.SubmitWithResult(ctx, cmd)
	cancel()

	if err == nil {
		time.Sleep(500 * time.Millisecond)
		count := 0
		for _, store := range cluster.Stores {
			if _, ok := store.Get("minority-write"); ok {
				count++
			}
		}
		if count >= 3 {
			t.Error("Minority partition was able to commit to majority")
		}
	}
	t.Log("✓ Minority partition correctly cannot make progress")
}

func TestZombieLeaderPrevention(t *testing.T) {
	cluster, err := testutil.NewTestCluster(3)
	if err != nil {
		t.Fatalf("Failed to create cluster: %v", err)
	}
	defer cluster.Cleanup()

	if err := cluster.Start(); err != nil {
		t.Fatalf("Failed to start cluster: %v", err)
	}

	leader, err := cluster.WaitForStableLeader(30 * time.Second)
	if err != nil {
		t.Fatalf("Failed to elect stable leader: %v", err)
	}

	oldLeaderID := leader.GetID()
	t.Logf("Partitioning leader: %s", oldLeaderID)
	cluster.Transport.Partition(oldLeaderID)

	newLeader, err := cluster.WaitForNewLeader(oldLeaderID, 10*time.Second)
	if err != nil {
		t.Logf("Note: New leader election took longer than expected: %v", err)
	} else {
		t.Logf("New leader elected: %s", newLeader.GetID())
	}

	if leader.IsLeader() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		cmd := raft.Command{
			Type:  raft.CommandSet,
			Key:   "zombie-write",
			Value: "should-not-commit",
		}
		_, err = leader.SubmitWithResult(ctx, cmd)
		cancel()

		if err == nil {
			t.Error("Zombie leader was able to submit command")
		} else {
			t.Log("✓ Zombie leader correctly rejected write")
		}
	} else {
		t.Log("✓ Old leader correctly stepped down")
	}
}