package tests

import (
	"context"
	"testing"
	"time"

	"github.com/vzdtic/distributed-consensus-raft-kv-store/repository_after/pkg/raft"
	testutil "github.com/vzdtic/distributed-consensus-raft-kv-store/repository_after/pkg/testing"
)

func TestAddNode(t *testing.T) {
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

	initialSize := leader.GetClusterSize()
	t.Logf("Initial cluster size: %d", initialSize)

	// Add a new node
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err = leader.AddNodeWithContext(ctx, "new-node-1")
	if err != nil {
		t.Fatalf("Failed to add node: %v", err)
	}

	newSize := leader.GetClusterSize()
	if newSize != initialSize+1 {
		t.Errorf("Expected cluster size %d, got %d", initialSize+1, newSize)
	}

	t.Logf("✓ Successfully added node, new cluster size: %d", newSize)
}

func TestRemoveNode(t *testing.T) {
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

	initialSize := leader.GetClusterSize()
	t.Logf("Initial cluster size: %d", initialSize)

	// Find a non-leader node to remove
	var nodeToRemove string
	for _, node := range cluster.Nodes {
		if node.GetID() != leader.GetID() {
			nodeToRemove = node.GetID()
			break
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err = leader.RemoveNodeWithContext(ctx, nodeToRemove)
	if err != nil {
		t.Fatalf("Failed to remove node: %v", err)
	}

	newSize := leader.GetClusterSize()
	if newSize != initialSize-1 {
		t.Errorf("Expected cluster size %d, got %d", initialSize-1, newSize)
	}

	t.Logf("✓ Successfully removed node %s, new cluster size: %d", nodeToRemove, newSize)
}

func TestMembershipChangeOnlyOneAtATime(t *testing.T) {
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

	// Start first membership change
	err = leader.AddNode("new-node-1")
	if err != nil {
		t.Fatalf("First AddNode failed: %v", err)
	}

	// Try second membership change immediately (should fail)
	err = leader.AddNode("new-node-2")
	if err != raft.ErrMembershipChangePending {
		t.Errorf("Expected ErrMembershipChangePending, got: %v", err)
	}

	t.Log("✓ Correctly rejected concurrent membership change")
}

func TestDataConsistencyAfterMembershipChange(t *testing.T) {
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

	// Write some data before membership change
	cmd := raft.Command{
		Type:  raft.CommandSet,
		Key:   "before-change",
		Value: "value1",
	}
	err = cluster.SubmitCommand(cmd, 10*time.Second)
	if err != nil {
		t.Fatalf("Failed to write before membership change: %v", err)
	}

	// Add a new node
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err = leader.AddNodeWithContext(ctx, "new-node-1")
	if err != nil {
		t.Fatalf("Failed to add node: %v", err)
	}

	// Write more data after membership change
	cmd = raft.Command{
		Type:  raft.CommandSet,
		Key:   "after-change",
		Value: "value2",
	}
	err = cluster.SubmitCommand(cmd, 10*time.Second)
	if err != nil {
		t.Fatalf("Failed to write after membership change: %v", err)
	}

	time.Sleep(500 * time.Millisecond)

	// Verify all original nodes have both values
	for i, store := range cluster.Stores {
		v1, ok1 := store.Get("before-change")
		v2, ok2 := store.Get("after-change")

		if !ok1 || v1 != "value1" {
			t.Errorf("Store %d: before-change incorrect: %v", i, v1)
		}
		if !ok2 || v2 != "value2" {
			t.Errorf("Store %d: after-change incorrect: %v", i, v2)
		}
	}

	t.Log("✓ Data consistency maintained after membership change")
}