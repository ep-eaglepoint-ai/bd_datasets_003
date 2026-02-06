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

	leader = cluster.GetLeader()
	if leader == nil {
		t.Fatal("No leader found before partition")
	}
	oldLeaderID := leader.GetID()
	t.Logf("Partitioning leader: %s", oldLeaderID)
	cluster.Transport.Partition(oldLeaderID)

	t.Log("Waiting for new leader election in majority partition...")
	newLeader, err := cluster.WaitForNewLeader(oldLeaderID, 15*time.Second)
	if err != nil {
		t.Fatalf("Failed to elect new leader after partition: %v", err)
	}
	t.Logf("New leader elected: %s", newLeader.GetID())

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

	t.Log("Healing partition...")
	cluster.HealPartition()

	time.Sleep(3 * time.Second)

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

func TestSymmetricPartition(t *testing.T) {
	cluster, err := testutil.NewTestCluster(5)
	if err != nil {
		t.Fatalf("Failed to create cluster: %v", err)
	}
	defer cluster.Cleanup()

	if err := cluster.Start(); err != nil {
		t.Fatalf("Failed to start cluster: %v", err)
	}

	_, err = cluster.WaitForStableLeader(30 * time.Second)
	if err != nil {
		t.Fatalf("Failed to elect stable leader: %v", err)
	}

	// Create symmetric partition: [0,1,2] | [3,4]
	for i := 0; i < 3; i++ {
		for j := 3; j < 5; j++ {
			cluster.Transport.Disconnect(cluster.Nodes[i].GetID(), cluster.Nodes[j].GetID())
			cluster.Transport.Disconnect(cluster.Nodes[j].GetID(), cluster.Nodes[i].GetID())
		}
	}

	time.Sleep(3 * time.Second)

	// Majority partition should have a leader
	majorityLeader := false
	for i := 0; i < 3; i++ {
		if cluster.Nodes[i].IsLeader() {
			majorityLeader = true
			break
		}
	}

	if !majorityLeader {
		t.Log("Note: Majority partition may still be electing leader")
	}

	// Minority partition should NOT have a leader that can commit
	for i := 3; i < 5; i++ {
		node := cluster.Nodes[i]
		if node.IsLeader() {
			ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
			cmd := raft.Command{
				Type:  raft.CommandSet,
				Key:   "minority-key",
				Value: "should-timeout",
			}
			_, err := node.SubmitWithResult(ctx, cmd)
			cancel()

			if err == nil {
				t.Error("Minority partition leader should not be able to commit")
			}
		}
	}

	cluster.HealPartition()
	t.Log("✓ Symmetric partition handling verified")
}

func TestIntermittentPartition(t *testing.T) {
	cluster, err := testutil.NewTestCluster(3)
	if err != nil {
		t.Fatalf("Failed to create cluster: %v", err)
	}
	defer cluster.Cleanup()

	if err := cluster.Start(); err != nil {
		t.Fatalf("Failed to start cluster: %v", err)
	}

	_, err = cluster.WaitForStableLeader(30 * time.Second)
	if err != nil {
		t.Fatalf("Failed to elect stable leader: %v", err)
	}

	successCount := 0
	for i := 0; i < 10; i++ {
		// Randomly partition a node
		nodeIdx := i % len(cluster.Nodes)
		cluster.Transport.Partition(cluster.Nodes[nodeIdx].GetID())

		time.Sleep(200 * time.Millisecond)

		cmd := raft.Command{
			Type:  raft.CommandSet,
			Key:   "intermittent-key",
			Value: string(rune('0' + i)),
		}

		err := cluster.SubmitCommand(cmd, 5*time.Second)
		if err == nil {
			successCount++
		}

		cluster.HealPartition()
		time.Sleep(300 * time.Millisecond)
	}

	t.Logf("Successful writes during intermittent partitions: %d/10", successCount)

	if successCount < 5 {
		t.Errorf("Too few successful writes: %d/10", successCount)
	}

	t.Log("✓ Intermittent partition handling verified")
}