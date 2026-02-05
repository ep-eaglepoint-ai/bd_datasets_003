package testing

import (
	"context"
	"fmt"
	"math/rand"
	"os"
	"time"

	"github.com/vzdtic/distributed-consensus-raft-kv-store/repository_after/pkg/kv"
	"github.com/vzdtic/distributed-consensus-raft-kv-store/repository_after/pkg/raft"
	"github.com/vzdtic/distributed-consensus-raft-kv-store/repository_after/pkg/rpc"
	"github.com/vzdtic/distributed-consensus-raft-kv-store/repository_after/pkg/wal"
)

// TestCluster represents a test cluster
type TestCluster struct {
	Nodes     []*raft.Node
	Stores    []*kv.Store
	Transport *rpc.LocalTransport
	WALs      []*wal.WAL
	walDirs   []string
}

// NewTestCluster creates a new test cluster
func NewTestCluster(size int) (*TestCluster, error) {
	transport := rpc.NewLocalTransport()

	uniqueID := rand.Int63()

	nodeIDs := make([]string, size)
	for i := 0; i < size; i++ {
		nodeIDs[i] = fmt.Sprintf("node-%d", i)
	}

	cluster := &TestCluster{
		Nodes:     make([]*raft.Node, size),
		Stores:    make([]*kv.Store, size),
		Transport: transport,
		WALs:      make([]*wal.WAL, size),
		walDirs:   make([]string, size),
	}

	for i := 0; i < size; i++ {
		peers := make([]string, 0, size-1)
		for j := 0; j < size; j++ {
			if i != j {
				peers = append(peers, nodeIDs[j])
			}
		}

		walDir := fmt.Sprintf("/tmp/raft-test-wal-%d-%d-%d", os.Getpid(), uniqueID, i)
		cluster.walDirs[i] = walDir
		os.RemoveAll(walDir)

		walInstance, err := wal.NewWAL(walDir)
		if err != nil {
			cluster.Cleanup()
			return nil, err
		}
		cluster.WALs[i] = walInstance

		store := kv.NewStore()
		cluster.Stores[i] = store

		// Fast heartbeats, long election timeout for stability
		config := raft.NodeConfig{
			ID:                 nodeIDs[i],
			Peers:              peers,
			ElectionTimeoutMin: 500 * time.Millisecond,
			ElectionTimeoutMax: 1000 * time.Millisecond,
			HeartbeatInterval:  50 * time.Millisecond,
			WALPath:            walDir,
			SnapshotThreshold:  100,
		}

		node := raft.NewNode(config, transport, walInstance, store)
		cluster.Nodes[i] = node
		transport.Register(nodeIDs[i], node)
	}

	return cluster, nil
}

// Start starts all nodes in the cluster
func (c *TestCluster) Start() error {
	for _, node := range c.Nodes {
		if err := node.Start(); err != nil {
			return err
		}
	}
	return nil
}

// Stop stops all nodes in the cluster
func (c *TestCluster) Stop() {
	for _, node := range c.Nodes {
		if node != nil {
			node.Stop()
		}
	}
}

// Cleanup removes all temporary files
func (c *TestCluster) Cleanup() {
	c.Stop()
	time.Sleep(100 * time.Millisecond)
	for _, dir := range c.walDirs {
		os.RemoveAll(dir)
	}
}

// WaitForLeader waits for a leader to be elected
func (c *TestCluster) WaitForLeader(timeout time.Duration) (*raft.Node, error) {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		for _, node := range c.Nodes {
			if node.IsLeader() {
				return node, nil
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	return nil, fmt.Errorf("no leader elected within timeout")
}

// WaitForStableLeader waits for a leader that has committed at least one entry
func (c *TestCluster) WaitForStableLeader(timeout time.Duration) (*raft.Node, error) {
	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		for _, node := range c.Nodes {
			if node.IsLeader() && node.GetCommitIndex() > 0 {
				// Found a leader that has committed - wait a bit to ensure stability
				time.Sleep(200 * time.Millisecond)
				if node.IsLeader() {
					return node, nil
				}
			}
		}
		time.Sleep(100 * time.Millisecond)
	}
	return nil, fmt.Errorf("no stable leader elected within timeout")
}

// GetLeader returns the current leader
func (c *TestCluster) GetLeader() *raft.Node {
	for _, node := range c.Nodes {
		if node.IsLeader() {
			return node
		}
	}
	return nil
}

// GetLeaderExcluding returns the current leader excluding a specific node
func (c *TestCluster) GetLeaderExcluding(excludeID string) *raft.Node {
	for _, node := range c.Nodes {
		if node.GetID() != excludeID && node.IsLeader() {
			return node
		}
	}
	return nil
}

// PartitionLeader partitions the current leader from the cluster
func (c *TestCluster) PartitionLeader() *raft.Node {
	leader := c.GetLeader()
	if leader != nil {
		c.Transport.Partition(leader.GetID())
	}
	return leader
}

// HealPartition heals all network partitions
func (c *TestCluster) HealPartition() {
	c.Transport.HealAll()
}

// SubmitCommand submits a command with retry logic
func (c *TestCluster) SubmitCommand(cmd raft.Command, timeout time.Duration) error {
	return c.SubmitCommandExcluding(cmd, timeout, "")
}

// SubmitCommandExcluding submits a command, excluding a specific node from being used as leader
func (c *TestCluster) SubmitCommandExcluding(cmd raft.Command, timeout time.Duration, excludeID string) error {
	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		var leader *raft.Node
		if excludeID != "" {
			leader = c.GetLeaderExcluding(excludeID)
		} else {
			leader = c.GetLeader()
		}

		if leader == nil {
			time.Sleep(100 * time.Millisecond)
			continue
		}

		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		_, err := leader.SubmitWithResult(ctx, cmd)
		cancel()

		if err == nil {
			return nil
		}

		time.Sleep(100 * time.Millisecond)
	}

	return fmt.Errorf("timeout submitting command")
}

// SubmitToNode submits a command directly to a specific node
func (c *TestCluster) SubmitToNode(node *raft.Node, cmd raft.Command, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	_, err := node.SubmitWithResult(ctx, cmd)
	return err
}

// WaitForNewLeader waits for a new leader different from the specified node
func (c *TestCluster) WaitForNewLeader(excludeID string, timeout time.Duration) (*raft.Node, error) {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		for _, node := range c.Nodes {
			if node.GetID() != excludeID && node.IsLeader() {
				// Wait a bit to ensure it's stable
				time.Sleep(300 * time.Millisecond)
				if node.IsLeader() {
					return node, nil
				}
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	return nil, fmt.Errorf("no new leader elected within timeout")
}