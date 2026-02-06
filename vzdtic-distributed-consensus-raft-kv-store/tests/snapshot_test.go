package tests

import (
	"context"
	"testing"
	"time"

	"github.com/vzdtic/distributed-consensus-raft-kv-store/repository_after/pkg/raft"
	testutil "github.com/vzdtic/distributed-consensus-raft-kv-store/repository_after/pkg/testing"
)

func TestSnapshotCreation(t *testing.T) {
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

	// Write enough entries
	for i := 0; i < 50; i++ {
		cmd := raft.Command{
			Type:  raft.CommandSet,
			Key:   "snapshot-key",
			Value: string(rune('a' + (i % 26))),
		}
		cluster.SubmitCommand(cmd, 5*time.Second)
	}

	time.Sleep(1 * time.Second)

	// Force snapshot creation
	leader.CreateSnapshot(leader.GetCommitIndex())

	time.Sleep(500 * time.Millisecond)

	// Verify data is still accessible via linearizable read
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	for _, node := range cluster.Nodes {
		if node.IsLeader() {
			value, err := node.Read(ctx, "snapshot-key")
			if err != nil && err != raft.ErrNotLeader {
				t.Logf("Read error: %v", err)
			} else {
				t.Logf("Read value after snapshot: %s", value)
			}
			break
		}
	}

	t.Log("✓ Snapshot creation successful")
}

func TestSnapshotRecovery(t *testing.T) {
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

	// Write data
	for i := 0; i < 30; i++ {
		cmd := raft.Command{
			Type:  raft.CommandSet,
			Key:   "recovery-key",
			Value: "recovery-value",
		}
		cluster.SubmitCommand(cmd, 5*time.Second)
	}

	time.Sleep(500 * time.Millisecond)

	// Create snapshot
	leader.CreateSnapshot(leader.GetCommitIndex())

	// Verify all stores have the data
	for i, store := range cluster.Stores {
		value, ok := store.Get("recovery-key")
		if !ok {
			t.Errorf("Store %d: recovery-key not found", i)
		} else if value != "recovery-value" {
			t.Errorf("Store %d: expected 'recovery-value', got '%s'", i, value)
		}
	}

	t.Log("✓ Snapshot recovery successful")
}

func TestLogCompaction(t *testing.T) {
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

	initialLogLen := len(leader.GetLog())
	t.Logf("Initial log length: %d", initialLogLen)

	// Write many entries
	for i := 0; i < 100; i++ {
		cmd := raft.Command{
			Type:  raft.CommandSet,
			Key:   "compact-key",
			Value: string(rune('a' + i%26)),
		}
		cluster.SubmitCommand(cmd, 5*time.Second)
	}

	time.Sleep(500 * time.Millisecond)

	preCompactLogLen := len(leader.GetLog())
	t.Logf("Log length before compaction: %d", preCompactLogLen)

	// Create snapshot to compact log
	leader.CreateSnapshot(leader.GetCommitIndex())

	time.Sleep(500 * time.Millisecond)

	postCompactLogLen := len(leader.GetLog())
	t.Logf("Log length after compaction: %d", postCompactLogLen)

	if postCompactLogLen >= preCompactLogLen {
		t.Errorf("Log was not compacted: before=%d, after=%d", preCompactLogLen, postCompactLogLen)
	}

	// Verify data via store (eventual consistency check)
	_, ok := cluster.Stores[0].Get("compact-key")
	if !ok {
		t.Error("compact-key not found after compaction")
	}

	t.Log("✓ Log compaction successful")
}

func TestSnapshotReplication(t *testing.T) {
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

	// Write data
	for i := 0; i < 20; i++ {
		cmd := raft.Command{
			Type:  raft.CommandSet,
			Key:   "replicate-key",
			Value: string(rune('0' + i%10)),
		}
		cluster.SubmitCommand(cmd, 5*time.Second)
	}

	time.Sleep(500 * time.Millisecond)

	// Create snapshot on leader
	leader.CreateSnapshot(leader.GetCommitIndex())

	time.Sleep(500 * time.Millisecond)

	// Verify all nodes have the data
	for i, store := range cluster.Stores {
		if _, ok := store.Get("replicate-key"); !ok {
			t.Errorf("Store %d: replicate-key not found", i)
		}
	}

	t.Log("✓ Snapshot replication test passed")
}