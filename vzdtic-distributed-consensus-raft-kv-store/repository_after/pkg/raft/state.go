package raft

import (
	"sync"
	"time"
)

// State represents the Raft node state
type State int

const (
	Follower State = iota
	Candidate
	Leader
)

func (s State) String() string {
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

// NodeState holds the volatile state of a Raft node
type NodeState struct {
	mu              sync.RWMutex
	state           State
	currentTerm     uint64
	votedFor        string
	commitIndex     uint64
	lastApplied     uint64
	leaderId        string
	lastHeartbeat   time.Time
	electionTimeout time.Duration
	
	// Leader state
	nextIndex  map[string]uint64
	matchIndex map[string]uint64
}

// NewNodeState creates a new node state
func NewNodeState() *NodeState {
	return &NodeState{
		state:       Follower,
		currentTerm: 0,
		votedFor:    "",
		commitIndex: 0,
		lastApplied: 0,
		nextIndex:   make(map[string]uint64),
		matchIndex:  make(map[string]uint64),
	}
}

// GetState returns the current state
func (ns *NodeState) GetState() State {
	ns.mu.RLock()
	defer ns.mu.RUnlock()
	return ns.state
}

// SetState sets the current state
func (ns *NodeState) SetState(state State) {
	ns.mu.Lock()
	defer ns.mu.Unlock()
	ns.state = state
}

// GetCurrentTerm returns the current term
func (ns *NodeState) GetCurrentTerm() uint64 {
	ns.mu.RLock()
	defer ns.mu.RUnlock()
	return ns.currentTerm
}

// SetCurrentTerm sets the current term
func (ns *NodeState) SetCurrentTerm(term uint64) {
	ns.mu.Lock()
	defer ns.mu.Unlock()
	ns.currentTerm = term
}

// GetVotedFor returns the voted for candidate
func (ns *NodeState) GetVotedFor() string {
	ns.mu.RLock()
	defer ns.mu.RUnlock()
	return ns.votedFor
}

// SetVotedFor sets the voted for candidate
func (ns *NodeState) SetVotedFor(votedFor string) {
	ns.mu.Lock()
	defer ns.mu.Unlock()
	ns.votedFor = votedFor
}

// GetCommitIndex returns the commit index
func (ns *NodeState) GetCommitIndex() uint64 {
	ns.mu.RLock()
	defer ns.mu.RUnlock()
	return ns.commitIndex
}

// SetCommitIndex sets the commit index
func (ns *NodeState) SetCommitIndex(index uint64) {
	ns.mu.Lock()
	defer ns.mu.Unlock()
	ns.commitIndex = index
}

// GetLastApplied returns the last applied index
func (ns *NodeState) GetLastApplied() uint64 {
	ns.mu.RLock()
	defer ns.mu.RUnlock()
	return ns.lastApplied
}

// SetLastApplied sets the last applied index
func (ns *NodeState) SetLastApplied(index uint64) {
	ns.mu.Lock()
	defer ns.mu.Unlock()
	ns.lastApplied = index
}

// GetLeaderId returns the leader ID
func (ns *NodeState) GetLeaderId() string {
	ns.mu.RLock()
	defer ns.mu.RUnlock()
	return ns.leaderId
}

// SetLeaderId sets the leader ID
func (ns *NodeState) SetLeaderId(leaderId string) {
	ns.mu.Lock()
	defer ns.mu.Unlock()
	ns.leaderId = leaderId
}

// GetNextIndex returns the next index for a peer
func (ns *NodeState) GetNextIndex(peerId string) uint64 {
	ns.mu.RLock()
	defer ns.mu.RUnlock()
	return ns.nextIndex[peerId]
}

// SetNextIndex sets the next index for a peer
func (ns *NodeState) SetNextIndex(peerId string, index uint64) {
	ns.mu.Lock()
	defer ns.mu.Unlock()
	ns.nextIndex[peerId] = index
}

// GetMatchIndex returns the match index for a peer
func (ns *NodeState) GetMatchIndex(peerId string) uint64 {
	ns.mu.RLock()
	defer ns.mu.RUnlock()
	return ns.matchIndex[peerId]
}

// SetMatchIndex sets the match index for a peer
func (ns *NodeState) SetMatchIndex(peerId string, index uint64) {
	ns.mu.Lock()
	defer ns.mu.Unlock()
	ns.matchIndex[peerId] = index
}

// ResetLeaderState resets the leader-specific state
func (ns *NodeState) ResetLeaderState(peers []string, lastLogIndex uint64) {
	ns.mu.Lock()
	defer ns.mu.Unlock()

	ns.nextIndex = make(map[string]uint64)
	ns.matchIndex = make(map[string]uint64)

	for _, peer := range peers {
		ns.nextIndex[peer] = lastLogIndex + 1
		ns.matchIndex[peer] = 0
	}
}

// GetLastHeartbeat returns the last heartbeat time
func (ns *NodeState) GetLastHeartbeat() time.Time {
	ns.mu.RLock()
	defer ns.mu.RUnlock()
	return ns.lastHeartbeat
}

// SetLastHeartbeat sets the last heartbeat time
func (ns *NodeState) SetLastHeartbeat(t time.Time) {
	ns.mu.Lock()
	defer ns.mu.Unlock()
	ns.lastHeartbeat = t
}

// GetElectionTimeout returns the election timeout
func (ns *NodeState) GetElectionTimeout() time.Duration {
	ns.mu.RLock()
	defer ns.mu.RUnlock()
	return ns.electionTimeout
}

// SetElectionTimeout sets the election timeout
func (ns *NodeState) SetElectionTimeout(d time.Duration) {
	ns.mu.Lock()
	defer ns.mu.Unlock()
	ns.electionTimeout = d
}

// IsLeader returns true if the node is the leader
func (ns *NodeState) IsLeader() bool {
	ns.mu.RLock()
	defer ns.mu.RUnlock()
	return ns.state == Leader
}