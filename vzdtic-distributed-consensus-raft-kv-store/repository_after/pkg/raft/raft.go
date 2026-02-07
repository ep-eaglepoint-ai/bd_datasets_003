package raft

import (
	"bytes"
	"context"
	"encoding/gob"
	"fmt"
	"log"
	"math/rand"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"github.com/vzdtic/raft-kv-store/repository_after/pkg/kv"
	"github.com/vzdtic/raft-kv-store/repository_after/pkg/wal"
)

// Config holds the Raft configuration
type Config struct {
	NodeID            string
	Peers             map[string]string // nodeId -> address
	ElectionTimeout   time.Duration
	HeartbeatInterval time.Duration
	WALDir            string
	SnapshotThreshold int
}

// DefaultConfig returns a default configuration
func DefaultConfig(nodeID string) *Config {
	return &Config{
		NodeID:            nodeID,
		Peers:             make(map[string]string),
		ElectionTimeout:   150 * time.Millisecond,
		HeartbeatInterval: 50 * time.Millisecond,
		WALDir:            fmt.Sprintf("./data/%s", nodeID),
		SnapshotThreshold: 1000,
	}
}

// ApplyResult represents the result of applying a command
type ApplyResult struct {
	Index    uint64
	Response interface{}
	Error    error
}

// Transport defines the RPC transport interface
type Transport interface {
	RequestVote(ctx context.Context, target string, req *RequestVoteRequest) (*RequestVoteResponse, error)
	AppendEntries(ctx context.Context, target string, req *AppendEntriesRequest) (*AppendEntriesResponse, error)
	InstallSnapshot(ctx context.Context, target string, req *InstallSnapshotRequest) (*InstallSnapshotResponse, error)
}

// RequestVoteRequest represents a RequestVote RPC request
type RequestVoteRequest struct {
	Term         uint64
	CandidateID  string
	LastLogIndex uint64
	LastLogTerm  uint64
}

// RequestVoteResponse represents a RequestVote RPC response
type RequestVoteResponse struct {
	Term        uint64
	VoteGranted bool
}

// AppendEntriesRequest represents an AppendEntries RPC request
type AppendEntriesRequest struct {
	Term         uint64
	LeaderID     string
	PrevLogIndex uint64
	PrevLogTerm  uint64
	Entries      []LogEntry
	LeaderCommit uint64
}

// AppendEntriesResponse represents an AppendEntries RPC response
type AppendEntriesResponse struct {
	Term          uint64
	Success       bool
	MatchIndex    uint64
	ConflictIndex uint64
	ConflictTerm  uint64
}

// LogEntry represents a log entry
type LogEntry struct {
	Term    uint64
	Index   uint64
	Command []byte
	Type    EntryType
}

// EntryType defines the type of log entry
type EntryType int

const (
	EntryNormal EntryType = iota
	EntryConfigChange
	EntryNoop
)

// InstallSnapshotRequest represents an InstallSnapshot RPC request
type InstallSnapshotRequest struct {
	Term              uint64
	LeaderID          string
	LastIncludedIndex uint64
	LastIncludedTerm  uint64
	Data              []byte
	Configuration     []ClusterMember
}

// InstallSnapshotResponse represents an InstallSnapshot RPC response
type InstallSnapshotResponse struct {
	Term uint64
}

// ClusterConfig holds the cluster configuration
type ClusterConfig struct {
	Members  map[string]ClusterMember
	IsJoint  bool
	OldNodes map[string]ClusterMember
}

// ClusterMember represents a cluster member
type ClusterMember struct {
	NodeID  string
	Address string
	Voting  bool
}

// ConfigChangeType defines the type of configuration change
type ConfigChangeType int

const (
	ConfigChangeAdd ConfigChangeType = iota
	ConfigChangeRemove
)

// ConfigChange represents a cluster configuration change
type ConfigChange struct {
	Type    ConfigChangeType
	NodeID  string
	Address string
}

// Raft implements the Raft consensus algorithm
type Raft struct {
	mu     sync.RWMutex
	config *Config
	state  *NodeState
	wal    *wal.WAL
	kv     *kv.Store

	// Channels
	applyCh   chan ApplyResult
	shutdownC chan struct{}

	// RPC interface
	transport Transport

	// Pending requests waiting for commit
	pendingMu sync.Mutex
	pending   map[uint64]chan ApplyResult

	// Cluster configuration
	clusterMu     sync.RWMutex
	clusterConfig ClusterConfig

	// Heartbeat acknowledgment tracking for linearizable reads
	heartbeatAckCount int64 // atomic

	// Random source for election timeout
	rand *rand.Rand

	// Logger
	logger *log.Logger
}

// New creates a new Raft instance
func New(config *Config, transport Transport, logger *log.Logger) (*Raft, error) {
	walInstance, err := wal.New(config.WALDir)
	if err != nil {
		return nil, fmt.Errorf("failed to create WAL: %w", err)
	}

	r := &Raft{
		config:    config,
		state:     NewNodeState(),
		wal:       walInstance,
		kv:        kv.New(),
		applyCh:   make(chan ApplyResult, 100),
		shutdownC: make(chan struct{}),
		transport: transport,
		pending:   make(map[uint64]chan ApplyResult),
		rand:      rand.New(rand.NewSource(time.Now().UnixNano())),
		logger:    logger,
		clusterConfig: ClusterConfig{
			Members: make(map[string]ClusterMember),
		},
	}

	// Initialize cluster config from peers
	for nodeID, addr := range config.Peers {
		r.clusterConfig.Members[nodeID] = ClusterMember{
			NodeID:  nodeID,
			Address: addr,
			Voting:  true,
		}
	}

	// Add self to cluster
	r.clusterConfig.Members[config.NodeID] = ClusterMember{
		NodeID:  config.NodeID,
		Address: "",
		Voting:  true,
	}

	// Recover state from WAL
	if err := r.recoverState(); err != nil {
		return nil, fmt.Errorf("failed to recover state: %w", err)
	}

	return r, nil
}

// recoverState recovers the Raft state from the WAL
func (r *Raft) recoverState() error {
	r.state.SetCurrentTerm(r.wal.GetCurrentTerm())
	r.state.SetVotedFor(r.wal.GetVotedFor())

	// Recover snapshot if exists
	snapshot, err := r.wal.LoadSnapshot()
	if err == nil && snapshot != nil {
		if err := r.kv.Restore(snapshot.Data); err != nil {
			return fmt.Errorf("failed to restore snapshot: %w", err)
		}
		r.state.SetLastApplied(snapshot.Metadata.LastIncludedIndex)
		r.state.SetCommitIndex(snapshot.Metadata.LastIncludedIndex)
	}

	// Apply committed entries
	entries := r.wal.GetAllEntries()
	for _, entry := range entries {
		if entry.Index > r.state.GetLastApplied() && entry.Index <= r.state.GetCommitIndex() {
			if entry.Type == wal.EntryNormal && len(entry.Command) > 0 {
				if _, err := r.kv.Apply(entry.Command); err != nil {
					r.logger.Printf("Failed to apply entry %d: %v", entry.Index, err)
				}
			}
			r.state.SetLastApplied(entry.Index)
		}
	}

	return nil
}

// Start starts the Raft node
func (r *Raft) Start() {
	go r.run()
}

// Stop stops the Raft node
func (r *Raft) Stop() {
	close(r.shutdownC)
	r.wal.Close()
}

// run is the main event loop
func (r *Raft) run() {
	for {
		select {
		case <-r.shutdownC:
			return
		default:
		}

		switch r.state.GetState() {
		case Follower:
			r.runFollower()
		case Candidate:
			r.runCandidate()
		case Leader:
			r.runLeader()
		}
	}
}

// runFollower runs the follower state
func (r *Raft) runFollower() {
	r.logger.Printf("[%s] Running as Follower (term: %d)", r.config.NodeID, r.state.GetCurrentTerm())

	timeout := r.randomElectionTimeout()
	r.state.SetElectionTimeout(timeout)
	r.state.SetLastHeartbeat(time.Now())

	for r.state.GetState() == Follower {
		select {
		case <-r.shutdownC:
			return
		case <-time.After(10 * time.Millisecond):
			if time.Since(r.state.GetLastHeartbeat()) > r.state.GetElectionTimeout() {
				r.logger.Printf("[%s] Election timeout, becoming candidate", r.config.NodeID)
				r.state.SetState(Candidate)
				return
			}
		}
	}
}

// runCandidate runs the candidate state
func (r *Raft) runCandidate() {
	r.logger.Printf("[%s] Running as Candidate", r.config.NodeID)

	newTerm := r.state.GetCurrentTerm() + 1
	r.state.SetCurrentTerm(newTerm)
	r.state.SetVotedFor(r.config.NodeID)
	r.persistState()

	electionDone := make(chan bool, 1)
	go r.startElection(electionDone)

	timeout := r.randomElectionTimeout()
	timer := time.NewTimer(timeout)

	select {
	case <-r.shutdownC:
		timer.Stop()
		return
	case won := <-electionDone:
		timer.Stop()
		if won {
			r.becomeLeader()
		} else {
			if r.state.GetState() == Candidate {
				r.state.SetState(Follower)
			}
		}
	case <-timer.C:
		r.logger.Printf("[%s] Election timeout, retrying", r.config.NodeID)
		// Stay candidate for retry
	}
}

// startElection starts a new election
func (r *Raft) startElection(done chan<- bool) {
	r.clusterMu.RLock()
	peers := make([]string, 0)
	for nodeID := range r.clusterConfig.Members {
		if nodeID != r.config.NodeID {
			peers = append(peers, nodeID)
		}
	}
	quorum := len(r.clusterConfig.Members)/2 + 1
	r.clusterMu.RUnlock()

	lastLogIndex := r.wal.GetLastIndex()
	lastLogTerm := r.wal.GetLastTerm()
	currentTerm := r.state.GetCurrentTerm()

	req := &RequestVoteRequest{
		Term:         currentTerm,
		CandidateID:  r.config.NodeID,
		LastLogIndex: lastLogIndex,
		LastLogTerm:  lastLogTerm,
	}

	voteCh := make(chan bool, len(peers))
	votes := 1 // Vote for self

	for _, peer := range peers {
		go func(peerId string) {
			addr := r.getPeerAddress(peerId)

			ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
			defer cancel()

			resp, err := r.transport.RequestVote(ctx, addr, req)
			if err != nil {
				voteCh <- false
				return
			}

			if resp.Term > r.state.GetCurrentTerm() {
				r.stepDown(resp.Term)
				voteCh <- false
				return
			}

			voteCh <- resp.VoteGranted
		}(peer)
	}

	for i := 0; i < len(peers); i++ {
		if r.state.GetState() != Candidate {
			done <- false
			return
		}

		granted := <-voteCh
		if granted {
			votes++
		}

		if votes >= quorum {
			done <- true
			return
		}
	}

	done <- false
}

// becomeLeader transitions to leader state
func (r *Raft) becomeLeader() {
	r.logger.Printf("[%s] Became Leader (term: %d)", r.config.NodeID, r.state.GetCurrentTerm())
	r.state.SetState(Leader)
	r.state.SetLeaderId(r.config.NodeID)

	lastLogIndex := r.wal.GetLastIndex()

	r.clusterMu.RLock()
	peers := make([]string, 0)
	for nodeID := range r.clusterConfig.Members {
		if nodeID != r.config.NodeID {
			peers = append(peers, nodeID)
		}
	}
	r.clusterMu.RUnlock()

	r.state.ResetLeaderState(peers, lastLogIndex)

	// Append a no-op entry to commit entries from previous terms
	// This also serves as the first leadership confirmation
	r.appendNoopEntry()
}

// appendNoopEntry appends a no-op entry
func (r *Raft) appendNoopEntry() {
	entry := wal.Entry{
		Term:    r.state.GetCurrentTerm(),
		Index:   r.wal.GetLastIndex() + 1,
		Command: nil,
		Type:    wal.EntryNoop,
	}

	if err := r.wal.AppendEntries([]wal.Entry{entry}); err != nil {
		r.logger.Printf("[%s] Failed to append no-op entry: %v", r.config.NodeID, err)
	}
}

// runLeader runs the leader state
func (r *Raft) runLeader() {
	heartbeatTicker := time.NewTicker(r.config.HeartbeatInterval)
	defer heartbeatTicker.Stop()

	// Send initial heartbeats
	r.sendHeartbeats()

	for r.state.GetState() == Leader {
		select {
		case <-r.shutdownC:
			return
		case <-heartbeatTicker.C:
			r.sendHeartbeats()
		}
	}
}

// sendHeartbeats sends heartbeats/entries to all peers and tracks acks
func (r *Raft) sendHeartbeats() {
	r.clusterMu.RLock()
	peers := make([]string, 0)
	for nodeID := range r.clusterConfig.Members {
		if nodeID != r.config.NodeID {
			peers = append(peers, nodeID)
		}
	}
	r.clusterMu.RUnlock()

	// Reset ack count (self counts as 1)
	atomic.StoreInt64(&r.heartbeatAckCount, 1)

	for _, peer := range peers {
		go r.replicateToFollower(peer)
	}
}

// replicateToFollower replicates log entries to a follower
func (r *Raft) replicateToFollower(peerId string) {
	if r.state.GetState() != Leader {
		return
	}

	nextIndex := r.state.GetNextIndex(peerId)
	if nextIndex == 0 {
		nextIndex = 1
	}

	prevLogIndex := nextIndex - 1
	var prevLogTerm uint64 = 0
	if prevLogIndex > 0 {
		entry := r.wal.GetEntry(prevLogIndex)
		if entry != nil {
			prevLogTerm = entry.Term
		} else {
			// May need to send snapshot
			snapshot, err := r.wal.LoadSnapshot()
			if err == nil && snapshot != nil && snapshot.Metadata.LastIncludedIndex >= prevLogIndex {
				r.sendSnapshot(peerId, snapshot)
				return
			}
		}
	}

	entries := r.getEntriesForReplication(nextIndex)

	req := &AppendEntriesRequest{
		Term:         r.state.GetCurrentTerm(),
		LeaderID:     r.config.NodeID,
		PrevLogIndex: prevLogIndex,
		PrevLogTerm:  prevLogTerm,
		Entries:      entries,
		LeaderCommit: r.state.GetCommitIndex(),
	}

	addr := r.getPeerAddress(peerId)

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	resp, err := r.transport.AppendEntries(ctx, addr, req)
	if err != nil {
		return
	}

	if resp.Term > r.state.GetCurrentTerm() {
		r.stepDown(resp.Term)
		return
	}

	if resp.Success {
		// Count heartbeat ack for leadership confirmation
		atomic.AddInt64(&r.heartbeatAckCount, 1)

		if len(entries) > 0 {
			newMatchIndex := entries[len(entries)-1].Index
			r.state.SetMatchIndex(peerId, newMatchIndex)
			r.state.SetNextIndex(peerId, newMatchIndex+1)
			r.updateCommitIndex()
		}
	} else {
		// Log inconsistency - use accelerated backtracking
		if resp.ConflictIndex > 0 {
			r.state.SetNextIndex(peerId, resp.ConflictIndex)
		} else if nextIndex > 1 {
			r.state.SetNextIndex(peerId, nextIndex-1)
		}
	}
}

// getEntriesForReplication gets entries to replicate
func (r *Raft) getEntriesForReplication(startIndex uint64) []LogEntry {
	lastIndex := r.wal.GetLastIndex()
	if startIndex > lastIndex {
		return nil
	}

	walEntries := r.wal.GetEntries(startIndex, lastIndex)
	entries := make([]LogEntry, len(walEntries))
	for i, e := range walEntries {
		entries[i] = LogEntry{
			Term:    e.Term,
			Index:   e.Index,
			Command: e.Command,
			Type:    EntryType(e.Type),
		}
	}
	return entries
}

// sendSnapshot sends a snapshot to a follower
func (r *Raft) sendSnapshot(peerId string, snapshot *wal.Snapshot) {
	members := make([]ClusterMember, 0)
	for _, m := range snapshot.Metadata.Configuration {
		members = append(members, ClusterMember{
			NodeID:  m.NodeID,
			Address: m.Address,
			Voting:  m.Voting,
		})
	}

	req := &InstallSnapshotRequest{
		Term:              r.state.GetCurrentTerm(),
		LeaderID:          r.config.NodeID,
		LastIncludedIndex: snapshot.Metadata.LastIncludedIndex,
		LastIncludedTerm:  snapshot.Metadata.LastIncludedTerm,
		Data:              snapshot.Data,
		Configuration:     members,
	}

	addr := r.getPeerAddress(peerId)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := r.transport.InstallSnapshot(ctx, addr, req)
	if err != nil {
		return
	}

	if resp.Term > r.state.GetCurrentTerm() {
		r.stepDown(resp.Term)
		return
	}

	r.state.SetNextIndex(peerId, snapshot.Metadata.LastIncludedIndex+1)
	r.state.SetMatchIndex(peerId, snapshot.Metadata.LastIncludedIndex)
}

// updateCommitIndex updates the commit index based on match indices
func (r *Raft) updateCommitIndex() {
	r.clusterMu.RLock()
	nodeCount := len(r.clusterConfig.Members)
	r.clusterMu.RUnlock()

	matchIndices := make([]uint64, 0, nodeCount)

	// Add self match index (leader always has its own entries)
	matchIndices = append(matchIndices, r.wal.GetLastIndex())

	// Add peer match indices
	r.clusterMu.RLock()
	for nodeID := range r.clusterConfig.Members {
		if nodeID != r.config.NodeID {
			matchIndices = append(matchIndices, r.state.GetMatchIndex(nodeID))
		}
	}
	r.clusterMu.RUnlock()

	sort.Slice(matchIndices, func(i, j int) bool {
		return matchIndices[i] > matchIndices[j]
	})

	// The index at position quorum-1 (0-indexed) is replicated on a majority
	majorityIdx := len(matchIndices) / 2
	newCommitIndex := matchIndices[majorityIdx]

	// Safety: only commit entries from current term (Raft §5.4.2)
	if newCommitIndex > r.state.GetCommitIndex() {
		entry := r.wal.GetEntry(newCommitIndex)
		if entry != nil && entry.Term == r.state.GetCurrentTerm() {
			r.state.SetCommitIndex(newCommitIndex)
			r.applyCommittedEntries()
		}
	}
}

// applyCommittedEntries applies committed entries to the state machine
func (r *Raft) applyCommittedEntries() {
	commitIndex := r.state.GetCommitIndex()
	lastApplied := r.state.GetLastApplied()

	for lastApplied < commitIndex {
		lastApplied++
		entry := r.wal.GetEntry(lastApplied)
		if entry == nil {
			continue
		}

		var result ApplyResult
		result.Index = entry.Index

		switch wal.EntryType(entry.Type) {
		case wal.EntryNormal:
			if len(entry.Command) > 0 {
				resp, err := r.kv.Apply(entry.Command)
				result.Response = resp
				result.Error = err
			}
		case wal.EntryConfigChange:
			r.applyConfigChange(entry.Command)
		case wal.EntryNoop:
			// No-op entries need no application but DO resolve pending channels
		}

		r.state.SetLastApplied(lastApplied)

		// Notify pending requests (including read-barrier no-ops)
		r.pendingMu.Lock()
		if ch, ok := r.pending[entry.Index]; ok {
			ch <- result
			close(ch)
			delete(r.pending, entry.Index)
		}
		r.pendingMu.Unlock()

		// Check if we need to take a snapshot
		if r.wal.Size() > r.config.SnapshotThreshold {
			go r.takeSnapshot()
		}
	}
}

// applyConfigChange applies a configuration change entry
func (r *Raft) applyConfigChange(command []byte) {
	if len(command) == 0 {
		return
	}

	var change ConfigChange
	dec := gob.NewDecoder(bytes.NewReader(command))
	if err := dec.Decode(&change); err != nil {
		r.logger.Printf("[%s] Failed to decode config change: %v", r.config.NodeID, err)
		return
	}

	r.clusterMu.Lock()
	defer r.clusterMu.Unlock()

	switch change.Type {
	case ConfigChangeAdd:
		r.clusterConfig.Members[change.NodeID] = ClusterMember{
			NodeID:  change.NodeID,
			Address: change.Address,
			Voting:  true,
		}
	case ConfigChangeRemove:
		delete(r.clusterConfig.Members, change.NodeID)
	}
}

// takeSnapshot creates a snapshot for log compaction
func (r *Raft) takeSnapshot() {
	r.logger.Printf("[%s] Taking snapshot", r.config.NodeID)

	data, err := r.kv.Snapshot()
	if err != nil {
		r.logger.Printf("[%s] Failed to take snapshot: %v", r.config.NodeID, err)
		return
	}

	lastApplied := r.state.GetLastApplied()
	lastEntry := r.wal.GetEntry(lastApplied)
	if lastEntry == nil {
		return
	}

	r.clusterMu.RLock()
	members := make([]wal.ClusterMember, 0)
	for _, m := range r.clusterConfig.Members {
		members = append(members, wal.ClusterMember{
			NodeID:  m.NodeID,
			Address: m.Address,
			Voting:  m.Voting,
		})
	}
	r.clusterMu.RUnlock()

	snapshot := wal.Snapshot{
		Metadata: wal.SnapshotMetadata{
			LastIncludedIndex: lastApplied,
			LastIncludedTerm:  lastEntry.Term,
			Configuration:     members,
		},
		Data: data,
	}

	if err := r.wal.SaveSnapshot(snapshot); err != nil {
		r.logger.Printf("[%s] Failed to save snapshot: %v", r.config.NodeID, err)
	}
}

// stepDown steps down to follower
func (r *Raft) stepDown(term uint64) {
	r.state.SetCurrentTerm(term)
	r.state.SetState(Follower)
	r.state.SetVotedFor("")
	r.persistState()
}

// persistState persists the current state
func (r *Raft) persistState() {
	entries := r.wal.GetAllEntries()
	if err := r.wal.Save(r.state.GetCurrentTerm(), r.state.GetVotedFor(), entries); err != nil {
		r.logger.Printf("[%s] Failed to persist state: %v", r.config.NodeID, err)
	}
}

// randomElectionTimeout returns a random election timeout
func (r *Raft) randomElectionTimeout() time.Duration {
	return r.config.ElectionTimeout + time.Duration(r.rand.Int63n(int64(r.config.ElectionTimeout)))
}

// getPeerAddress returns the address for a peer
func (r *Raft) getPeerAddress(peerId string) string {
	if addr, ok := r.config.Peers[peerId]; ok {
		return addr
	}
	r.clusterMu.RLock()
	defer r.clusterMu.RUnlock()
	if member, ok := r.clusterConfig.Members[peerId]; ok {
		return member.Address
	}
	return peerId
}

// HandleRequestVote handles a RequestVote RPC
func (r *Raft) HandleRequestVote(req *RequestVoteRequest) *RequestVoteResponse {
	r.mu.Lock()
	defer r.mu.Unlock()

	resp := &RequestVoteResponse{
		Term:        r.state.GetCurrentTerm(),
		VoteGranted: false,
	}

	if req.Term < r.state.GetCurrentTerm() {
		return resp
	}

	if req.Term > r.state.GetCurrentTerm() {
		r.stepDown(req.Term)
		resp.Term = req.Term
	}

	votedFor := r.state.GetVotedFor()
	lastLogIndex := r.wal.GetLastIndex()
	lastLogTerm := r.wal.GetLastTerm()

	// §5.2, §5.4: Grant vote if haven't voted or already voted for this candidate,
	// AND candidate's log is at least as up-to-date as ours
	canVote := (votedFor == "" || votedFor == req.CandidateID)

	logUpToDate := req.LastLogTerm > lastLogTerm ||
		(req.LastLogTerm == lastLogTerm && req.LastLogIndex >= lastLogIndex)

	if canVote && logUpToDate {
		r.state.SetVotedFor(req.CandidateID)
		r.state.SetLastHeartbeat(time.Now())
		resp.VoteGranted = true
		r.persistState()
	}

	return resp
}

// HandleAppendEntries handles an AppendEntries RPC (Raft §5.3)
func (r *Raft) HandleAppendEntries(req *AppendEntriesRequest) *AppendEntriesResponse {
	r.mu.Lock()
	defer r.mu.Unlock()

	resp := &AppendEntriesResponse{
		Term:    r.state.GetCurrentTerm(),
		Success: false,
	}

	// 1. Reply false if term < currentTerm
	if req.Term < r.state.GetCurrentTerm() {
		return resp
	}

	// Valid AppendEntries from current or newer leader
	r.state.SetLastHeartbeat(time.Now())
	r.state.SetLeaderId(req.LeaderID)

	if req.Term > r.state.GetCurrentTerm() {
		r.stepDown(req.Term)
		resp.Term = req.Term
	}

	if r.state.GetState() != Follower {
		r.state.SetState(Follower)
	}

	// 2. Reply false if log doesn't contain an entry at prevLogIndex with prevLogTerm
	if req.PrevLogIndex > 0 {
		prevEntry := r.wal.GetEntry(req.PrevLogIndex)
		if prevEntry == nil {
			// We don't have an entry at prevLogIndex
			resp.ConflictIndex = r.wal.GetLastIndex() + 1
			resp.ConflictTerm = 0
			return resp
		}
		if prevEntry.Term != req.PrevLogTerm {
			// Entry at prevLogIndex has wrong term
			resp.ConflictTerm = prevEntry.Term
			// Find the first index with the conflicting term for fast backtrack
			resp.ConflictIndex = req.PrevLogIndex
			for idx := req.PrevLogIndex - 1; idx > 0; idx-- {
				e := r.wal.GetEntry(idx)
				if e == nil || e.Term != resp.ConflictTerm {
					resp.ConflictIndex = idx + 1
					break
				}
				if idx == 1 {
					resp.ConflictIndex = 1
				}
			}
			// Truncate from the conflict point
			r.wal.TruncateAfter(req.PrevLogIndex - 1)
			return resp
		}
	}

	// 3. If an existing entry conflicts with a new one (same index, different terms),
	//    delete the existing entry and all that follow it.
	// 4. Append any new entries not already in the log.
	if len(req.Entries) > 0 {
		newWALEntries := make([]wal.Entry, 0, len(req.Entries))

		for _, reqEntry := range req.Entries {
			existing := r.wal.GetEntry(reqEntry.Index)
			if existing != nil {
				if existing.Term == reqEntry.Term {
					// Already have this entry with same term - skip
					continue
				}
				// Conflict: different term at same index
				// Truncate this and everything after
				r.wal.TruncateAfter(reqEntry.Index - 1)
			}
			// From this point on, all entries are new
			newWALEntries = append(newWALEntries, wal.Entry{
				Term:    reqEntry.Term,
				Index:   reqEntry.Index,
				Command: reqEntry.Command,
				Type:    wal.EntryType(reqEntry.Type),
			})
		}

		if len(newWALEntries) > 0 {
			if err := r.wal.AppendEntries(newWALEntries); err != nil {
				r.logger.Printf("[%s] Failed to append entries: %v", r.config.NodeID, err)
				return resp
			}
		}
	}

	resp.Success = true
	resp.MatchIndex = r.wal.GetLastIndex()

	// 5. If leaderCommit > commitIndex, set commitIndex = min(leaderCommit, index of last new entry)
	if req.LeaderCommit > r.state.GetCommitIndex() {
		lastIndex := r.wal.GetLastIndex()
		newCommitIndex := req.LeaderCommit
		if lastIndex < newCommitIndex {
			newCommitIndex = lastIndex
		}
		r.state.SetCommitIndex(newCommitIndex)
		r.applyCommittedEntries()
	}

	return resp
}

// HandleInstallSnapshot handles an InstallSnapshot RPC
func (r *Raft) HandleInstallSnapshot(req *InstallSnapshotRequest) *InstallSnapshotResponse {
	r.mu.Lock()
	defer r.mu.Unlock()

	resp := &InstallSnapshotResponse{
		Term: r.state.GetCurrentTerm(),
	}

	if req.Term < r.state.GetCurrentTerm() {
		return resp
	}

	if req.Term > r.state.GetCurrentTerm() {
		r.stepDown(req.Term)
		resp.Term = req.Term
	}

	r.state.SetLastHeartbeat(time.Now())
	r.state.SetLeaderId(req.LeaderID)

	// Restore snapshot to state machine
	if err := r.kv.Restore(req.Data); err != nil {
		r.logger.Printf("[%s] Failed to restore snapshot: %v", r.config.NodeID, err)
		return resp
	}

	// Update cluster configuration from snapshot
	r.clusterMu.Lock()
	r.clusterConfig.Members = make(map[string]ClusterMember)
	for _, m := range req.Configuration {
		r.clusterConfig.Members[m.NodeID] = m
	}
	r.clusterMu.Unlock()

	// Save snapshot to WAL
	members := make([]wal.ClusterMember, len(req.Configuration))
	for i, m := range req.Configuration {
		members[i] = wal.ClusterMember{
			NodeID:  m.NodeID,
			Address: m.Address,
			Voting:  m.Voting,
		}
	}

	snapshot := wal.Snapshot{
		Metadata: wal.SnapshotMetadata{
			LastIncludedIndex: req.LastIncludedIndex,
			LastIncludedTerm:  req.LastIncludedTerm,
			Configuration:     members,
		},
		Data: req.Data,
	}

	if err := r.wal.SaveSnapshot(snapshot); err != nil {
		r.logger.Printf("[%s] Failed to save snapshot: %v", r.config.NodeID, err)
	}

	r.state.SetCommitIndex(req.LastIncludedIndex)
	r.state.SetLastApplied(req.LastIncludedIndex)

	return resp
}

// Propose proposes a command to be replicated
func (r *Raft) Propose(command []byte) (uint64, <-chan ApplyResult) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.state.GetState() != Leader {
		ch := make(chan ApplyResult, 1)
		ch <- ApplyResult{Error: fmt.Errorf("not leader")}
		close(ch)
		return 0, ch
	}

	index := r.wal.GetLastIndex() + 1
	entry := wal.Entry{
		Term:    r.state.GetCurrentTerm(),
		Index:   index,
		Command: command,
		Type:    wal.EntryNormal,
	}

	if err := r.wal.AppendEntries([]wal.Entry{entry}); err != nil {
		ch := make(chan ApplyResult, 1)
		ch <- ApplyResult{Error: fmt.Errorf("failed to append entry: %w", err)}
		close(ch)
		return 0, ch
	}

	ch := make(chan ApplyResult, 1)
	r.pendingMu.Lock()
	r.pending[index] = ch
	r.pendingMu.Unlock()

	// Start replication immediately
	go r.sendHeartbeats()

	return index, ch
}

// ReadIndex implements linearizable reads by writing a no-op barrier through
// the log. This confirms leadership: if the no-op commits, this node is the
// real leader and the state machine is up-to-date.
func (r *Raft) ReadIndex() error {
	r.mu.Lock()
	if r.state.GetState() != Leader {
		r.mu.Unlock()
		return fmt.Errorf("not leader")
	}

	// Propose a no-op read barrier entry
	index := r.wal.GetLastIndex() + 1
	entry := wal.Entry{
		Term:    r.state.GetCurrentTerm(),
		Index:   index,
		Command: nil,
		Type:    wal.EntryNoop,
	}

	if err := r.wal.AppendEntries([]wal.Entry{entry}); err != nil {
		r.mu.Unlock()
		return fmt.Errorf("failed to append read barrier: %w", err)
	}

	ch := make(chan ApplyResult, 1)
	r.pendingMu.Lock()
	r.pending[index] = ch
	r.pendingMu.Unlock()

	r.mu.Unlock()

	// Trigger replication so the no-op gets committed
	go r.sendHeartbeats()

	// Wait for the no-op to be committed (proves we are still leader)
	select {
	case result := <-ch:
		return result.Error
	case <-time.After(r.config.ElectionTimeout * 3):
		// Clean up pending
		r.pendingMu.Lock()
		delete(r.pending, index)
		r.pendingMu.Unlock()
		return fmt.Errorf("read index timeout - may have lost leadership")
	case <-r.shutdownC:
		return fmt.Errorf("shutting down")
	}
}

// Get retrieves a value (optionally linearizable)
func (r *Raft) Get(key string, linearizable bool) ([]byte, bool, error) {
	if linearizable {
		if err := r.ReadIndex(); err != nil {
			return nil, false, err
		}
	}
	value, found := r.kv.Get(key)
	return value, found, nil
}

// Set sets a key-value pair (linearizable write)
func (r *Raft) Set(key string, value []byte, clientID string, requestID uint64) error {
	cmd, err := kv.EncodeCommand(kv.CommandSet, key, value, clientID, requestID)
	if err != nil {
		return fmt.Errorf("failed to encode command: %w", err)
	}

	_, ch := r.Propose(cmd)
	result := <-ch
	return result.Error
}

// Delete deletes a key
func (r *Raft) Delete(key string, clientID string, requestID uint64) error {
	cmd, err := kv.EncodeCommand(kv.CommandDelete, key, nil, clientID, requestID)
	if err != nil {
		return fmt.Errorf("failed to encode command: %w", err)
	}

	_, ch := r.Propose(cmd)
	result := <-ch
	return result.Error
}

// AddNode adds a new node to the cluster (leader only)
func (r *Raft) AddNode(nodeID, address string) error {
	if r.state.GetState() != Leader {
		return fmt.Errorf("not leader")
	}

	r.clusterMu.Lock()
	r.clusterConfig.Members[nodeID] = ClusterMember{
		NodeID:  nodeID,
		Address: address,
		Voting:  true,
	}
	r.clusterMu.Unlock()

	configChange := ConfigChange{
		Type:    ConfigChangeAdd,
		NodeID:  nodeID,
		Address: address,
	}

	var buf bytes.Buffer
	enc := gob.NewEncoder(&buf)
	if err := enc.Encode(configChange); err != nil {
		return fmt.Errorf("failed to encode config change: %w", err)
	}

	entry := wal.Entry{
		Term:    r.state.GetCurrentTerm(),
		Index:   r.wal.GetLastIndex() + 1,
		Command: buf.Bytes(),
		Type:    wal.EntryConfigChange,
	}

	return r.wal.AppendEntries([]wal.Entry{entry})
}

// RemoveNode removes a node from the cluster (leader only)
func (r *Raft) RemoveNode(nodeID string) error {
	if r.state.GetState() != Leader {
		return fmt.Errorf("not leader")
	}

	r.clusterMu.Lock()
	delete(r.clusterConfig.Members, nodeID)
	r.clusterMu.Unlock()

	configChange := ConfigChange{
		Type:   ConfigChangeRemove,
		NodeID: nodeID,
	}

	var buf bytes.Buffer
	enc := gob.NewEncoder(&buf)
	if err := enc.Encode(configChange); err != nil {
		return fmt.Errorf("failed to encode config change: %w", err)
	}

	entry := wal.Entry{
		Term:    r.state.GetCurrentTerm(),
		Index:   r.wal.GetLastIndex() + 1,
		Command: buf.Bytes(),
		Type:    wal.EntryConfigChange,
	}

	return r.wal.AppendEntries([]wal.Entry{entry})
}

// GetClusterInfo returns information about the cluster
func (r *Raft) GetClusterInfo() (leaderID string, term uint64, members []ClusterMember) {
	r.clusterMu.RLock()
	defer r.clusterMu.RUnlock()

	leaderID = r.state.GetLeaderId()
	term = r.state.GetCurrentTerm()

	members = make([]ClusterMember, 0)
	for _, m := range r.clusterConfig.Members {
		members = append(members, m)
	}

	return
}

// GetState returns the current state
func (r *Raft) GetState() State {
	return r.state.GetState()
}

// GetNodeID returns the node ID
func (r *Raft) GetNodeID() string {
	return r.config.NodeID
}

// IsLeader returns true if this node is the leader
func (r *Raft) IsLeader() bool {
	return r.state.IsLeader()
}