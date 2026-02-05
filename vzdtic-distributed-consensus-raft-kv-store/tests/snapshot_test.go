package tests

import (
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

	_, err = cluster.WaitForStableLeader(15 * time.Second)
	if err != nil {
		t.Fatalf("Failed to elect stable leader: %v", err)
	}

	for i := 0; i < 50; i++ {
		cmd := raft.Command{
			Type:  raft.CommandSet,
			Key:   "snapshot-key",
			Value: string(rune('a' + (i % 26))),
		}

		err := cluster.SubmitCommand(cmd, 10*time.Second)
		if err != nil {
			t.Fatalf("Failed to submit command %d: %v", i, err)
		}
	}

	time.Sleep(1 * time.Second)

	leader := cluster.GetLeader()
	if leader == nil {
		t.Fatal("No leader after commands")
	}

	err = leader.CreateSnapshot(leader.GetCommitIndex())
	if err != nil {
		t.Fatalf("Failed to create snapshot: %v", err)
	}

	for i, store := range cluster.Stores {
		if _, ok := store.Get("snapshot-key"); !ok {
			t.Errorf("Store %d: key not found after snapshot", i)
		}
	}
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

	_, err = cluster.WaitForStableLeader(15 * time.Second)
	if err != nil {
		t.Fatalf("Failed to elect stable leader: %v", err)
	}

	for i := 0; i < 20; i++ {
		cmd := raft.Command{
			Type:  raft.CommandSet,
			Key:   "recovery-key",
			Value: string(rune('a' + (i % 26))),
		}

		err := cluster.SubmitCommand(cmd, 10*time.Second)
		if err != nil {
			t.Fatalf("Failed to submit command: %v", err)
		}
	}

	time.Sleep(500 * time.Millisecond)

	for i, store := range cluster.Stores {
		value, ok := store.Get("recovery-key")
		if !ok {
			t.Errorf("Store %d: key not found", i)
		} else {
			t.Logf("Store %d: recovery-key=%s", i, value)
		}
	}
}