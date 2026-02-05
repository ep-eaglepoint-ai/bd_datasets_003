package raft

import (
	"context"
	"log"
	"math/rand"
	"sync"
	"time"
)

// Node represents a Raft node
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

	// Cluster configuration
	cluster *ClusterConfig

	// Channels
	applyCh         chan ApplyMsg
	stopCh          chan struct{}
	electionResetCh chan struct{}

	// Pending operations
	pendingCommands map[uint64]*PendingCommand
	pendingReads    []*ReadIndex
	readMu          sync.Mutex

	// Components
	transport Transport
	wal       WALInterface
	stateMachine StateMachineInterface

	// Snapshot state
	snapshot          *Snapshot
	snapshotThreshold uint64

	// Leader tracking
	leaderID        string
	lastHeartbeat   time.Time
	electionTimeout time.Duration

	// Read index tracking
	readIndex     uint64
	readIndexTerm uint64
}

// WALInterface defines the interface for write-ahead log
type WALInterface interface {
	Save(state *PersistentState) error
	Load() (*PersistentState, error)
	SaveSnapshot(snapshot *Snapshot) error
	LoadSnapshot() (*Snapshot, error)
	Close() error
}

// StateMachineInterface defines the interface for the state machine
type StateMachineInterface interface {
	Apply(cmd Command) string
	Get(key string) (string, bool)
	GetSnapshot() map[string]string
	RestoreSnapshot(data map[string]string)
}

// NewNode creates a new Raft node
func NewNode(config NodeConfig, transport Transport, wal WALInterface, stateMachine StateMachineInterface) *Node {
	n := &Node{
		id:              config.ID,
		config:          config,
		currentTerm:     0,
		votedFor:        "",
		log:             make([]LogEntry, 0),
		state:           Follower,
		commitIndex:     0,
		lastApplied:     0,
		nextIndex:       make(map[string]uint64),
		matchIndex:      make(map[string]uint64),
		cluster:         NewClusterConfig(),
		applyCh:         make(chan ApplyMsg, 100),
		stopCh:          make(chan struct{}),
		electionResetCh: make(chan struct{}, 1),
		pendingCommands: make(map[uint64]*PendingCommand),
		pendingReads:    make([]*ReadIndex, 0),
		transport:       transport,
		wal:             wal,
		stateMachine:    stateMachine,
		snapshotThreshold: config.SnapshotThreshold,
	}

	// Add self to cluster
	n.cluster.AddNode(config.ID)

	// Add initial peers
	for _, peer := range config.Peers {
		n.cluster.AddNode(peer)
	}

	// Initialize log with a dummy entry at index 0
	n.log = append(n.log, LogEntry{Index: 0, Term: 0, Command: Command{Type: CommandNoop}})

	return n
}

// Start begins the Raft node operation
func (n *Node) Start() error {
	// Restore state from WAL
	if err := n.restore(); err != nil {
		log.Printf("Node %s: Failed to restore state: %v", n.id, err)
	}

	// Start the main loop
	go n.run()

	// Start the apply loop
	go n.applyLoop()

	return nil
}

// Stop stops the Raft node
func (n *Node) Stop() {
	close(n.stopCh)
	if n.wal != nil {
		n.wal.Close()
	}
}

// run is the main event loop
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

// runFollower runs the follower state
func (n *Node) runFollower() {
	timeout := n.randomElectionTimeout()
	timer := time.NewTimer(timeout)
	defer timer.Stop()

	for {
		select {
		case <-n.stopCh:
			return
		case <-timer.C:
			// Election timeout - become candidate
			n.mu.Lock()
			if n.state == Follower {
				n.becomeCandidate()
			}
			n.mu.Unlock()
			return
		case <-n.electionResetCh:
			// Reset election timer
			if !timer.Stop() {
				select {
				case <-timer.C:
				default:
				}
			}
			timer.Reset(n.randomElectionTimeout())
		}
	}
}

// runCandidate runs the candidate state
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

	// Vote for self
	votesReceived := 1
	voteMu := sync.Mutex{}

	// Request votes from all peers
	peers := n.cluster.GetNodes()
	for _, peer := range peers {
		if peer == n.id {
			continue
		}

		go func(peer string) {
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
				voteMu.Lock()
				votesReceived++
				votes := votesReceived
				voteMu.Unlock()

				majority := n.cluster.Size()/2 + 1
				if votes >= majority {
					n.becomeLeader()
				}
			}
		}(peer)
	}

	// Wait for election timeout
	timeout := n.randomElectionTimeout()
	timer := time.NewTimer(timeout)
	defer timer.Stop()

	select {
	case <-n.stopCh:
		return
	case <-timer.C:
		n.mu.Lock()
		if n.state == Candidate {
			// Election timeout - start new election
			log.Printf("Node %s: Election timeout, starting new election", n.id)
		}
		n.mu.Unlock()
	case <-n.electionResetCh:
		// Received heartbeat from leader
	}
}

// runLeader runs the leader state
func (n *Node) runLeader() {
	// Send initial heartbeats
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
		case <-n.electionResetCh:
			// Ignore in leader state
		}
	}
}

// sendHeartbeats sends heartbeats to all peers
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

// sendAppendEntries sends AppendEntries RPC to a peer
// sendAppendEntries sends AppendEntries RPC to a peer
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

	prevLogIndex := nextIdx - 1
	prevLogTerm := uint64(0)
	if prevLogIndex > 0 && int(prevLogIndex) < len(n.log) {
		prevLogTerm = n.log[prevLogIndex].Term
	}

	entries := make([]LogEntry, 0)
	if int(nextIdx) < len(n.log) {
		entries = append(entries, n.log[nextIdx:]...)
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
		// Update nextIndex and matchIndex
		newNextIndex := nextIdx + uint64(len(entries))
		if newNextIndex > n.nextIndex[peer] {
			n.nextIndex[peer] = newNextIndex
		}
		newMatchIndex := newNextIndex - 1
		if newMatchIndex > n.matchIndex[peer] {
			n.matchIndex[peer] = newMatchIndex
		}

		// Try to advance commit index immediately after successful replication
		n.tryAdvanceCommitIndex()
	} else {
		// Decrement nextIndex and retry
		if reply.ConflictTerm > 0 {
			lastIndex := uint64(0)
			for i := len(n.log) - 1; i >= 0; i-- {
				if n.log[i].Term == reply.ConflictTerm {
					lastIndex = uint64(i)
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

// tryAdvanceCommitIndex tries to advance the commit index (must be called with lock held)
func (n *Node) tryAdvanceCommitIndex() {
	if n.state != Leader {
		return
	}

	// Find the highest index replicated on a majority
	for idx := n.commitIndex + 1; idx <= n.getLastLogIndex(); idx++ {
		if idx == 0 || int(idx) >= len(n.log) {
			continue
		}

		// Only commit entries from current term
		if n.log[idx].Term != n.currentTerm {
			continue
		}

		count := 1 // Count self
		for _, peer := range n.cluster.GetNodes() {
			if peer == n.id {
				continue
			}
			if n.matchIndex[peer] >= idx {
				count++
			}
		}

		majority := n.cluster.Size()/2 + 1
		if count >= majority {
			n.commitIndex = idx
			log.Printf("Node %s: Committed index %d", n.id, idx)

			// Notify pending commands
			if pending, ok := n.pendingCommands[idx]; ok {
				result := CommitResult{
					Index: idx,
					Term:  n.log[idx].Term,
				}
				select {
				case pending.ResultCh <- result:
				default:
				}
				delete(n.pendingCommands, idx)
			}
		}
	}
}



// advanceCommitIndex advances the commit index if possible
func (n *Node) advanceCommitIndex() {
	n.mu.Lock()
	defer n.mu.Unlock()

	if n.state != Leader {
		return
	}

	// Find the highest index replicated on a majority
	for idx := n.commitIndex + 1; idx <= n.getLastLogIndex(); idx++ {
		if idx == 0 || int(idx) >= len(n.log) {
			continue
		}

		// Only commit entries from current term
		if n.log[idx].Term != n.currentTerm {
			continue
		}

		count := 1 // Count self
		for _, peer := range n.cluster.GetNodes() {
			if peer == n.id {
				continue
			}
			if n.matchIndex[peer] >= idx {
				count++
			}
		}

		majority := n.cluster.Size()/2 + 1
		if count >= majority {
			n.commitIndex = idx
			log.Printf("Node %s: Committed index %d", n.id, idx)

			// Notify pending commands
			if pending, ok := n.pendingCommands[idx]; ok {
				result := CommitResult{
					Index: idx,
					Term:  n.log[idx].Term,
				}
				select {
				case pending.ResultCh <- result:
				default:
				}
				delete(n.pendingCommands, idx)
			}
		}
	}
}

// HandleRequestVote handles incoming RequestVote RPC
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

	// Check if we can vote for this candidate
	if (n.votedFor == "" || n.votedFor == args.CandidateID) && n.isLogUpToDate(args.LastLogIndex, args.LastLogTerm) {
		n.votedFor = args.CandidateID
		reply.VoteGranted = true
		n.persist()
		n.resetElectionTimer()
		log.Printf("Node %s: Granted vote to %s for term %d", n.id, args.CandidateID, args.Term)
	}

	return reply
}

// HandleAppendEntries handles incoming AppendEntries RPC
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

	if args.Term > n.currentTerm {
		n.becomeFollower(args.Term)
	} else if n.state == Candidate {
		n.becomeFollower(args.Term)
	}

	n.leaderID = args.LeaderID
	n.lastHeartbeat = time.Now()
	n.resetElectionTimer()

	reply.Term = n.currentTerm

	// Check if log contains entry at prevLogIndex with prevLogTerm
	if args.PrevLogIndex > 0 {
		if int(args.PrevLogIndex) >= len(n.log) {
			reply.ConflictIndex = uint64(len(n.log))
			reply.ConflictTerm = 0
			return reply
		}

		if n.log[args.PrevLogIndex].Term != args.PrevLogTerm {
			conflictTerm := n.log[args.PrevLogIndex].Term
			reply.ConflictTerm = conflictTerm

			// Find first index with conflictTerm
			for i := args.PrevLogIndex; i > 0; i-- {
				if n.log[i].Term != conflictTerm {
					reply.ConflictIndex = i + 1
					break
				}
				if i == 1 {
					reply.ConflictIndex = 1
				}
			}
			return reply
		}
	}

	// Append new entries
	for i, entry := range args.Entries {
		idx := args.PrevLogIndex + 1 + uint64(i)
		if int(idx) < len(n.log) {
			if n.log[idx].Term != entry.Term {
				// Conflict - truncate and append
				n.log = n.log[:idx]
				n.log = append(n.log, entry)
			}
		} else {
			n.log = append(n.log, entry)
		}
	}

	if len(args.Entries) > 0 {
		n.persist()
	}

	// Update commit index
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

// HandleInstallSnapshot handles incoming InstallSnapshot RPC
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

	// If existing log entry has same index and term as snapshot's last included entry, retain log entries following it
	if args.LastIncludedIndex < uint64(len(n.log)) && n.log[args.LastIncludedIndex].Term == args.LastIncludedTerm {
		n.log = n.log[args.LastIncludedIndex:]
	} else {
		// Discard entire log
		n.log = []LogEntry{{Index: args.LastIncludedIndex, Term: args.LastIncludedTerm, Command: Command{Type: CommandNoop}}}
	}

	// Update commit and last applied indices
	if args.LastIncludedIndex > n.commitIndex {
		n.commitIndex = args.LastIncludedIndex
	}
	if args.LastIncludedIndex > n.lastApplied {
		n.lastApplied = args.LastIncludedIndex
	}

	// Send snapshot to state machine
	n.applyCh <- ApplyMsg{
		SnapshotValid: true,
		Snapshot:      args.Data,
		SnapshotTerm:  args.LastIncludedTerm,
		SnapshotIndex: args.LastIncludedIndex,
	}

	n.persist()
	return reply
}

// Submit submits a command to the Raft cluster
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

// SubmitWithResult submits a command and waits for it to be committed
// SubmitWithResult submits a command and waits for it to be committed
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

// Read performs a linearizable read
func (n *Node) Read(ctx context.Context, key string) (string, error) {
	n.mu.Lock()
	if n.state != Leader {
		n.mu.Unlock()
		return "", ErrNotLeader
	}

	// Record current commit index as read index
	readIndex := n.commitIndex
	currentTerm := n.currentTerm
	n.mu.Unlock()

	// Send heartbeats to confirm leadership
	confirmCh := make(chan bool, 1)
	go func() {
		confirmed := n.confirmLeadership(currentTerm)
		confirmCh <- confirmed
	}()

	select {
	case confirmed := <-confirmCh:
		if !confirmed {
			return "", ErrNotLeader
		}
	case <-ctx.Done():
		return "", ctx.Err()
	}

	// Wait for apply index to catch up
	for {
		n.mu.RLock()
		lastApplied := n.lastApplied
		n.mu.RUnlock()

		if lastApplied >= readIndex {
			break
		}

		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-time.After(10 * time.Millisecond):
		}
	}

	// Read from state machine
	value, _ := n.stateMachine.Get(key)
	return value, nil
}

// confirmLeadership confirms that this node is still the leader
func (n *Node) confirmLeadership(term uint64) bool {
	n.mu.RLock()
	if n.state != Leader || n.currentTerm != term {
		n.mu.RUnlock()
		return false
	}
	n.mu.RUnlock()

	// Send heartbeats and wait for majority acknowledgment
	peers := n.cluster.GetNodes()
	ackCount := 1 // Count self
	ackMu := sync.Mutex{}
	done := make(chan struct{})

	for _, peer := range peers {
		if peer == n.id {
			continue
		}

		go func(peer string) {
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
				ackMu.Lock()
				ackCount++
				if ackCount >= n.cluster.Size()/2+1 {
					select {
					case done <- struct{}{}:
					default:
					}
				}
				ackMu.Unlock()
			}
		}(peer)
	}

	select {
	case <-done:
		return true
	case <-time.After(n.config.HeartbeatInterval * 2):
		ackMu.Lock()
		result := ackCount >= n.cluster.Size()/2+1
		ackMu.Unlock()
		return result
	}
}

// checkReadIndices checks if any pending reads can be satisfied
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

// AddNode adds a new node to the cluster
func (n *Node) AddNode(nodeID string) error {
	n.mu.Lock()
	if n.state != Leader {
		n.mu.Unlock()
		return ErrNotLeader
	}
	n.mu.Unlock()

	cmd := Command{
		Type:  CommandAddNode,
		Key:   nodeID,
		Value: "",
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := n.SubmitWithResult(ctx, cmd)
	if err != nil {
		return err
	}

	n.mu.Lock()
	n.cluster.AddNode(nodeID)
	n.nextIndex[nodeID] = n.getLastLogIndex() + 1
	n.matchIndex[nodeID] = 0
	n.mu.Unlock()

	return nil
}

// RemoveNode removes a node from the cluster
func (n *Node) RemoveNode(nodeID string) error {
	n.mu.Lock()
	if n.state != Leader {
		n.mu.Unlock()
		return ErrNotLeader
	}
	n.mu.Unlock()

	cmd := Command{
		Type:  CommandRemoveNode,
		Key:   nodeID,
		Value: "",
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := n.SubmitWithResult(ctx, cmd)
	if err != nil {
		return err
	}

	n.mu.Lock()
	n.cluster.RemoveNode(nodeID)
	delete(n.nextIndex, nodeID)
	delete(n.matchIndex, nodeID)
	n.mu.Unlock()

	return nil
}

// applyLoop applies committed entries to the state machine
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
				if int(i) >= len(n.log) {
					n.mu.RUnlock()
					break
				}
				entry := n.log[i]
				n.mu.RUnlock()

				// Apply to state machine
				result := n.stateMachine.Apply(entry.Command)

				n.applyCh <- ApplyMsg{
					CommandValid: true,
					Command:      entry.Command,
					CommandIndex: entry.Index,
					CommandTerm:  entry.Term,
				}

				n.mu.Lock()
				n.lastApplied = i

				// Notify pending command if this is the leader
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

				// Check if snapshot is needed
				n.maybeSnapshot()
			}
		}

		time.Sleep(10 * time.Millisecond)
	}
}

// maybeSnapshot creates a snapshot if needed
func (n *Node) maybeSnapshot() {
	n.mu.RLock()
	lastApplied := n.lastApplied
	logLen := uint64(len(n.log))
	n.mu.RUnlock()

	if logLen > n.snapshotThreshold {
		n.CreateSnapshot(lastApplied)
	}
}

// CreateSnapshot creates a snapshot at the given index
func (n *Node) CreateSnapshot(index uint64) error {
	n.mu.Lock()
	defer n.mu.Unlock()

	if index <= 0 || int(index) >= len(n.log) {
		return nil
	}

	snapshot := &Snapshot{
		LastIncludedIndex: index,
		LastIncludedTerm:  n.log[index].Term,
		Data:              n.stateMachine.GetSnapshot(),
	}

	// Trim log
	n.log = n.log[index:]
	n.log[0] = LogEntry{
		Index:   index,
		Term:    snapshot.LastIncludedTerm,
		Command: Command{Type: CommandNoop},
	}

	// Save snapshot
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
	
	// Fail all pending commands since we're no longer leader
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
	// Clear pending commands
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

	// Initialize nextIndex and matchIndex
	lastLogIndex := n.getLastLogIndex()
	for _, peer := range n.cluster.GetNodes() {
		if peer != n.id {
			n.nextIndex[peer] = lastLogIndex + 1
			n.matchIndex[peer] = 0
		}
	}

	// Append a no-op entry to commit entries from previous terms
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
		return 0
	}
	return uint64(len(n.log) - 1)
}

func (n *Node) getLastLogTerm() uint64 {
	if len(n.log) == 0 {
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

	// Restore snapshot first
	snapshot, err := n.wal.LoadSnapshot()
	if err == nil && snapshot != nil {
		n.snapshot = snapshot
		n.stateMachine.RestoreSnapshot(snapshot.Data)
		n.lastApplied = snapshot.LastIncludedIndex
		n.commitIndex = snapshot.LastIncludedIndex
	}

	// Restore persistent state
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

// Getters for testing and inspection

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