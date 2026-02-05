package tests

import (
	"testing"
	"time"

	"github.com/vzdtic/distributed-consensus-raft-kv-store/repository_after/pkg/raft"
	testutil "github.com/vzdtic/distributed-consensus-raft-kv-store/repository_after/pkg/testing"
)

func TestClusterFormation(t *testing.T) {
	cluster, err := testutil.NewTestCluster(3)
	if err != nil {
		t.Fatalf("Failed to create cluster: %v", err)
	}
	defer cluster.Cleanup()

	if err := cluster.Start(); err != nil {
		t.Fatalf("Failed to start cluster: %v", err)
	}

	leader, err := cluster.WaitForLeader(15 * time.Second)
	if err != nil {
		t.Fatalf("Failed to elect leader: %v", err)
	}

	if leader == nil {
		t.Fatal("No leader was elected")
	}

	t.Logf("Leader elected: %s", leader.GetID())
}

func TestBasicSetGet(t *testing.T) {
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

	cmd := raft.Command{
		Type:  raft.CommandSet,
		Key:   "test-key",
		Value: "test-value",
	}

	err = cluster.SubmitCommand(cmd, 15*time.Second)
	if err != nil {
		t.Fatalf("Failed to submit command: %v", err)
	}

	time.Sleep(500 * time.Millisecond)

	for i, store := range cluster.Stores {
		value, ok := store.Get("test-key")
		if !ok {
			t.Errorf("Store %d: key not found", i)
		} else if value != "test-value" {
			t.Errorf("Store %d: expected 'test-value', got '%s'", i, value)
		}
	}
}

func TestMultipleWrites(t *testing.T) {
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
		cmd := raft.Command{
			Type:  raft.CommandSet,
			Key:   "key",
			Value: string(rune('a' + i)),
		}

		err := cluster.SubmitCommand(cmd, 10*time.Second)
		if err == nil {
			successCount++
		} else {
			t.Logf("Command %d failed: %v", i, err)
		}
	}

	if successCount < 5 {
		t.Fatalf("Too few commands succeeded: %d/10", successCount)
	}

	t.Logf("Successful writes: %d/10", successCount)

	time.Sleep(500 * time.Millisecond)

	var finalValue string
	for i, store := range cluster.Stores {
		value, ok := store.Get("key")
		if !ok {
			t.Errorf("Store %d: key not found", i)
			continue
		}
		if finalValue == "" {
			finalValue = value
		} else if value != finalValue {
			t.Errorf("Store %d: expected '%s', got '%s'", i, finalValue, value)
		}
	}
}

func TestLeaderElectionOnFailure(t *testing.T) {
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
	t.Logf("Initial leader: %s", oldLeaderID)

	cluster.Transport.Partition(oldLeaderID)

	newLeader, err := cluster.WaitForNewLeader(oldLeaderID, 10*time.Second)
	if err != nil {
		t.Fatalf("Failed to elect new leader: %v", err)
	}

	t.Logf("New leader: %s", newLeader.GetID())

	cmd := raft.Command{
		Type:  raft.CommandSet,
		Key:   "after-partition",
		Value: "new-value",
	}

	err = cluster.SubmitCommandExcluding(cmd, 15*time.Second, oldLeaderID)
	if err != nil {
		t.Fatalf("New leader failed to accept write: %v", err)
	}

	t.Log("✓ Successfully wrote after leader partition")
}

func TestLogReplication(t *testing.T) {
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

	successCount := 0
	for i := 0; i < 5; i++ {
		cmd := raft.Command{
			Type:  raft.CommandSet,
			Key:   "replicated-key",
			Value: "replicated-value",
		}

		err := cluster.SubmitCommand(cmd, 10*time.Second)
		if err == nil {
			successCount++
		} else {
			t.Logf("Command %d failed: %v", i, err)
		}
	}

	if successCount < 3 {
		t.Fatalf("Too few commands succeeded: %d/5", successCount)
	}

	t.Logf("Successfully replicated %d/5 commands", successCount)

	time.Sleep(1 * time.Second)

	leader := cluster.GetLeader()
	if leader == nil {
		t.Fatal("No leader found after commands")
	}

	leaderCommit := leader.GetCommitIndex()
	t.Logf("Leader commit index: %d", leaderCommit)

	if leaderCommit < 3 {
		t.Errorf("Leader commit index too low: %d", leaderCommit)
	}
}

func TestTermProgression(t *testing.T) {
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

	var initialTerm uint64
	for _, node := range cluster.Nodes {
		term, _ := node.GetState()
		if term > initialTerm {
			initialTerm = term
		}
	}

	leader := cluster.GetLeader()
	if leader == nil {
		t.Fatal("No leader found")
	}
	cluster.Transport.Partition(leader.GetID())

	time.Sleep(3 * time.Second)

	var newTerm uint64
	for _, node := range cluster.Nodes {
		if node.GetID() != leader.GetID() {
			term, _ := node.GetState()
			if term > newTerm {
				newTerm = term
			}
		}
	}

	if newTerm <= initialTerm {
		t.Errorf("Term did not increase after leader failure: initial=%d, new=%d",
			initialTerm, newTerm)
	}
}