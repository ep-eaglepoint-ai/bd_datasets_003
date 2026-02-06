package testing

import (
	"container/heap"
	"fmt"
	"math/rand"
	"sync"
	"time"

	"github.com/vzdtic/distributed-consensus-raft-kv-store/repository_after/pkg/raft"
)

// Event represents a scheduled event in the simulation
type Event struct {
	Time     int64
	Priority int
	Action   func()
	Index    int // for heap interface
}

// EventHeap implements heap.Interface for events
type EventHeap []*Event

func (h EventHeap) Len() int           { return len(h) }
func (h EventHeap) Less(i, j int) bool { return h[i].Time < h[j].Time }
func (h EventHeap) Swap(i, j int) {
	h[i], h[j] = h[j], h[i]
	h[i].Index = i
	h[j].Index = j
}

func (h *EventHeap) Push(x interface{}) {
	n := len(*h)
	event := x.(*Event)
	event.Index = n
	*h = append(*h, event)
}

func (h *EventHeap) Pop() interface{} {
	old := *h
	n := len(old)
	event := old[n-1]
	old[n-1] = nil
	event.Index = -1
	*h = old[0 : n-1]
	return event
}

// DeterministicClock provides a controllable clock for testing
type DeterministicClock struct {
	mu      sync.Mutex
	current int64
}

func NewDeterministicClock() *DeterministicClock {
	return &DeterministicClock{current: 0}
}

func (c *DeterministicClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return time.Unix(0, c.current)
}

func (c *DeterministicClock) Advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.current += int64(d)
}

func (c *DeterministicClock) Set(t int64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.current = t
}

func (c *DeterministicClock) Get() int64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.current
}

// NetworkCondition represents network behavior between two nodes
type NetworkCondition struct {
	Delay       time.Duration
	DropRate    float64
	Partitioned bool
}

// DeterministicTransport provides controlled message delivery
type DeterministicTransport struct {
	mu         sync.RWMutex
	nodes      map[string]*raft.Node
	conditions map[string]map[string]*NetworkCondition
	clock      *DeterministicClock
	events     *EventHeap
	eventMu    sync.Mutex
	rng        *rand.Rand
	messages   []MessageRecord
	msgMu      sync.Mutex
}

// MessageRecord records a message for later analysis
type MessageRecord struct {
	Time      int64
	From      string
	To        string
	Type      string
	Delivered bool
	Dropped   bool
}

func NewDeterministicTransport(seed int64) *DeterministicTransport {
	h := &EventHeap{}
	heap.Init(h)
	return &DeterministicTransport{
		nodes:      make(map[string]*raft.Node),
		conditions: make(map[string]map[string]*NetworkCondition),
		clock:      NewDeterministicClock(),
		events:     h,
		rng:        rand.New(rand.NewSource(seed)),
		messages:   make([]MessageRecord, 0),
	}
}

func (t *DeterministicTransport) Register(id string, node *raft.Node) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.nodes[id] = node
	t.conditions[id] = make(map[string]*NetworkCondition)
}

func (t *DeterministicTransport) GetClock() *DeterministicClock {
	return t.clock
}

// SetNetworkCondition sets the network condition between two nodes
func (t *DeterministicTransport) SetNetworkCondition(from, to string, cond *NetworkCondition) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.conditions[from] == nil {
		t.conditions[from] = make(map[string]*NetworkCondition)
	}
	t.conditions[from][to] = cond
}

// Partition isolates a node from all others
func (t *DeterministicTransport) Partition(nodeID string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	for id := range t.nodes {
		if id != nodeID {
			if t.conditions[nodeID] == nil {
				t.conditions[nodeID] = make(map[string]*NetworkCondition)
			}
			if t.conditions[id] == nil {
				t.conditions[id] = make(map[string]*NetworkCondition)
			}
			t.conditions[nodeID][id] = &NetworkCondition{Partitioned: true}
			t.conditions[id][nodeID] = &NetworkCondition{Partitioned: true}
		}
	}
}

// Heal removes all partitions for a node
func (t *DeterministicTransport) Heal(nodeID string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.conditions[nodeID] = make(map[string]*NetworkCondition)
	for id := range t.nodes {
		if t.conditions[id] != nil {
			delete(t.conditions[id], nodeID)
		}
	}
}

// HealAll removes all network conditions
func (t *DeterministicTransport) HealAll() {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.conditions = make(map[string]map[string]*NetworkCondition)
}

func (t *DeterministicTransport) getCondition(from, to string) *NetworkCondition {
	if t.conditions[from] == nil {
		return nil
	}
	return t.conditions[from][to]
}

func (t *DeterministicTransport) shouldDrop(from, to string) bool {
	cond := t.getCondition(from, to)
	if cond == nil {
		return false
	}
	if cond.Partitioned {
		return true
	}
	if cond.DropRate > 0 && t.rng.Float64() < cond.DropRate {
		return true
	}
	return false
}

func (t *DeterministicTransport) recordMessage(from, to, msgType string, delivered, dropped bool) {
	t.msgMu.Lock()
	defer t.msgMu.Unlock()
	t.messages = append(t.messages, MessageRecord{
		Time:      t.clock.Get(),
		From:      from,
		To:        to,
		Type:      msgType,
		Delivered: delivered,
		Dropped:   dropped,
	})
}

// GetMessageHistory returns all recorded messages
func (t *DeterministicTransport) GetMessageHistory() []MessageRecord {
	t.msgMu.Lock()
	defer t.msgMu.Unlock()
	result := make([]MessageRecord, len(t.messages))
	copy(result, t.messages)
	return result
}

// RequestVote implements Transport interface
func (t *DeterministicTransport) RequestVote(target string, args *raft.RequestVoteArgs) (*raft.RequestVoteReply, error) {
	t.mu.RLock()
	node, ok := t.nodes[target]
	shouldDrop := t.shouldDrop(args.CandidateID, target)
	t.mu.RUnlock()

	if !ok {
		t.recordMessage(args.CandidateID, target, "RequestVote", false, false)
		return nil, raft.ErrNodeNotFound
	}

	if shouldDrop {
		t.recordMessage(args.CandidateID, target, "RequestVote", false, true)
		return nil, raft.ErrTimeout
	}

	t.recordMessage(args.CandidateID, target, "RequestVote", true, false)
	reply := node.HandleRequestVote(args)
	return reply, nil
}

// AppendEntries implements Transport interface
func (t *DeterministicTransport) AppendEntries(target string, args *raft.AppendEntriesArgs) (*raft.AppendEntriesReply, error) {
	t.mu.RLock()
	node, ok := t.nodes[target]
	shouldDrop := t.shouldDrop(args.LeaderID, target)
	t.mu.RUnlock()

	if !ok {
		t.recordMessage(args.LeaderID, target, "AppendEntries", false, false)
		return nil, raft.ErrNodeNotFound
	}

	if shouldDrop {
		t.recordMessage(args.LeaderID, target, "AppendEntries", false, true)
		return nil, raft.ErrTimeout
	}

	t.recordMessage(args.LeaderID, target, "AppendEntries", true, false)
	reply := node.HandleAppendEntries(args)
	return reply, nil
}

// InstallSnapshot implements Transport interface
func (t *DeterministicTransport) InstallSnapshot(target string, args *raft.InstallSnapshotArgs) (*raft.InstallSnapshotReply, error) {
	t.mu.RLock()
	node, ok := t.nodes[target]
	shouldDrop := t.shouldDrop(args.LeaderID, target)
	t.mu.RUnlock()

	if !ok {
		t.recordMessage(args.LeaderID, target, "InstallSnapshot", false, false)
		return nil, raft.ErrNodeNotFound
	}

	if shouldDrop {
		t.recordMessage(args.LeaderID, target, "InstallSnapshot", false, true)
		return nil, raft.ErrTimeout
	}

	t.recordMessage(args.LeaderID, target, "InstallSnapshot", true, false)
	reply := node.HandleInstallSnapshot(args)
	return reply, nil
}

// Simulator provides a deterministic simulation environment
type Simulator struct {
	Transport *DeterministicTransport
	Nodes     []*raft.Node
	Stores    []*SimulatedStore
	clock     *DeterministicClock
	rng       *rand.Rand
	seed      int64
}

// SimulatedStore wraps a KV store with operation tracking
type SimulatedStore struct {
	mu   sync.RWMutex
	data map[string]string
	ops  []StoreOperation
}

type StoreOperation struct {
	Time  int64
	Op    string
	Key   string
	Value string
}

func NewSimulatedStore() *SimulatedStore {
	return &SimulatedStore{
		data: make(map[string]string),
		ops:  make([]StoreOperation, 0),
	}
}

func (s *SimulatedStore) Apply(cmd raft.Command) string {
	s.mu.Lock()
	defer s.mu.Unlock()

	switch cmd.Type {
	case raft.CommandSet:
		s.data[cmd.Key] = cmd.Value
		s.ops = append(s.ops, StoreOperation{
			Time:  time.Now().UnixNano(),
			Op:    "SET",
			Key:   cmd.Key,
			Value: cmd.Value,
		})
		return cmd.Value
	case raft.CommandDelete:
		delete(s.data, cmd.Key)
		s.ops = append(s.ops, StoreOperation{
			Time: time.Now().UnixNano(),
			Op:   "DELETE",
			Key:  cmd.Key,
		})
		return ""
	default:
		return ""
	}
}

func (s *SimulatedStore) Get(key string) (string, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	v, ok := s.data[key]
	return v, ok
}

func (s *SimulatedStore) GetSnapshot() map[string]string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make(map[string]string)
	for k, v := range s.data {
		result[k] = v
	}
	return result
}

func (s *SimulatedStore) RestoreSnapshot(data map[string]string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data = make(map[string]string)
	for k, v := range data {
		s.data[k] = v
	}
}

func (s *SimulatedStore) GetOperations() []StoreOperation {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]StoreOperation, len(s.ops))
	copy(result, s.ops)
	return result
}

// NewSimulator creates a new deterministic simulator
func NewSimulator(size int, seed int64) (*Simulator, error) {
	transport := NewDeterministicTransport(seed)
	rng := rand.New(rand.NewSource(seed))

	nodeIDs := make([]string, size)
	for i := 0; i < size; i++ {
		nodeIDs[i] = fmt.Sprintf("sim-node-%d", i)
	}

	sim := &Simulator{
		Transport: transport,
		Nodes:     make([]*raft.Node, size),
		Stores:    make([]*SimulatedStore, size),
		clock:     transport.GetClock(),
		rng:       rng,
		seed:      seed,
	}

	for i := 0; i < size; i++ {
		peers := make([]string, 0, size-1)
		for j := 0; j < size; j++ {
			if i != j {
				peers = append(peers, nodeIDs[j])
			}
		}

		store := NewSimulatedStore()
		sim.Stores[i] = store

		config := raft.NodeConfig{
			ID:                 nodeIDs[i],
			Peers:              peers,
			ElectionTimeoutMin: 150 * time.Millisecond,
			ElectionTimeoutMax: 300 * time.Millisecond,
			HeartbeatInterval:  50 * time.Millisecond,
			SnapshotThreshold:  1000,
		}

		node := raft.NewNode(config, transport, nil, store)
		sim.Nodes[i] = node
		transport.Register(nodeIDs[i], node)
	}

	return sim, nil
}

// Start starts all nodes
func (s *Simulator) Start() error {
	for _, node := range s.Nodes {
		if err := node.Start(); err != nil {
			return err
		}
	}
	return nil
}

// Stop stops all nodes
func (s *Simulator) Stop() {
	for _, node := range s.Nodes {
		node.Stop()
	}
}

// AdvanceTime advances the simulation clock
func (s *Simulator) AdvanceTime(d time.Duration) {
	s.clock.Advance(d)
}

// GetLeader returns the current leader
func (s *Simulator) GetLeader() *raft.Node {
	for _, node := range s.Nodes {
		if node.IsLeader() {
			return node
		}
	}
	return nil
}

// WaitForLeader waits for a leader with simulated time
func (s *Simulator) WaitForLeader(maxIterations int) *raft.Node {
	for i := 0; i < maxIterations; i++ {
		if leader := s.GetLeader(); leader != nil {
			return leader
		}
		time.Sleep(50 * time.Millisecond)
	}
	return nil
}

// InjectPartition partitions a node
func (s *Simulator) InjectPartition(nodeIdx int) {
	if nodeIdx >= 0 && nodeIdx < len(s.Nodes) {
		s.Transport.Partition(s.Nodes[nodeIdx].GetID())
	}
}

// HealPartition heals partition for a node
func (s *Simulator) HealPartition(nodeIdx int) {
	if nodeIdx >= 0 && nodeIdx < len(s.Nodes) {
		s.Transport.Heal(s.Nodes[nodeIdx].GetID())
	}
}

// HealAll heals all partitions
func (s *Simulator) HealAll() {
	s.Transport.HealAll()
}

// RandomPartition creates a random partition scenario
func (s *Simulator) RandomPartition() int {
	idx := s.rng.Intn(len(s.Nodes))
	s.InjectPartition(idx)
	return idx
}

// GetSeed returns the simulation seed for reproducibility
func (s *Simulator) GetSeed() int64 {
	return s.seed
}