package raft

import (
	"context"
	"encoding/json"
	"log"
	"math/rand"
	"sort"
	"sync"
	"sync/atomic"
	"time"
)

type Node struct {
	mu sync.RWMutex

	// Node identity and configuration
	id     string
	config NodeConfig

	// Persistent state
	currentTerm uint64
	votedFor    string
	log         []LogEntry

	// Volatile state
	state       NodeState
	commitIndex uint64
	lastApplied uint64

	// Leader state
	nextIndex  map[string]uint64
	matchIndex map[string]uint64

	// Cluster configuration (with joint consensus support)
	cluster       *ClusterConfig
	jointConfig   *JointConfig
	configPending bool

	// Channels
	applyCh         chan ApplyMsg
	stopCh          chan struct{}
	electionResetCh chan struct{}

	// Pending operations
	pendingCommands map[uint64]*PendingCommand
	pendingReads    []*ReadIndex
	readMu          sync.Mutex

	// Components
	transport    Transport
	wal          WALInterface
	stateMachine StateMachineInterface

	// Snapshot state
	snapshot           *Snapshot
	snapshotThreshold  uint64
	snapshotInProgress int32

	// Leader tracking
	leaderID        string
	lastHeartbeat   time.Time
	electionTimeout time.Duration

	// Monotonic election timer
	electionDeadline time.Time
	electionMu       sync.Mutex

	// Read index tracking
	readIndex     uint64
	readIndexTerm uint64

	// Metrics
	lastLogSize uint64
}

// WALInterface defines the interface for write-ahead log
type WALInterface interface {
	Save(state *PersistentState) error
	Load() (*PersistentState, error)
	SaveSnapshot(snapshot *Snapshot) error
	LoadSnapshot() (*Snapshot, error)
	Close() error
	Size() (int64, error)
}

// StateMachineInterface defines the interface for the state machine
type StateMachineInterface interface {
	Apply(cmd Command) string
	Get(key string) (string, bool)
	GetSnapshot() map[string]string
	RestoreSnapshot(data map[string]string)
}

// JointConfig for joint consensus membership changes
type JointConfig struct {
	OldConfig []string
	NewConfig []string
}

func NewNode(config NodeConfig, transport Transport, wal WALInterface, stateMachine StateMachineInterface) *Node {
	n := &Node{
		id:               config.ID,
		config:           config,
		currentTerm:      0,
		votedFor:         "",
		log:              make([]LogEntry, 0),
		state:            Follower,
		commitIndex:      0,
		lastApplied:      0,
		nextIndex:        make(map[string]uint64),
		matchIndex:       make(map[string]uint64),
		cluster:          NewClusterConfig(),
		applyCh:          make(chan ApplyMsg, 100),
		stopCh:           make(chan struct{}),
		electionResetCh:  make(chan struct{}, 1),
		pendingCommands:  make(map[uint64]*PendingCommand),
		pendingReads:     make([]*ReadIndex, 0),
		transport:        transport,
		wal:              wal,
		stateMachine:     stateMachine,
		snapshotThreshold: config.SnapshotThreshold,
		electionDeadline: time.Now().Add(config.ElectionTimeoutMax),
	}

	n.cluster.AddNode(config.ID)
	for _, peer := range config.Peers {
		n.cluster.AddNode(peer)
	}

	// Initialize log with dummy entry at index 0
	n.log = append(n.log, LogEntry{Index: 0, Term: 0, Command: Command{Type: CommandNoop}})

	return n
}

func (n *Node) Start() error {
	if err := n.restore(); err != nil {
		log.Printf("Node %s: Failed to restore state: %v", n.id, err)
	}

	go n.run()
	go n.applyLoop()

	return nil
}

func (n *Node) Stop() {
	close(n.stopCh)
	if n.wal != nil {
		n.wal.Close()
	}
}

func (n *Node) run() {
	for {
		select {
		case <-n.stopCh:
			return
		default:
		}

		n.mu.RLock()
		state := n.state
		n.mu.RUnlock()

		switch state {
		case Follower:
			n.runFollower()
		case Candidate:
			n.runCandidate()
		case Leader:
			n.runLeader()
		}
	}
}

func (n *Node) runFollower() {
	n.resetElectionDeadline()

	for {
		select {
		case <-n.stopCh:
			return
		default:
		}

		n.electionMu.Lock()
		deadline := n.electionDeadline
		n.electionMu.Unlock()

		timeout := time.Until(deadline)
		if timeout <= 0 {
			n.mu.Lock()
			if n.state == Follower {
				n.becomeCandidate()
			}
			n.mu.Unlock()
			return
		}

		select {
		case <-n.stopCh:
			return
		case <-n.electionResetCh:
			n.resetElectionDeadline()
		case <-time.After(timeout):
			n.mu.Lock()
			if n.state == Follower {
				n.becomeCandidate()
			}
			n.mu.Unlock()
			return
		}
	}
}

func (n *Node) runCandidate() {
	n.mu.Lock()
	n.currentTerm++
	n.votedFor = n.id
	currentTerm := n.currentTerm
	lastLogIndex := n.getLastLogIndex()
	lastLogTerm := n.getLastLogTerm()
	n.persist()
	n.mu.Unlock()

	log.Printf("Node %s: Starting election for term %d", n.id, currentTerm)

	votesReceived := int32(1)
	votesNeeded := int32(n.cluster.Size()/2 + 1)

	peers := n.cluster.GetNodes()
	var wg sync.WaitGroup

	for _, peer := range peers {
		if peer == n.id {
			continue
		}

		wg.Add(1)
		go func(peer string) {
			defer wg.Done()

			args := &RequestVoteArgs{
				Term:         currentTerm,
				CandidateID:  n.id,
				LastLogIndex: lastLogIndex,
				LastLogTerm:  lastLogTerm,
			}

			reply, err := n.transport.RequestVote(peer, args)
			if err != nil {
				return
			}

			n.mu.Lock()
			defer n.mu.Unlock()

			if reply.Term > n.currentTerm {
				n.becomeFollower(reply.Term)
				return
			}

			if n.state != Candidate || n.currentTerm != currentTerm {
				return
			}

			if reply.VoteGranted {
				votes := atomic.AddInt32(&votesReceived, 1)
				if votes >= votesNeeded && n.state == Candidate {
					n.becomeLeader()
				}
			}
		}(peer)
	}

	timeout := n.randomElectionTimeout()
	timer := time.NewTimer(timeout)
	defer timer.Stop()

	select {
	case <-n.stopCh:
		return
	case <-timer.C:
		n.mu.Lock()
		if n.state == Candidate {
			log.Printf("Node %s: Election timeout, restarting election", n.id)
			// Immediately restart election by re-entering candidate state
		}
		n.mu.Unlock()
	case <-n.electionResetCh:
		// Received valid AppendEntries, become follower
	}
}

func (n *Node) runLeader() {
	n.sendHeartbeats()

	ticker := time.NewTicker(n.config.HeartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-n.stopCh:
			return
		case <-ticker.C:
			n.mu.RLock()
			isLeader := n.state == Leader
			n.mu.RUnlock()

			if !isLeader {
				return
			}

			n.sendHeartbeats()
			n.advanceCommitIndex()
			n.checkReadIndices()
			n.maybeSnapshotBySize()
		case <-n.electionResetCh:
			// Ignore in leader state
		}
	}
}

func (n *Node) resetElectionDeadline() {
	n.electionMu.Lock()
	defer n.electionMu.Unlock()
	n.electionDeadline = time.Now().Add(n.randomElectionTimeout())
}

func (n *Node) sendHeartbeats() {
	n.mu.RLock()
	if n.state != Leader {
		n.mu.RUnlock()
		return
	}
	currentTerm := n.currentTerm
	commitIndex := n.commitIndex
	n.mu.RUnlock()

	peers := n.cluster.GetNodes()
	for _, peer := range peers {
		if peer == n.id {
			continue
		}
		go n.sendAppendEntries(peer, currentTerm, commitIndex)
	}
}

func (n *Node) sendAppendEntries(peer string, term uint64, leaderCommit uint64) {
	n.mu.RLock()
	if n.state != Leader || n.currentTerm != term {
		n.mu.RUnlock()
		return
	}

	nextIdx := n.nextIndex[peer]
	if nextIdx == 0 {
		nextIdx = n.getLastLogIndex() + 1
	}

	// Check if we need to send a snapshot
	snapshotIdx := uint64(0)
	if n.snapshot != nil {
		snapshotIdx = n.snapshot.LastIncludedIndex
	}

	if snapshotIdx > 0 && nextIdx <= snapshotIdx {
		n.mu.RUnlock()
		n.sendSnapshot(peer)
		return
	}

	prevLogIndex := nextIdx - 1
	prevLogTerm := uint64(0)

	// Handle prevLogIndex with snapshot awareness
	if prevLogIndex > 0 {
		if snapshotIdx > 0 && prevLogIndex == snapshotIdx {
			prevLogTerm = n.snapshot.LastIncludedTerm
		} else {
			logIdx := n.logIndexToArrayIndex(prevLogIndex)
			if logIdx >= 0 && logIdx < len(n.log) {
				prevLogTerm = n.log[logIdx].Term
			}
		}
	}

	entries := make([]LogEntry, 0)
	startIdx := n.logIndexToArrayIndex(nextIdx)
	if startIdx >= 0 && startIdx < len(n.log) {
		entries = append(entries, n.log[startIdx:]...)
	}

	args := &AppendEntriesArgs{
		Term:         term,
		LeaderID:     n.id,
		PrevLogIndex: prevLogIndex,
		PrevLogTerm:  prevLogTerm,
		Entries:      entries,
		LeaderCommit: leaderCommit,
	}
	n.mu.RUnlock()

	reply, err := n.transport.AppendEntries(peer, args)
	if err != nil {
		return
	}

	n.mu.Lock()
	defer n.mu.Unlock()

	if reply.Term > n.currentTerm {
		n.becomeFollower(reply.Term)
		return
	}

	if n.state != Leader || n.currentTerm != term {
		return
	}

	if reply.Success {
		newNextIndex := nextIdx + uint64(len(entries))
		if newNextIndex > n.nextIndex[peer] {
			n.nextIndex[peer] = newNextIndex
		}
		newMatchIndex := newNextIndex - 1
		if newMatchIndex > n.matchIndex[peer] {
			n.matchIndex[peer] = newMatchIndex
		}
		n.tryAdvanceCommitIndex()
	} else {
		if reply.ConflictTerm > 0 {
			lastIndex := uint64(0)
			for i := len(n.log) - 1; i >= 0; i-- {
				if n.log[i].Term == reply.ConflictTerm {
					lastIndex = n.log[i].Index
					break
				}
			}
			if lastIndex > 0 {
				n.nextIndex[peer] = lastIndex + 1
			} else {
				n.nextIndex[peer] = reply.ConflictIndex
			}
		} else if reply.ConflictIndex > 0 {
			n.nextIndex[peer] = reply.ConflictIndex
		} else if n.nextIndex[peer] > 1 {
			n.nextIndex[peer]--
		}
	}
}

func (n *Node) logIndexToArrayIndex(logIndex uint64) int {
	if len(n.log) == 0 {
		return -1
	}
	baseIndex := n.log[0].Index
	if logIndex < baseIndex {
		return -1
	}
	return int(logIndex - baseIndex)
}

func (n *Node) arrayIndexToLogIndex(arrayIndex int) uint64 {
	if len(n.log) == 0 || arrayIndex < 0 {
		return 0
	}
	return n.log[0].Index + uint64(arrayIndex)
}

func (n *Node) sendSnapshot(peer string) {
	n.mu.RLock()
	if n.state != Leader || n.snapshot == nil {
		n.mu.RUnlock()
		return
	}

	snapshotData, err := json.Marshal(n.snapshot.Data)
	if err != nil {
		n.mu.RUnlock()
		return
	}

	args := &InstallSnapshotArgs{
		Term:              n.currentTerm,
		LeaderID:          n.id,
		LastIncludedIndex: n.snapshot.LastIncludedIndex,
		LastIncludedTerm:  n.snapshot.LastIncludedTerm,
		Data:              snapshotData,
	}
	n.mu.RUnlock()

	reply, err := n.transport.InstallSnapshot(peer, args)
	if err != nil {
		return
	}

	n.mu.Lock()
	defer n.mu.Unlock()

	if reply.Term > n.currentTerm {
		n.becomeFollower(reply.Term)
		return
	}

	n.nextIndex[peer] = args.LastIncludedIndex + 1
	n.matchIndex[peer] = args.LastIncludedIndex
}

func (n *Node) tryAdvanceCommitIndex() {
	if n.state != Leader {
		return
	}

	// Collect all match indices including self
	matchIndices := make([]uint64, 0, n.cluster.Size())
	matchIndices = append(matchIndices, n.getLastLogIndex()) // Leader's own log

	for _, peer := range n.cluster.GetNodes() {
		if peer == n.id {
			continue
		}
		matchIndices = append(matchIndices, n.matchIndex[peer])
	}

	sort.Slice(matchIndices, func(i, j int) bool {
		return matchIndices[i] > matchIndices[j]
	})

	// Find median (majority)
	majority := n.cluster.Size() / 2
	if majority >= len(matchIndices) {
		return
	}

	newCommitIndex := matchIndices[majority]

	// Only commit entries from current term
	if newCommitIndex > n.commitIndex {
		logIdx := n.logIndexToArrayIndex(newCommitIndex)
		if logIdx >= 0 && logIdx < len(n.log) && n.log[logIdx].Term == n.currentTerm {
			oldCommit := n.commitIndex
			n.commitIndex = newCommitIndex
			log.Printf("Node %s: Committed index %d (was %d)", n.id, newCommitIndex, oldCommit)

			// Notify pending commands
			for idx := oldCommit + 1; idx <= newCommitIndex; idx++ {
				if pending, ok := n.pendingCommands[idx]; ok {
					arrIdx := n.logIndexToArrayIndex(idx)
					if arrIdx >= 0 && arrIdx < len(n.log) {
						result := CommitResult{
							Index: idx,
							Term:  n.log[arrIdx].Term,
						}
						select {
						case pending.ResultCh <- result:
						default:
						}
					}
					delete(n.pendingCommands, idx)
				}
			}
		}
	}
}

func (n *Node) advanceCommitIndex() {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.tryAdvanceCommitIndex()
}

func (n *Node) HandleRequestVote(args *RequestVoteArgs) *RequestVoteReply {
	n.mu.Lock()
	defer n.mu.Unlock()

	reply := &RequestVoteReply{
		Term:        n.currentTerm,
		VoteGranted: false,
	}

	if args.Term < n.currentTerm {
		return reply
	}

	if args.Term > n.currentTerm {
		n.becomeFollower(args.Term)
	}

	reply.Term = n.currentTerm

	if (n.votedFor == "" || n.votedFor == args.CandidateID) && n.isLogUpToDate(args.LastLogIndex, args.LastLogTerm) {
		n.votedFor = args.CandidateID
		reply.VoteGranted = true
		n.persist()
		n.resetElectionTimer()
		log.Printf("Node %s: Granted vote to %s for term %d", n.id, args.CandidateID, args.Term)
	}

	return reply
}

func (n *Node) HandleAppendEntries(args *AppendEntriesArgs) *AppendEntriesReply {
	n.mu.Lock()
	defer n.mu.Unlock()

	reply := &AppendEntriesReply{
		Term:    n.currentTerm,
		Success: false,
	}

	if args.Term < n.currentTerm {
		return reply
	}

	if args.Term > n.currentTerm || n.state == Candidate {
		n.becomeFollower(args.Term)
	}

	n.leaderID = args.LeaderID
	n.lastHeartbeat = time.Now()
	n.resetElectionTimer()

	reply.Term = n.currentTerm

	// Check log consistency
	if args.PrevLogIndex > 0 {
		logIdx := n.logIndexToArrayIndex(args.PrevLogIndex)
		if logIdx < 0 || logIdx >= len(n.log) {
			reply.ConflictIndex = uint64(len(n.log))
			if len(n.log) > 0 {
				reply.ConflictIndex = n.log[len(n.log)-1].Index + 1
			}
			reply.ConflictTerm = 0
			return reply
		}

		if n.log[logIdx].Term != args.PrevLogTerm {
			conflictTerm := n.log[logIdx].Term
			reply.ConflictTerm = conflictTerm

			for i := logIdx; i >= 0; i-- {
				if n.log[i].Term != conflictTerm {
					reply.ConflictIndex = n.log[i+1].Index
					break
				}
				if i == 0 {
					reply.ConflictIndex = n.log[0].Index
				}
			}
			return reply
		}
	}

	// Append new entries
	for i, entry := range args.Entries {
		logIdx := n.logIndexToArrayIndex(args.PrevLogIndex + 1 + uint64(i))
		if logIdx >= 0 && logIdx < len(n.log) {
			if n.log[logIdx].Term != entry.Term {
				n.log = n.log[:logIdx]
				n.log = append(n.log, entry)
			}
		} else {
			n.log = append(n.log, entry)
		}
	}

	if len(args.Entries) > 0 {
		n.persist()
	}

	if args.LeaderCommit > n.commitIndex {
		lastNewIndex := args.PrevLogIndex + uint64(len(args.Entries))
		if args.LeaderCommit < lastNewIndex {
			n.commitIndex = args.LeaderCommit
		} else {
			n.commitIndex = lastNewIndex
		}
	}

	reply.Success = true
	return reply
}

func (n *Node) HandleInstallSnapshot(args *InstallSnapshotArgs) *InstallSnapshotReply {
	n.mu.Lock()
	defer n.mu.Unlock()

	reply := &InstallSnapshotReply{
		Term: n.currentTerm,
	}

	if args.Term < n.currentTerm {
		return reply
	}

	if args.Term > n.currentTerm {
		n.becomeFollower(args.Term)
	}

	n.leaderID = args.LeaderID
	n.resetElectionTimer()

	var snapshotData map[string]string
	if err := json.Unmarshal(args.Data, &snapshotData); err != nil {
		log.Printf("Node %s: Failed to unmarshal snapshot: %v", n.id, err)
		return reply
	}

	// Discard log entries covered by snapshot
	n.log = []LogEntry{{
		Index:   args.LastIncludedIndex,
		Term:    args.LastIncludedTerm,
		Command: Command{Type: CommandNoop},
	}}

	n.snapshot = &Snapshot{
		LastIncludedIndex: args.LastIncludedIndex,
		LastIncludedTerm:  args.LastIncludedTerm,
		Data:              snapshotData,
	}

	if args.LastIncludedIndex > n.commitIndex {
		n.commitIndex = args.LastIncludedIndex
	}
	if args.LastIncludedIndex > n.lastApplied {
		n.lastApplied = args.LastIncludedIndex
	}

	n.stateMachine.RestoreSnapshot(snapshotData)
	n.persist()

	if n.wal != nil {
		n.wal.SaveSnapshot(n.snapshot)
	}

	log.Printf("Node %s: Installed snapshot at index %d", n.id, args.LastIncludedIndex)

	return reply
}

func (n *Node) Submit(cmd Command) (uint64, uint64, bool) {
	n.mu.Lock()
	defer n.mu.Unlock()

	if n.state != Leader {
		return 0, 0, false
	}

	entry := LogEntry{
		Index:   n.getLastLogIndex() + 1,
		Term:    n.currentTerm,
		Command: cmd,
	}

	n.log = append(n.log, entry)
	n.persist()

	log.Printf("Node %s: Appended entry %d with command %v", n.id, entry.Index, cmd)

	return entry.Index, entry.Term, true
}

func (n *Node) SubmitWithResult(ctx context.Context, cmd Command) (CommitResult, error) {
	index, term, isLeader := n.Submit(cmd)
	if !isLeader {
		return CommitResult{}, ErrNotLeader
	}

	resultCh := make(chan CommitResult, 1)
	pending := &PendingCommand{
		Index:    index,
		Term:     term,
		ResultCh: resultCh,
	}

	n.mu.Lock()
	n.pendingCommands[index] = pending
	n.mu.Unlock()

	select {
	case result := <-resultCh:
		if result.Error != nil {
			return result, result.Error
		}
		return result, nil
	case <-ctx.Done():
		n.mu.Lock()
		delete(n.pendingCommands, index)
		n.mu.Unlock()
		return CommitResult{}, ctx.Err()
	}
}

// Read performs a linearizable read using ReadIndex
func (n *Node) Read(ctx context.Context, key string) (string, error) {
	n.mu.Lock()
	if n.state != Leader {
		n.mu.Unlock()
		return "", ErrNotLeader
	}

	readIdx := n.commitIndex
	currentTerm := n.currentTerm
	n.mu.Unlock()

	// Confirm leadership with heartbeat quorum
	if !n.confirmLeadership(currentTerm) {
		return "", ErrNotLeader
	}

	// Wait for apply index to catch up
	deadline := time.Now().Add(5 * time.Second)
	for {
		n.mu.RLock()
		lastApplied := n.lastApplied
		n.mu.RUnlock()

		if lastApplied >= readIdx {
			break
		}

		if time.Now().After(deadline) {
			return "", ErrTimeout
		}

		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-time.After(10 * time.Millisecond):
		}
	}

	value, _ := n.stateMachine.Get(key)
	return value, nil
}

func (n *Node) confirmLeadership(term uint64) bool {
	n.mu.RLock()
	if n.state != Leader || n.currentTerm != term {
		n.mu.RUnlock()
		return false
	}
	peers := n.cluster.GetNodes()
	needed := n.cluster.Size()/2 + 1
	n.mu.RUnlock()

	ackCount := int32(1) // Count self
	done := make(chan struct{}, 1)
	var wg sync.WaitGroup

	for _, peer := range peers {
		if peer == n.id {
			continue
		}

		wg.Add(1)
		go func(peer string) {
			defer wg.Done()

			n.mu.RLock()
			args := &AppendEntriesArgs{
				Term:         n.currentTerm,
				LeaderID:     n.id,
				PrevLogIndex: n.getLastLogIndex(),
				PrevLogTerm:  n.getLastLogTerm(),
				Entries:      nil,
				LeaderCommit: n.commitIndex,
			}
			n.mu.RUnlock()

			reply, err := n.transport.AppendEntries(peer, args)
			if err != nil {
				return
			}

			if reply.Success {
				if atomic.AddInt32(&ackCount, 1) >= int32(needed) {
					select {
					case done <- struct{}{}:
					default:
					}
				}
			}
		}(peer)
	}

	select {
	case <-done:
		return true
	case <-time.After(n.config.HeartbeatInterval * 3):
		return atomic.LoadInt32(&ackCount) >= int32(needed)
	}
}

func (n *Node) checkReadIndices() {
	n.readMu.Lock()
	defer n.readMu.Unlock()

	n.mu.RLock()
	lastApplied := n.lastApplied
	n.mu.RUnlock()

	remaining := make([]*ReadIndex, 0)
	for _, read := range n.pendingReads {
		if lastApplied >= read.Index {
			result := CommitResult{Index: read.Index}
			select {
			case read.ResultCh <- result:
			default:
			}
		} else {
			remaining = append(remaining, read)
		}
	}
	n.pendingReads = remaining
}

// Joint consensus membership changes

func (n *Node) AddNode(nodeID string) error {
	return n.changeMembership(nodeID, true)
}

func (n *Node) RemoveNode(nodeID string) error {
	return n.changeMembership(nodeID, false)
}

func (n *Node) changeMembership(nodeID string, adding bool) error {
	n.mu.Lock()
	if n.state != Leader {
		n.mu.Unlock()
		return ErrNotLeader
	}

	if n.configPending {
		n.mu.Unlock()
		return ErrConfigChangePending
	}

	// Create joint configuration
	oldNodes := n.cluster.GetNodes()
	newNodes := make([]string, 0)

	if adding {
		newNodes = append(newNodes, oldNodes...)
		newNodes = append(newNodes, nodeID)
	} else {
		for _, node := range oldNodes {
			if node != nodeID {
				newNodes = append(newNodes, node)
			}
		}
	}

	n.jointConfig = &JointConfig{
		OldConfig: oldNodes,
		NewConfig: newNodes,
	}
	n.configPending = true
	n.mu.Unlock()

	// First phase: commit joint config
	cmdType := CommandAddNode
	if !adding {
		cmdType = CommandRemoveNode
	}

	cmd := Command{
		Type:  cmdType,
		Key:   nodeID,
		Value: "joint",
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := n.SubmitWithResult(ctx, cmd)
	if err != nil {
		n.mu.Lock()
		n.jointConfig = nil
		n.configPending = false
		n.mu.Unlock()
		return err
	}

	// Second phase: commit final config
	n.mu.Lock()
	if adding {
		n.cluster.AddNode(nodeID)
		n.nextIndex[nodeID] = n.getLastLogIndex() + 1
		n.matchIndex[nodeID] = 0
	} else {
		n.cluster.RemoveNode(nodeID)
		delete(n.nextIndex, nodeID)
		delete(n.matchIndex, nodeID)
	}
	n.jointConfig = nil
	n.configPending = false
	n.mu.Unlock()

	// Commit new config entry
	cmd = Command{
		Type:  cmdType,
		Key:   nodeID,
		Value: "final",
	}

	ctx2, cancel2 := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel2()

	_, err = n.SubmitWithResult(ctx2, cmd)
	return err
}

func (n *Node) applyLoop() {
	for {
		select {
		case <-n.stopCh:
			return
		default:
		}

		n.mu.Lock()
		commitIndex := n.commitIndex
		lastApplied := n.lastApplied
		n.mu.Unlock()

		if lastApplied < commitIndex {
			for i := lastApplied + 1; i <= commitIndex; i++ {
				n.mu.RLock()
				arrIdx := n.logIndexToArrayIndex(i)
				if arrIdx < 0 || arrIdx >= len(n.log) {
					n.mu.RUnlock()
					break
				}
				entry := n.log[arrIdx]
				n.mu.RUnlock()

				result := n.stateMachine.Apply(entry.Command)

				n.applyCh <- ApplyMsg{
					CommandValid: true,
					Command:      entry.Command,
					CommandIndex: entry.Index,
					CommandTerm:  entry.Term,
				}

				n.mu.Lock()
				n.lastApplied = i

				if n.state == Leader {
					if pending, ok := n.pendingCommands[i]; ok {
						commitResult := CommitResult{
							Index: i,
							Term:  entry.Term,
							Value: result,
						}
						select {
						case pending.ResultCh <- commitResult:
						default:
						}
						delete(n.pendingCommands, i)
					}
				}
				n.mu.Unlock()
			}
		}

		time.Sleep(10 * time.Millisecond)
	}
}

func (n *Node) maybeSnapshotBySize() {
	if atomic.LoadInt32(&n.snapshotInProgress) == 1 {
		return
	}

	if n.wal == nil {
		return
	}

	size, err := n.wal.Size()
	if err != nil {
		return
	}

	// Snapshot when WAL exceeds threshold (e.g., 10MB)
	if size > int64(n.snapshotThreshold)*10000 {
		go func() {
			if atomic.CompareAndSwapInt32(&n.snapshotInProgress, 0, 1) {
				defer atomic.StoreInt32(&n.snapshotInProgress, 0)
				n.mu.RLock()
				lastApplied := n.lastApplied
				n.mu.RUnlock()
				n.CreateSnapshot(lastApplied)
			}
		}()
	}
}

func (n *Node) CreateSnapshot(index uint64) error {
	n.mu.Lock()
	defer n.mu.Unlock()

	arrIdx := n.logIndexToArrayIndex(index)
	if arrIdx <= 0 || arrIdx >= len(n.log) {
		return nil
	}

	snapshot := &Snapshot{
		LastIncludedIndex: index,
		LastIncludedTerm:  n.log[arrIdx].Term,
		Data:              n.stateMachine.GetSnapshot(),
	}

	// Keep only entries after snapshot
	n.log = n.log[arrIdx:]
	n.log[0] = LogEntry{
		Index:   index,
		Term:    snapshot.LastIncludedTerm,
		Command: Command{Type: CommandNoop},
	}

	if n.wal != nil {
		if err := n.wal.SaveSnapshot(snapshot); err != nil {
			return err
		}
	}

	n.snapshot = snapshot
	log.Printf("Node %s: Created snapshot at index %d", n.id, index)

	return nil
}

// Helper functions

func (n *Node) becomeFollower(term uint64) {
	log.Printf("Node %s: Becoming follower for term %d", n.id, term)
	n.state = Follower
	n.currentTerm = term
	n.votedFor = ""
	n.leaderID = ""

	for idx, pending := range n.pendingCommands {
		result := CommitResult{
			Index: idx,
			Error: ErrNotLeader,
		}
		select {
		case pending.ResultCh <- result:
		default:
		}
	}
	n.pendingCommands = make(map[uint64]*PendingCommand)

	n.persist()
}

func (n *Node) becomeCandidate() {
	log.Printf("Node %s: Becoming candidate for term %d", n.id, n.currentTerm+1)
	n.state = Candidate
}

func (n *Node) becomeLeader() {
	log.Printf("Node %s: Becoming leader for term %d", n.id, n.currentTerm)
	n.state = Leader
	n.leaderID = n.id

	lastLogIndex := n.getLastLogIndex()
	for _, peer := range n.cluster.GetNodes() {
		if peer != n.id {
			n.nextIndex[peer] = lastLogIndex + 1
			n.matchIndex[peer] = 0
		}
	}

	// Append no-op entry
	noopEntry := LogEntry{
		Index:   lastLogIndex + 1,
		Term:    n.currentTerm,
		Command: Command{Type: CommandNoop},
	}
	n.log = append(n.log, noopEntry)
	n.persist()
}

func (n *Node) getLastLogIndex() uint64 {
	if len(n.log) == 0 {
		if n.snapshot != nil {
			return n.snapshot.LastIncludedIndex
		}
		return 0
	}
	return n.log[len(n.log)-1].Index
}

func (n *Node) getLastLogTerm() uint64 {
	if len(n.log) == 0 {
		if n.snapshot != nil {
			return n.snapshot.LastIncludedTerm
		}
		return 0
	}
	return n.log[len(n.log)-1].Term
}

func (n *Node) isLogUpToDate(lastLogIndex, lastLogTerm uint64) bool {
	myLastTerm := n.getLastLogTerm()
	myLastIndex := n.getLastLogIndex()

	if lastLogTerm != myLastTerm {
		return lastLogTerm > myLastTerm
	}
	return lastLogIndex >= myLastIndex
}

func (n *Node) randomElectionTimeout() time.Duration {
	min := int64(n.config.ElectionTimeoutMin)
	max := int64(n.config.ElectionTimeoutMax)
	return time.Duration(min + rand.Int63n(max-min))
}

func (n *Node) resetElectionTimer() {
	select {
	case n.electionResetCh <- struct{}{}:
	default:
	}
	n.resetElectionDeadline()
}

func (n *Node) persist() {
	if n.wal == nil {
		return
	}

	state := &PersistentState{
		CurrentTerm: n.currentTerm,
		VotedFor:    n.votedFor,
		Log:         n.log,
	}

	if err := n.wal.Save(state); err != nil {
		log.Printf("Node %s: Failed to persist state: %v", n.id, err)
	}
}

func (n *Node) restore() error {
	if n.wal == nil {
		return nil
	}

	snapshot, err := n.wal.LoadSnapshot()
	if err == nil && snapshot != nil {
		n.snapshot = snapshot
		n.stateMachine.RestoreSnapshot(snapshot.Data)
		n.lastApplied = snapshot.LastIncludedIndex
		n.commitIndex = snapshot.LastIncludedIndex

		// Reinitialize log with snapshot base
		n.log = []LogEntry{{
			Index:   snapshot.LastIncludedIndex,
			Term:    snapshot.LastIncludedTerm,
			Command: Command{Type: CommandNoop},
		}}
	}

	state, err := n.wal.Load()
	if err != nil {
		return err
	}

	if state != nil {
		n.currentTerm = state.CurrentTerm
		n.votedFor = state.VotedFor
		if len(state.Log) > 0 {
			n.log = state.Log
		}
	}

	return nil
}

// Getters

func (n *Node) GetState() (uint64, bool) {
	n.mu.RLock()
	defer n.mu.RUnlock()
	return n.currentTerm, n.state == Leader
}

func (n *Node) GetLeaderID() string {
	n.mu.RLock()
	defer n.mu.RUnlock()
	return n.leaderID
}

func (n *Node) GetID() string {
	return n.id
}

func (n *Node) IsLeader() bool {
	n.mu.RLock()
	defer n.mu.RUnlock()
	return n.state == Leader
}

func (n *Node) GetCommitIndex() uint64 {
	n.mu.RLock()
	defer n.mu.RUnlock()
	return n.commitIndex
}

func (n *Node) GetLog() []LogEntry {
	n.mu.RLock()
	defer n.mu.RUnlock()
	logCopy := make([]LogEntry, len(n.log))
	copy(logCopy, n.log)
	return logCopy
}

func (n *Node) GetApplyChan() <-chan ApplyMsg {
	return n.applyCh
}

func (n *Node) GetClusterSize() int {
	return n.cluster.Size()
}