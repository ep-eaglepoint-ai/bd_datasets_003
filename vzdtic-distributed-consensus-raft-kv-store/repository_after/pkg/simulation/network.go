package simulation

import (
	"context"
	"fmt"
	"math/rand"
	"sync"
	"time"

	"github.com/vzdtic/raft-kv-store/repository_after/pkg/raft"
)

// Network simulates a network with partitions, delays, and message loss
type Network struct {
	mu              sync.RWMutex
	nodes           map[string]*SimNode
	partitions      map[string]map[string]bool // nodeA -> nodeB -> partitioned
	dropRate        float64
	minDelay        time.Duration
	maxDelay        time.Duration
	rand            *rand.Rand
	messageLog      []Message
	deliveredMsgs   []Message
}

// SimNode represents a simulated node
type SimNode struct {
	ID        string
	Raft      *raft.Raft
	Transport *SimTransport
	Inbox     chan interface{}
}

// Message represents a message in the simulation
type Message struct {
	From      string
	To        string
	Type      string
	Request   interface{}
	Response  interface{}
	Timestamp time.Time
	Delivered bool
	Dropped   bool
}

// NewNetwork creates a new simulated network
func NewNetwork(dropRate float64, minDelay, maxDelay time.Duration) *Network {
	return &Network{
		nodes:      make(map[string]*SimNode),
		partitions: make(map[string]map[string]bool),
		dropRate:   dropRate,
		minDelay:   minDelay,
		maxDelay:   maxDelay,
		rand:       rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

// AddNode adds a node to the network
func (n *Network) AddNode(id string, node *raft.Raft, transport *SimTransport) {
	n.mu.Lock()
	defer n.mu.Unlock()

	n.nodes[id] = &SimNode{
		ID:        id,
		Raft:      node,
		Transport: transport,
		Inbox:     make(chan interface{}, 100),
	}
	n.partitions[id] = make(map[string]bool)
}

// Partition partitions a node from the rest of the cluster
func (n *Network) Partition(nodeID string) {
	n.mu.Lock()
	defer n.mu.Unlock()

	for otherID := range n.nodes {
		if otherID != nodeID {
			n.partitions[nodeID][otherID] = true
			n.partitions[otherID][nodeID] = true
		}
	}
}

// Heal heals a partition
func (n *Network) Heal(nodeID string) {
	n.mu.Lock()
	defer n.mu.Unlock()

	for otherID := range n.nodes {
		if otherID != nodeID {
			delete(n.partitions[nodeID], otherID)
			delete(n.partitions[otherID], nodeID)
		}
	}
}

// PartitionBetween partitions two specific nodes
func (n *Network) PartitionBetween(nodeA, nodeB string) {
	n.mu.Lock()
	defer n.mu.Unlock()

	n.partitions[nodeA][nodeB] = true
	n.partitions[nodeB][nodeA] = true
}

// HealBetween heals partition between two nodes
func (n *Network) HealBetween(nodeA, nodeB string) {
	n.mu.Lock()
	defer n.mu.Unlock()

	delete(n.partitions[nodeA], nodeB)
	delete(n.partitions[nodeB], nodeA)
}

// IsPartitioned checks if two nodes are partitioned
func (n *Network) IsPartitioned(nodeA, nodeB string) bool {
	n.mu.RLock()
	defer n.mu.RUnlock()

	if partitions, ok := n.partitions[nodeA]; ok {
		return partitions[nodeB]
	}
	return false
}

// SetDropRate sets the message drop rate
func (n *Network) SetDropRate(rate float64) {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.dropRate = rate
}

// SetDelay sets the message delay range
func (n *Network) SetDelay(min, max time.Duration) {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.minDelay = min
	n.maxDelay = max
}

// ShouldDrop returns true if a message should be dropped
func (n *Network) ShouldDrop() bool {
	n.mu.RLock()
	defer n.mu.RUnlock()
	return n.rand.Float64() < n.dropRate
}

// GetDelay returns a random delay
func (n *Network) GetDelay() time.Duration {
	n.mu.RLock()
	defer n.mu.RUnlock()

	if n.maxDelay <= n.minDelay {
		return n.minDelay
	}
	return n.minDelay + time.Duration(n.rand.Int63n(int64(n.maxDelay-n.minDelay)))
}

// GetMessages returns all messages in the simulation
func (n *Network) GetMessages() []Message {
	n.mu.RLock()
	defer n.mu.RUnlock()

	result := make([]Message, len(n.messageLog))
	copy(result, n.messageLog)
	return result
}

// GetDeliveredMessages returns all delivered messages
func (n *Network) GetDeliveredMessages() []Message {
	n.mu.RLock()
	defer n.mu.RUnlock()

	result := make([]Message, len(n.deliveredMsgs))
	copy(result, n.deliveredMsgs)
	return result
}

// LogMessage logs a message
func (n *Network) LogMessage(msg Message) {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.messageLog = append(n.messageLog, msg)
	if msg.Delivered {
		n.deliveredMsgs = append(n.deliveredMsgs, msg)
	}
}

// GetNode returns a node by ID
func (n *Network) GetNode(id string) *SimNode {
	n.mu.RLock()
	defer n.mu.RUnlock()
	return n.nodes[id]
}

// GetNodes returns all nodes
func (n *Network) GetNodes() map[string]*SimNode {
	n.mu.RLock()
	defer n.mu.RUnlock()

	result := make(map[string]*SimNode)
	for k, v := range n.nodes {
		result[k] = v
	}
	return result
}

// SimTransport is a simulated transport
type SimTransport struct {
	network  *Network
	localID  string
	handlers map[string]*raft.Raft
}

// NewSimTransport creates a new simulated transport
func NewSimTransport(network *Network, localID string) *SimTransport {
	return &SimTransport{
		network:  network,
		localID:  localID,
		handlers: make(map[string]*raft.Raft),
	}
}

// RegisterHandler registers a Raft handler for a node
func (t *SimTransport) RegisterHandler(nodeID string, handler *raft.Raft) {
	t.handlers[nodeID] = handler
}

// RequestVote implements the Transport interface
func (t *SimTransport) RequestVote(ctx context.Context, target string, req *raft.RequestVoteRequest) (*raft.RequestVoteResponse, error) {
	msg := Message{
		From:      t.localID,
		To:        target,
		Type:      "RequestVote",
		Request:   req,
		Timestamp: time.Now(),
	}

	// Check partition
	if t.network.IsPartitioned(t.localID, target) {
		msg.Dropped = true
		t.network.LogMessage(msg)
		return nil, fmt.Errorf("node partitioned")
	}

	// Check drop
	if t.network.ShouldDrop() {
		msg.Dropped = true
		t.network.LogMessage(msg)
		return nil, fmt.Errorf("message dropped")
	}

	// Add delay
	delay := t.network.GetDelay()
	time.Sleep(delay)

	// Get target handler
	handler, ok := t.handlers[target]
	if !ok {
		return nil, fmt.Errorf("unknown target: %s", target)
	}

	// Handle request
	resp := handler.HandleRequestVote(req)

	msg.Response = resp
	msg.Delivered = true
	t.network.LogMessage(msg)

	return resp, nil
}

// AppendEntries implements the Transport interface
func (t *SimTransport) AppendEntries(ctx context.Context, target string, req *raft.AppendEntriesRequest) (*raft.AppendEntriesResponse, error) {
	msg := Message{
		From:      t.localID,
		To:        target,
		Type:      "AppendEntries",
		Request:   req,
		Timestamp: time.Now(),
	}

	// Check partition
	if t.network.IsPartitioned(t.localID, target) {
		msg.Dropped = true
		t.network.LogMessage(msg)
		return nil, fmt.Errorf("node partitioned")
	}

	// Check drop
	if t.network.ShouldDrop() {
		msg.Dropped = true
		t.network.LogMessage(msg)
		return nil, fmt.Errorf("message dropped")
	}

	// Add delay
	delay := t.network.GetDelay()
	time.Sleep(delay)

	// Get target handler
	handler, ok := t.handlers[target]
	if !ok {
		return nil, fmt.Errorf("unknown target: %s", target)
	}

	// Handle request
	resp := handler.HandleAppendEntries(req)

	msg.Response = resp
	msg.Delivered = true
	t.network.LogMessage(msg)

	return resp, nil
}

// InstallSnapshot implements the Transport interface
func (t *SimTransport) InstallSnapshot(ctx context.Context, target string, req *raft.InstallSnapshotRequest) (*raft.InstallSnapshotResponse, error) {
	msg := Message{
		From:      t.localID,
		To:        target,
		Type:      "InstallSnapshot",
		Request:   req,
		Timestamp: time.Now(),
	}

	// Check partition
	if t.network.IsPartitioned(t.localID, target) {
		msg.Dropped = true
		t.network.LogMessage(msg)
		return nil, fmt.Errorf("node partitioned")
	}

	// Check drop
	if t.network.ShouldDrop() {
		msg.Dropped = true
		t.network.LogMessage(msg)
		return nil, fmt.Errorf("message dropped")
	}

	// Add delay
	delay := t.network.GetDelay()
	time.Sleep(delay)

	// Get target handler
	handler, ok := t.handlers[target]
	if !ok {
		return nil, fmt.Errorf("unknown target: %s", target)
	}

	// Handle request
	resp := handler.HandleInstallSnapshot(req)

	msg.Response = resp
	msg.Delivered = true
	t.network.LogMessage(msg)

	return resp, nil
}