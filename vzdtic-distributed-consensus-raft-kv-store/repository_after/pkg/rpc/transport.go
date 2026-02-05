package rpc

import (
	"sync"
	"time"

	"github.com/vzdtic/distributed-consensus-raft-kv-store/repository_after/pkg/raft"
)

// LocalTransport implements in-memory transport for testing
type LocalTransport struct {
	mu       sync.RWMutex
	nodes    map[string]*raft.Node
	disabled map[string]map[string]bool // disabled[from][to] = true if connection is disabled
	latency  time.Duration
}

// NewLocalTransport creates a new local transport for testing
func NewLocalTransport() *LocalTransport {
	return &LocalTransport{
		nodes:    make(map[string]*raft.Node),
		disabled: make(map[string]map[string]bool),
	}
}

// Register registers a node with the transport
func (t *LocalTransport) Register(id string, node *raft.Node) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.nodes[id] = node
	t.disabled[id] = make(map[string]bool)
}

// SetLatency sets artificial latency for all RPCs
func (t *LocalTransport) SetLatency(d time.Duration) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.latency = d
}

// Disconnect simulates network disconnect between two nodes
func (t *LocalTransport) Disconnect(from, to string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.disabled[from] == nil {
		t.disabled[from] = make(map[string]bool)
	}
	t.disabled[from][to] = true
}

// Connect restores network connection between two nodes
func (t *LocalTransport) Connect(from, to string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.disabled[from] != nil {
		delete(t.disabled[from], to)
	}
}

// Partition isolates a node from the rest of the cluster
func (t *LocalTransport) Partition(nodeID string) {
	t.mu.Lock()
	defer t.mu.Unlock()

	for id := range t.nodes {
		if id != nodeID {
			if t.disabled[nodeID] == nil {
				t.disabled[nodeID] = make(map[string]bool)
			}
			if t.disabled[id] == nil {
				t.disabled[id] = make(map[string]bool)
			}
			t.disabled[nodeID][id] = true
			t.disabled[id][nodeID] = true
		}
	}
}

// Heal restores all network connections for a node
func (t *LocalTransport) Heal(nodeID string) {
	t.mu.Lock()
	defer t.mu.Unlock()

	t.disabled[nodeID] = make(map[string]bool)
	for id := range t.nodes {
		if t.disabled[id] != nil {
			delete(t.disabled[id], nodeID)
		}
	}
}

// HealAll restores all network connections
func (t *LocalTransport) HealAll() {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.disabled = make(map[string]map[string]bool)
}

func (t *LocalTransport) isConnected(from, to string) bool {
	if t.disabled[from] == nil {
		return true
	}
	return !t.disabled[from][to]
}

// RequestVote sends a RequestVote RPC
func (t *LocalTransport) RequestVote(target string, args *raft.RequestVoteArgs) (*raft.RequestVoteReply, error) {
	t.mu.RLock()
	node, ok := t.nodes[target]
	connected := t.isConnected(args.CandidateID, target)
	latency := t.latency
	t.mu.RUnlock()

	if !ok || !connected {
		return nil, raft.ErrNodeNotFound
	}

	if latency > 0 {
		time.Sleep(latency)
	}

	reply := node.HandleRequestVote(args)
	return reply, nil
}

// AppendEntries sends an AppendEntries RPC
func (t *LocalTransport) AppendEntries(target string, args *raft.AppendEntriesArgs) (*raft.AppendEntriesReply, error) {
	t.mu.RLock()
	node, ok := t.nodes[target]
	connected := t.isConnected(args.LeaderID, target)
	latency := t.latency
	t.mu.RUnlock()

	if !ok || !connected {
		return nil, raft.ErrNodeNotFound
	}

	if latency > 0 {
		time.Sleep(latency)
	}

	reply := node.HandleAppendEntries(args)
	return reply, nil
}

// InstallSnapshot sends an InstallSnapshot RPC
func (t *LocalTransport) InstallSnapshot(target string, args *raft.InstallSnapshotArgs) (*raft.InstallSnapshotReply, error) {
	t.mu.RLock()
	node, ok := t.nodes[target]
	connected := t.isConnected(args.LeaderID, target)
	latency := t.latency
	t.mu.RUnlock()

	if !ok || !connected {
		return nil, raft.ErrNodeNotFound
	}

	if latency > 0 {
		time.Sleep(latency)
	}

	reply := node.HandleInstallSnapshot(args)
	return reply, nil
}