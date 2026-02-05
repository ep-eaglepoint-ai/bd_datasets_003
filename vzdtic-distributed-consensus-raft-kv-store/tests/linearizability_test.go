package tests

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/vzdtic/distributed-consensus-raft-kv-store/repository_after/pkg/raft"
	testutil "github.com/vzdtic/distributed-consensus-raft-kv-store/repository_after/pkg/testing"
)

func TestLinearizableWrites(t *testing.T) {
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

	for i := 0; i < 5; i++ {
		cmd := raft.Command{
			Type:  raft.CommandSet,
			Key:   "sequential-key",
			Value: string(rune('0' + i)),
		}

		err := cluster.SubmitCommand(cmd, 10*time.Second)
		if err != nil {
			t.Logf("Write %d failed: %v", i, err)
		}
	}

	time.Sleep(1 * time.Second)

	var finalValue string
	for i, store := range cluster.Stores {
		value, ok := store.Get("sequential-key")
		if ok {
			if finalValue == "" {
				finalValue = value
			} else if value != finalValue {
				t.Errorf("Store %d: inconsistent value, expected %s, got %s", i, finalValue, value)
			}
		}
	}

	if finalValue == "" {
		t.Error("No value found in any store")
	}
}

func TestNoTwoLeaders(t *testing.T) {
	cluster, err := testutil.NewTestCluster(5)
	if err != nil {
		t.Fatalf("Failed to create cluster: %v", err)
	}
	defer cluster.Cleanup()

	if err := cluster.Start(); err != nil {
		t.Fatalf("Failed to start cluster: %v", err)
	}

	_, err = cluster.WaitForLeader(15 * time.Second)
	if err != nil {
		t.Fatalf("Failed to elect leader: %v", err)
	}

	for check := 0; check < 10; check++ {
		time.Sleep(200 * time.Millisecond)

		leaders := make([]*raft.Node, 0)
		for _, node := range cluster.Nodes {
			if node.IsLeader() {
				leaders = append(leaders, node)
			}
		}

		if len(leaders) > 1 {
			terms := make(map[uint64][]string)
			for _, leader := range leaders {
				term, _ := leader.GetState()
				terms[term] = append(terms[term], leader.GetID())
			}

			for term, nodeIDs := range terms {
				if len(nodeIDs) > 1 {
					t.Errorf("Multiple leaders in same term %d: %v", term, nodeIDs)
				}
			}
		}
	}
}

func TestCommitIndexSafety(t *testing.T) {
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

	for i := 0; i < 5; i++ {
		cmd := raft.Command{
			Type:  raft.CommandSet,
			Key:   "safety-key",
			Value: string(rune('a' + i)),
		}

		err := cluster.SubmitCommand(cmd, 10*time.Second)
		if err != nil {
			t.Fatalf("Failed to submit command: %v", err)
		}
	}

	time.Sleep(500 * time.Millisecond)

	leader := cluster.GetLeader()
	if leader == nil {
		t.Fatal("No leader after commands")
	}

	leaderCommit := leader.GetCommitIndex()
	for _, node := range cluster.Nodes {
		nodeCommit := node.GetCommitIndex()
		if nodeCommit > leaderCommit {
			t.Errorf("Node %s has higher commit index (%d) than leader (%d)",
				node.GetID(), nodeCommit, leaderCommit)
		}
	}
}

func TestSameIndexSameCommand(t *testing.T) {
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

	for i := 0; i < 10; i++ {
		cmd := raft.Command{
			Type:  raft.CommandSet,
			Key:   "index-key",
			Value: string(rune('a' + i)),
		}

		err := cluster.SubmitCommand(cmd, 10*time.Second)
		if err != nil {
			t.Fatalf("Failed to submit command: %v", err)
		}
	}

	time.Sleep(1 * time.Second)

	logs := make([][]raft.LogEntry, len(cluster.Nodes))
	for i, node := range cluster.Nodes {
		logs[i] = node.GetLog()
	}

	minCommit := cluster.Nodes[0].GetCommitIndex()
	for _, node := range cluster.Nodes {
		commit := node.GetCommitIndex()
		if commit < minCommit {
			minCommit = commit
		}
	}

	for idx := uint64(1); idx <= minCommit; idx++ {
		var refEntry *raft.LogEntry
		for i, log := range logs {
			if int(idx) >= len(log) {
				continue
			}
			entry := &log[idx]
			if refEntry == nil {
				refEntry = entry
			} else {
				if entry.Term != refEntry.Term {
					t.Errorf("Index %d: node %d has term %d, expected %d",
						idx, i, entry.Term, refEntry.Term)
				}
			}
		}
	}
}

func TestConcurrentWrites(t *testing.T) {
	cluster, err := testutil.NewTestCluster(3)
	if err != nil {
		t.Fatalf("Failed to create cluster: %v", err)
	}
	defer cluster.Cleanup()

	if err := cluster.Start(); err != nil {
		t.Fatalf("Failed to start cluster: %v", err)
	}

	leader, err := cluster.WaitForStableLeader(15 * time.Second)
	if err != nil {
		t.Fatalf("Failed to elect stable leader: %v", err)
	}

	var wg sync.WaitGroup
	successCount := int32(0)
	var mu sync.Mutex

	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()

			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()

			cmd := raft.Command{
				Type:  raft.CommandSet,
				Key:   "concurrent-key",
				Value: string(rune('0' + idx)),
			}

			_, err := leader.SubmitWithResult(ctx, cmd)
			if err == nil {
				mu.Lock()
				successCount++
				mu.Unlock()
			}
		}(i)
	}

	wg.Wait()

	t.Logf("Successful concurrent writes: %d/5", successCount)

	time.Sleep(500 * time.Millisecond)

	var finalValue string
	for i, store := range cluster.Stores {
		value, ok := store.Get("concurrent-key")
		if ok {
			if finalValue == "" {
				finalValue = value
			} else if value != finalValue {
				t.Errorf("Store %d: inconsistent value", i)
			}
		}
	}
}