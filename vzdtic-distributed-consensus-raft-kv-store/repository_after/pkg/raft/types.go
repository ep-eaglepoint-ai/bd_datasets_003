package raft

import (
	"sync"
	"time"
)

// NodeState represents the current state of a Raft node
type NodeState int

const (
	Follower NodeState = iota
	Candidate
	Leader
)

func (s NodeState) String() string {
	switch s {
	case Follower:
		return "Follower"
	case Candidate:
		return "Candidate"
	case Leader:
		return "Leader"
	default:
		return "Unknown"
	}
}

// LogEntry represents a single entry in the Raft log
type LogEntry struct {
	Index   uint64
	Term    uint64
	Command Command
}

// Command represents a command to be applied to the state machine
type Command struct {
	Type  CommandType
	Key   string
	Value string
}

// CommandType represents the type of command
type CommandType int

const (
	CommandSet CommandType = iota
	CommandDelete
	CommandNoop
	CommandAddNode
	CommandRemoveNode
)

// PersistentState represents state that must be persisted to disk
type PersistentState struct {
	CurrentTerm uint64
	VotedFor    string
	Log         []LogEntry
}

// NodeConfig holds the configuration for a Raft node
type NodeConfig struct {
	ID                 string
	Peers              []string
	ElectionTimeoutMin time.Duration
	ElectionTimeoutMax time.Duration
	HeartbeatInterval  time.Duration
	WALPath            string
	SnapshotThreshold  uint64
}

// DefaultConfig returns a default configuration
func DefaultConfig(id string, peers []string) NodeConfig {
	return NodeConfig{
		ID:                 id,
		Peers:              peers,
		ElectionTimeoutMin: 150 * time.Millisecond,
		ElectionTimeoutMax: 300 * time.Millisecond,
		HeartbeatInterval:  50 * time.Millisecond,
		WALPath:            "/tmp/raft-wal-" + id,
		SnapshotThreshold:  1000,
	}
}

// Snapshot represents a snapshot of the state machine
type Snapshot struct {
	LastIncludedIndex uint64
	LastIncludedTerm  uint64
	Data              map[string]string
}

// RequestVoteArgs represents arguments for RequestVote RPC
type RequestVoteArgs struct {
	Term         uint64
	CandidateID  string
	LastLogIndex uint64
	LastLogTerm  uint64
}

// RequestVoteReply represents reply for RequestVote RPC
type RequestVoteReply struct {
	Term        uint64
	VoteGranted bool
}

// AppendEntriesArgs represents arguments for AppendEntries RPC
type AppendEntriesArgs struct {
	Term         uint64
	LeaderID     string
	PrevLogIndex uint64
	PrevLogTerm  uint64
	Entries      []LogEntry
	LeaderCommit uint64
}

// AppendEntriesReply represents reply for AppendEntries RPC
type AppendEntriesReply struct {
	Term          uint64
	Success       bool
	ConflictIndex uint64
	ConflictTerm  uint64
}

// InstallSnapshotArgs represents arguments for InstallSnapshot RPC
type InstallSnapshotArgs struct {
	Term              uint64
	LeaderID          string
	LastIncludedIndex uint64
	LastIncludedTerm  uint64
	Data              []byte
}

// InstallSnapshotReply represents reply for InstallSnapshot RPC
type InstallSnapshotReply struct {
	Term uint64
}

// ApplyMsg represents a message sent to the state machine
type ApplyMsg struct {
	CommandValid bool
	Command      Command
	CommandIndex uint64
	CommandTerm  uint64

	SnapshotValid bool
	Snapshot      []byte
	SnapshotTerm  uint64
	SnapshotIndex uint64
}

// Transport defines the interface for node-to-node communication
type Transport interface {
	RequestVote(target string, args *RequestVoteArgs) (*RequestVoteReply, error)
	AppendEntries(target string, args *AppendEntriesArgs) (*AppendEntriesReply, error)
	InstallSnapshot(target string, args *InstallSnapshotArgs) (*InstallSnapshotReply, error)
}

// CommitResult represents the result of committing a command
type CommitResult struct {
	Index uint64
	Term  uint64
	Value string
	Error error
}

// PendingCommand represents a command waiting to be committed
type PendingCommand struct {
	Index    uint64
	Term     uint64
	ResultCh chan CommitResult
}

// ClusterConfig represents the current cluster configuration
type ClusterConfig struct {
	mu      sync.RWMutex
	Nodes   map[string]bool
	Version uint64
}

func NewClusterConfig() *ClusterConfig {
	return &ClusterConfig{
		Nodes: make(map[string]bool),
	}
}

func (c *ClusterConfig) AddNode(nodeID string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.Nodes[nodeID] = true
	c.Version++
}

func (c *ClusterConfig) RemoveNode(nodeID string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.Nodes, nodeID)
	c.Version++
}

func (c *ClusterConfig) GetNodes() []string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	nodes := make([]string, 0, len(c.Nodes))
	for node := range c.Nodes {
		nodes = append(nodes, node)
	}
	return nodes
}

func (c *ClusterConfig) HasNode(nodeID string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.Nodes[nodeID]
}

func (c *ClusterConfig) Size() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.Nodes)
}