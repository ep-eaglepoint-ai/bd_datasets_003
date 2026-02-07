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
	"time"

	"github.com/vzdtic/raft-kv-store/repository_after/pkg/kv"
	"github.com/vzdtic/raft-kv-store/repository_after/pkg/wal"
)

// Config holds the Raft configuration
type Config struct {
	NodeID            string
	Peers             map[string]string
	ElectionTimeout   time.Duration
	HeartbeatInterval time.Duration
	WALDir            string
	SnapshotThreshold int
	ByteSizeThreshold int64
	RandomSeed        int64
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
		ByteSizeThreshold: 10 * 1024 * 1024,
		RandomSeed:        time.Now().UnixNano(),
	}
}

// ApplyResult represents the result of applying a command
type ApplyResult struct {
	Index    uint64
	Response interface{}
	Error    error
}

// CommittedEntry tracks committed entries for verification
type CommittedEntry struct {
	Index   uint64
	Term    uint64
	Command []byte
}

// Raft implements the Raft consensus algorithm
type Raft struct {
	mu     sync.RWMutex
	config *Config
	state  *NodeState
	wal    *wal.WAL
	kv     *kv.Store

	applyCh   chan ApplyResult
	shutdownC chan struct{}
	transport Transport

	pendingMu sync.Mutex
	pending   map[uint64]chan ApplyResult

	readIndexMu   sync.Mutex
	readIndexReqs []readIndexRequest

	clusterMu     sync.RWMutex
	clusterConfig ClusterConfig

	// Joint consensus for membership changes
	jointMu           sync.Mutex
	inJointConsensus  bool
	pendingConfigChange *ConfigChange

	rand   *rand.Rand
	logger *log.Logger

	// Track committed entries for verification
	committedMu      sync.RWMutex
	committedEntries map[uint64]CommittedEntry
}

type readIndexRequest struct {
	index  uint64
	respCh chan error
}

type ClusterConfig struct {
	Members  map[string]ClusterMember
	IsJoint  bool
	OldNodes map[string]ClusterMember
}

type ClusterMember struct {
	NodeID  string
	Address string
	Voting  bool
}

type Transport interface {
	RequestVote(ctx context.Context, target string, req *RequestVoteRequest) (*RequestVoteResponse, error)
	AppendEntries(ctx context.Context, target string, req *AppendEntriesRequest) (*AppendEntriesResponse, error)
	InstallSnapshot(ctx context.Context, target string, req *InstallSnapshotRequest) (*InstallSnapshotResponse, error)
}

type RequestVoteRequest struct {
	Term         uint64
	CandidateID  string
	LastLogIndex uint64
	LastLogTerm  uint64
}

type RequestVoteResponse struct {
	Term        uint64
	VoteGranted bool
}

type AppendEntriesRequest struct {
	Term         uint64
	LeaderID     string
	PrevLogIndex uint64
	PrevLogTerm  uint64
	Entries      []LogEntry
	LeaderCommit uint64
}

type AppendEntriesResponse struct {
	Term          uint64
	Success       bool
	MatchIndex    uint64
	ConflictIndex uint64
	ConflictTerm  uint64
}

type LogEntry struct {
	Term    uint64
	Index   uint64
	Command []byte
	Type    EntryType
}

type EntryType int

const (
	EntryNormal EntryType = iota
	EntryConfigChange
	EntryNoop
)

type InstallSnapshotRequest struct {
	Term              uint64
	LeaderID          string
	LastIncludedIndex uint64
	LastIncludedTerm  uint64
	Data              []byte
	Configuration     []ClusterMember
}

type InstallSnapshotResponse struct {
	Term uint64
}

func New(config *Config, transport Transport, logger *log.Logger) (*Raft, error) {
	walInstance, err := wal.NewWithThreshold(config.WALDir, config.ByteSizeThreshold)
	if err != nil {
		return nil, fmt.Errorf("failed to create WAL: %w", err)
	}

	r := &Raft{
		config:           config,
		state:            NewNodeState(),
		wal:              walInstance,
		kv:               kv.New(),
		applyCh:          make(chan ApplyResult, 100),
		shutdownC:        make(chan struct{}),
		transport:        transport,
		pending:          make(map[uint64]chan ApplyResult),
		rand:             rand.New(rand.NewSource(config.RandomSeed)),
		logger:           logger,
		committedEntries: make(map[uint64]CommittedEntry),
		clusterConfig: ClusterConfig{
			Members: make(map[string]ClusterMember),
		},
	}

	for nodeID, addr := range config.Peers {
		r.clusterConfig.Members[nodeID] = ClusterMember{
			NodeID:  nodeID,
			Address: addr,
			Voting:  true,
		}
	}

	r.clusterConfig.Members[config.NodeID] = ClusterMember{
		NodeID: config.NodeID,
		Voting: true,
	}

	if err := r.recoverState(); err != nil {
		return nil, fmt.Errorf("failed to recover state: %w", err)
	}

	return r, nil
}

func (r *Raft) recoverState() error {
	r.state.SetCurrentTerm(r.wal.GetCurrentTerm())
	r.state.SetVotedFor(r.wal.GetVotedFor())

	snapshot, err := r.wal.LoadSnapshot()
	if err == nil && snapshot != nil {
		if err := r.kv.Restore(snapshot.Data); err != nil {
			return fmt.Errorf("failed to restore snapshot: %w", err)
		}
		r.state.SetLastApplied(snapshot.Metadata.LastIncludedIndex)
		r.state.SetCommitIndex(snapshot.Metadata.LastIncludedIndex)
	}

	entries := r.wal.GetAllEntries()
	for _, entry := range entries {
		if entry.Index > r.state.GetLastApplied() && entry.Index <= r.state.GetCommitIndex() {
			if entry.Type == wal.EntryNormal {
				if _, err := r.kv.Apply(entry.Command); err != nil {
					r.logger.Printf("Failed to apply entry %d: %v", entry.Index, err)
				}
			}
			r.state.SetLastApplied(entry.Index)
		}
	}

	return nil
}

func (r *Raft) Start() {
	go r.run()
}

func (r *Raft) Stop() {
	close(r.shutdownC)
	r.wal.Close()
}

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
			r.state.SetState(Follower)
		}
	case <-timer.C:
		r.logger.Printf("[%s] Election timeout, retrying", r.config.NodeID)
	}
}

func (r *Raft) startElection(done chan<- bool) {
	r.clusterMu.RLock()
	peers := make([]string, 0)
	for nodeID := range r.clusterConfig.Members {
		if nodeID != r.config.NodeID {
			peers = append(peers, nodeID)
		}
	}
	quorum := r.getQuorumSize()
	r.clusterMu.RUnlock()

	lastLogIndex := r.wal.GetLastIndex()
	lastLogTerm := r.wal.GetLastTerm()

	req := &RequestVoteRequest{
		Term:         r.state.GetCurrentTerm(),
		CandidateID:  r.config.NodeID,
		LastLogIndex: lastLogIndex,
		LastLogTerm:  lastLogTerm,
	}

	voteCh := make(chan bool, len(peers))
	votes := 1

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

		if <-voteCh {
			votes++
		}

		if votes >= quorum {
			done <- true
			return
		}
	}

	done <- false
}

func (r *Raft) getQuorumSize() int {
	r.clusterMu.RLock()
	defer r.clusterMu.RUnlock()
	
	if r.clusterConfig.IsJoint {
		// Joint consensus: need majority of both old and new configs
		newCount := len(r.clusterConfig.Members)
		oldCount := len(r.clusterConfig.OldNodes)
		return max((newCount/2)+1, (oldCount/2)+1)
	}
	return len(r.clusterConfig.Members)/2 + 1
}

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
	r.appendNoopEntry()
}

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

func (r *Raft) runLeader() {
	heartbeatTicker := time.NewTicker(r.config.HeartbeatInterval)
	defer heartbeatTicker.Stop()

	r.sendHeartbeats()

	for r.state.GetState() == Leader {
		select {
		case <-r.shutdownC:
			return
		case <-heartbeatTicker.C:
			r.sendHeartbeats()
			r.checkReadIndex()
			r.checkCompaction()
		}
	}
}

func (r *Raft) checkCompaction() {
	if r.wal.NeedsCompaction() {
		go r.takeSnapshot()
	}
}

func (r *Raft) sendHeartbeats() {
	r.clusterMu.RLock()
	peers := make([]string, 0)
	for nodeID := range r.clusterConfig.Members {
		if nodeID != r.config.NodeID {
			peers = append(peers, nodeID)
		}
	}
	r.clusterMu.RUnlock()

	for _, peer := range peers {
		go r.replicateToFollower(peer)
	}
}

func (r *Raft) replicateToFollower(peerId string) {
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
		if len(entries) > 0 {
			newMatchIndex := entries[len(entries)-1].Index
			r.state.SetMatchIndex(peerId, newMatchIndex)
			r.state.SetNextIndex(peerId, newMatchIndex+1)
			r.updateCommitIndex()
		}
	} else {
		if resp.ConflictIndex > 0 {
			r.state.SetNextIndex(peerId, resp.ConflictIndex)
		} else if nextIndex > 1 {
			r.state.SetNextIndex(peerId, nextIndex-1)
		}
	}
}

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

func (r *Raft) updateCommitIndex() {
	r.clusterMu.RLock()
	nodeCount := len(r.clusterConfig.Members)
	r.clusterMu.RUnlock()

	matchIndices := make([]uint64, 0, nodeCount)
	matchIndices = append(matchIndices, r.wal.GetLastIndex())

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

	majorityIdx := len(matchIndices) / 2
	newCommitIndex := matchIndices[majorityIdx]

	if newCommitIndex > r.state.GetCommitIndex() {
		entry := r.wal.GetEntry(newCommitIndex)
		if entry != nil && entry.Term == r.state.GetCurrentTerm() {
			r.state.SetCommitIndex(newCommitIndex)
			r.applyCommittedEntries()
		}
	}
}

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

		if entry.Type == wal.EntryNormal && len(entry.Command) > 0 {
			resp, err := r.kv.Apply(entry.Command)
			result.Response = resp
			result.Error = err
		} else if entry.Type == wal.EntryConfigChange {
			r.applyConfigChange(entry)
		}

		// Track committed entry for verification
		r.committedMu.Lock()
		r.committedEntries[entry.Index] = CommittedEntry{
			Index:   entry.Index,
			Term:    entry.Term,
			Command: entry.Command,
		}
		r.committedMu.Unlock()

		r.state.SetLastApplied(lastApplied)

		r.pendingMu.Lock()
		if ch, ok := r.pending[entry.Index]; ok {
			ch <- result
			close(ch)
			delete(r.pending, entry.Index)
		}
		r.pendingMu.Unlock()
	}
}

func (r *Raft) applyConfigChange(entry *wal.Entry) {
	var change ConfigChange
	dec := gob.NewDecoder(bytes.NewReader(entry.Command))
	if err := dec.Decode(&change); err != nil {
		r.logger.Printf("Failed to decode config change: %v", err)
		return
	}

	r.clusterMu.Lock()
	defer r.clusterMu.Unlock()

	switch change.Type {
	case ConfigChangeAddCommit:
		// Complete the joint consensus
		r.clusterConfig.IsJoint = false
		r.clusterConfig.OldNodes = nil
		r.jointMu.Lock()
		r.inJointConsensus = false
		r.pendingConfigChange = nil
		r.jointMu.Unlock()
	case ConfigChangeRemoveCommit:
		// Complete the removal
		delete(r.clusterConfig.Members, change.NodeID)
		r.clusterConfig.IsJoint = false
		r.clusterConfig.OldNodes = nil
		r.jointMu.Lock()
		r.inJointConsensus = false
		r.pendingConfigChange = nil
		r.jointMu.Unlock()
	}
}

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

func (r *Raft) stepDown(term uint64) {
	r.state.SetCurrentTerm(term)
	r.state.SetState(Follower)
	r.state.SetVotedFor("")
	r.persistState()
}

func (r *Raft) persistState() {
	entries := r.wal.GetAllEntries()
	if err := r.wal.Save(r.state.GetCurrentTerm(), r.state.GetVotedFor(), entries); err != nil {
		r.logger.Printf("[%s] Failed to persist state: %v", r.config.NodeID, err)
	}
}

func (r *Raft) randomElectionTimeout() time.Duration {
	return r.config.ElectionTimeout + time.Duration(r.rand.Int63n(int64(r.config.ElectionTimeout)))
}

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

func (r *Raft) HandleAppendEntries(req *AppendEntriesRequest) *AppendEntriesResponse {
	r.mu.Lock()
	defer r.mu.Unlock()

	resp := &AppendEntriesResponse{
		Term:    r.state.GetCurrentTerm(),
		Success: false,
	}

	if req.Term < r.state.GetCurrentTerm() {
		return resp
	}

	r.state.SetLastHeartbeat(time.Now())
	r.state.SetLeaderId(req.LeaderID)

	if req.Term > r.state.GetCurrentTerm() {
		r.stepDown(req.Term)
		resp.Term = req.Term
	}

	if r.state.GetState() != Follower {
		r.state.SetState(Follower)
	}

	if req.PrevLogIndex > 0 {
		entry := r.wal.GetEntry(req.PrevLogIndex)
		if entry == nil {
			resp.ConflictIndex = r.wal.GetLastIndex() + 1
			return resp
		}
		if entry.Term != req.PrevLogTerm {
			resp.ConflictTerm = entry.Term
			for i := req.PrevLogIndex; i > 0; i-- {
				e := r.wal.GetEntry(i)
				if e == nil || e.Term != resp.ConflictTerm {
					resp.ConflictIndex = i + 1
					break
				}
			}
			r.wal.TruncateAfter(req.PrevLogIndex - 1)
			return resp
		}
	}

	if len(req.Entries) > 0 {
		newEntries := make([]wal.Entry, len(req.Entries))
		for i, e := range req.Entries {
			newEntries[i] = wal.Entry{
				Term:    e.Term,
				Index:   e.Index,
				Command: e.Command,
				Type:    wal.EntryType(e.Type),
			}
		}

		for _, entry := range newEntries {
			existing := r.wal.GetEntry(entry.Index)
			if existing != nil && existing.Term != entry.Term {
				r.wal.TruncateAfter(entry.Index - 1)
			}
		}

		if err := r.wal.AppendEntries(newEntries); err != nil {
			r.logger.Printf("[%s] Failed to append entries: %v", r.config.NodeID, err)
			return resp
		}
	}

	resp.Success = true
	resp.MatchIndex = r.wal.GetLastIndex()

	if req.LeaderCommit > r.state.GetCommitIndex() {
		lastIndex := r.wal.GetLastIndex()
		if req.LeaderCommit < lastIndex {
			r.state.SetCommitIndex(req.LeaderCommit)
		} else {
			r.state.SetCommitIndex(lastIndex)
		}
		r.applyCommittedEntries()
	}

	return resp
}

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

	if err := r.kv.Restore(req.Data); err != nil {
		r.logger.Printf("[%s] Failed to restore snapshot: %v", r.config.NodeID, err)
		return resp
	}

	r.clusterMu.Lock()
	r.clusterConfig.Members = make(map[string]ClusterMember)
	for _, m := range req.Configuration {
		r.clusterConfig.Members[m.NodeID] = m
	}
	r.clusterMu.Unlock()

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

	go r.sendHeartbeats()

	return index, ch
}

func (r *Raft) checkReadIndex() {
	r.readIndexMu.Lock()
	defer r.readIndexMu.Unlock()

	for i := len(r.readIndexReqs) - 1; i >= 0; i-- {
		req := r.readIndexReqs[i]
		if r.state.GetCommitIndex() >= req.index {
			req.respCh <- nil
			close(req.respCh)
			r.readIndexReqs = append(r.readIndexReqs[:i], r.readIndexReqs[i+1:]...)
		}
	}
}

func (r *Raft) ReadIndex() error {
	if r.state.GetState() != Leader {
		return fmt.Errorf("not leader")
	}

	readIndex := r.state.GetCommitIndex()
	respCh := make(chan error, 1)

	r.readIndexMu.Lock()
	r.readIndexReqs = append(r.readIndexReqs, readIndexRequest{
		index:  readIndex,
		respCh: respCh,
	})
	r.readIndexMu.Unlock()

	r.sendHeartbeats()

	select {
	case err := <-respCh:
		return err
	case <-time.After(r.config.ElectionTimeout * 2):
		return fmt.Errorf("read index timeout")
	}
}

func (r *Raft) Get(key string, linearizable bool) ([]byte, bool, error) {
	if linearizable {
		if err := r.ReadIndex(); err != nil {
			return nil, false, err
		}
	}
	value, found := r.kv.Get(key)
	return value, found, nil
}

func (r *Raft) Set(key string, value []byte, clientID string, requestID uint64) error {
	cmd, err := kv.EncodeCommand(kv.CommandSet, key, value, clientID, requestID)
	if err != nil {
		return fmt.Errorf("failed to encode command: %w", err)
	}

	_, ch := r.Propose(cmd)
	result := <-ch
	return result.Error
}

func (r *Raft) Delete(key string, clientID string, requestID uint64) error {
	cmd, err := kv.EncodeCommand(kv.CommandDelete, key, nil, clientID, requestID)
	if err != nil {
		return fmt.Errorf("failed to encode command: %w", err)
	}

	_, ch := r.Propose(cmd)
	result := <-ch
	return result.Error
}

// ConfigChangeType defines the type of configuration change
type ConfigChangeType int

const (
	ConfigChangeAdd ConfigChangeType = iota
	ConfigChangeRemove
	ConfigChangeAddCommit
	ConfigChangeRemoveCommit
)

// ConfigChange represents a cluster configuration change
type ConfigChange struct {
	Type    ConfigChangeType
	NodeID  string
	Address string
}

// AddNode adds a new node using joint consensus
func (r *Raft) AddNode(nodeID, address string) error {
	if r.state.GetState() != Leader {
		return fmt.Errorf("not leader")
	}

	r.jointMu.Lock()
	if r.inJointConsensus {
		r.jointMu.Unlock()
		return fmt.Errorf("another membership change in progress")
	}
	r.inJointConsensus = true
	r.jointMu.Unlock()

	// Step 1: Enter joint consensus (Cold,new)
	r.clusterMu.Lock()
	r.clusterConfig.OldNodes = make(map[string]ClusterMember)
	for k, v := range r.clusterConfig.Members {
		r.clusterConfig.OldNodes[k] = v
	}
	r.clusterConfig.Members[nodeID] = ClusterMember{
		NodeID:  nodeID,
		Address: address,
		Voting:  true,
	}
	r.clusterConfig.IsJoint = true
	r.clusterMu.Unlock()

	// Step 2: Commit the joint configuration
	configChange := ConfigChange{
		Type:    ConfigChangeAdd,
		NodeID:  nodeID,
		Address: address,
	}

	var buf bytes.Buffer
	if err := gob.NewEncoder(&buf).Encode(configChange); err != nil {
		r.jointMu.Lock()
		r.inJointConsensus = false
		r.jointMu.Unlock()
		return fmt.Errorf("failed to encode config change: %w", err)
	}

	entry := wal.Entry{
		Term:    r.state.GetCurrentTerm(),
		Index:   r.wal.GetLastIndex() + 1,
		Command: buf.Bytes(),
		Type:    wal.EntryConfigChange,
	}

	if err := r.wal.AppendEntries([]wal.Entry{entry}); err != nil {
		r.jointMu.Lock()
		r.inJointConsensus = false
		r.jointMu.Unlock()
		return err
	}

	// Wait for joint config to be committed
	r.sendHeartbeats()
	time.Sleep(r.config.HeartbeatInterval * 3)

	// Step 3: Transition to new config (Cnew)
	commitChange := ConfigChange{
		Type:   ConfigChangeAddCommit,
		NodeID: nodeID,
	}

	var buf2 bytes.Buffer
	if err := gob.NewEncoder(&buf2).Encode(commitChange); err != nil {
		return err
	}

	entry2 := wal.Entry{
		Term:    r.state.GetCurrentTerm(),
		Index:   r.wal.GetLastIndex() + 1,
		Command: buf2.Bytes(),
		Type:    wal.EntryConfigChange,
	}

	if err := r.wal.AppendEntries([]wal.Entry{entry2}); err != nil {
		return err
	}

	// Wait for the commit entry to be applied (which clears inJointConsensus)
	r.sendHeartbeats()
	time.Sleep(r.config.HeartbeatInterval * 3)

	return nil
}

// RemoveNode removes a node using joint consensus
func (r *Raft) RemoveNode(nodeID string) error {
	if r.state.GetState() != Leader {
		return fmt.Errorf("not leader")
	}

	r.jointMu.Lock()
	if r.inJointConsensus {
		r.jointMu.Unlock()
		return fmt.Errorf("another membership change in progress")
	}
	r.inJointConsensus = true
	r.jointMu.Unlock()

	// Step 1: Enter joint consensus
	r.clusterMu.Lock()
	r.clusterConfig.OldNodes = make(map[string]ClusterMember)
	for k, v := range r.clusterConfig.Members {
		r.clusterConfig.OldNodes[k] = v
	}
	// Mark as leaving but keep in members until committed
	if member, ok := r.clusterConfig.Members[nodeID]; ok {
		member.Voting = false
		r.clusterConfig.Members[nodeID] = member
	}
	r.clusterConfig.IsJoint = true
	r.clusterMu.Unlock()

	configChange := ConfigChange{
		Type:   ConfigChangeRemove,
		NodeID: nodeID,
	}

	var buf bytes.Buffer
	if err := gob.NewEncoder(&buf).Encode(configChange); err != nil {
		r.jointMu.Lock()
		r.inJointConsensus = false
		r.jointMu.Unlock()
		return err
	}

	entry := wal.Entry{
		Term:    r.state.GetCurrentTerm(),
		Index:   r.wal.GetLastIndex() + 1,
		Command: buf.Bytes(),
		Type:    wal.EntryConfigChange,
	}

	if err := r.wal.AppendEntries([]wal.Entry{entry}); err != nil {
		r.jointMu.Lock()
		r.inJointConsensus = false
		r.jointMu.Unlock()
		return err
	}

	r.sendHeartbeats()
	time.Sleep(r.config.HeartbeatInterval * 3)

	// Commit removal
	commitChange := ConfigChange{
		Type:   ConfigChangeRemoveCommit,
		NodeID: nodeID,
	}

	var buf2 bytes.Buffer
	if err := gob.NewEncoder(&buf2).Encode(commitChange); err != nil {
		return err
	}

	entry2 := wal.Entry{
		Term:    r.state.GetCurrentTerm(),
		Index:   r.wal.GetLastIndex() + 1,
		Command: buf2.Bytes(),
		Type:    wal.EntryConfigChange,
	}

	if err := r.wal.AppendEntries([]wal.Entry{entry2}); err != nil {
		return err
	}

	// Wait for the commit entry to be applied (which clears inJointConsensus)
	r.sendHeartbeats()
	time.Sleep(r.config.HeartbeatInterval * 3)

	return nil
}

// GetClusterInfo returns cluster information
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

// GetCommittedEntry returns committed entry at index for verification
func (r *Raft) GetCommittedEntry(index uint64) *CommittedEntry {
	r.committedMu.RLock()
	defer r.committedMu.RUnlock()
	if entry, ok := r.committedEntries[index]; ok {
		return &entry
	}
	return nil
}

// GetAllCommittedEntries returns all committed entries
func (r *Raft) GetAllCommittedEntries() map[uint64]CommittedEntry {
	r.committedMu.RLock()
	defer r.committedMu.RUnlock()
	result := make(map[uint64]CommittedEntry)
	for k, v := range r.committedEntries {
		result[k] = v
	}
	return result
}

func (r *Raft) GetState() State {
	return r.state.GetState()
}

func (r *Raft) GetNodeID() string {
	return r.config.NodeID
}

func (r *Raft) IsLeader() bool {
	return r.state.IsLeader()
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}