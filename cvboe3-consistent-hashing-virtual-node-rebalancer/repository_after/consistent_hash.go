package consistenthash

import (
	"errors"
	"sync"
	"sync/atomic"
)

// Engine manages the consistent hash ring with support for atomic updates and rebalancing.
type Engine struct {
	ringVal atomic.Pointer[Ring]

	mu    sync.Mutex
	nodes map[Node]bool

	config Config
}

// Config holds configuration for the Engine.
type Config struct {
	ReplicationFactor int
	Hasher            Hasher
}

// NewEngine creates a new consistent hashing engine.
func NewEngine(cfg Config) *Engine {
	if cfg.ReplicationFactor <= 0 {
		cfg.ReplicationFactor = 20 // Default value
	}
	if cfg.Hasher == nil {
		cfg.Hasher = CRC32Hasher{}
	}

	e := &Engine{
		nodes:  make(map[Node]bool),
		config: cfg,
	}

	// Initialize with an empty ring
	emptyRing := NewRing(nil, cfg.ReplicationFactor, cfg.Hasher)
	e.ringVal.Store(emptyRing)

	return e
}

// GetNode returns the node responsible for the given key.
// This operation is wait-free and thread-safe.
func (e *Engine) GetNode(key string) Node {
	ring := e.ringVal.Load()
	if ring == nil {
		return ""
	}
	return ring.GetNode(key)
}

// AddNode adds a physical node to the ring and returns the migration plan.
func (e *Engine) AddNode(node string) (RebalancePlan, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	n := Node(node)
	if e.nodes[n] {
		return nil, errors.New("node already exists")
	}

	// Create new node list
	newNodes := make([]Node, 0, len(e.nodes)+1)
	for existing := range e.nodes {
		newNodes = append(newNodes, existing)
	}
	newNodes = append(newNodes, n)

	// Build new ring
	oldRing := e.ringVal.Load()
	newRing := NewRing(newNodes, e.config.ReplicationFactor, e.config.Hasher)

	// Calculate migrations
	plan := calculateMigrationsForAdd(oldRing, newRing)

	// Update state
	e.nodes[n] = true
	e.ringVal.Store(newRing)

	return plan, nil
}

// RemoveNode removes a physical node from the ring and returns the migration plan.
func (e *Engine) RemoveNode(node string) (RebalancePlan, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	n := Node(node)
	if !e.nodes[n] {
		return nil, errors.New("node does not exist")
	}

	// Create new node list
	newNodes := make([]Node, 0, len(e.nodes)-1)
	for existing := range e.nodes {
		if existing != n {
			newNodes = append(newNodes, existing)
		}
	}

	// Build new ring
	oldRing := e.ringVal.Load()
	newRing := NewRing(newNodes, e.config.ReplicationFactor, e.config.Hasher)

	// Calculate migrations
	plan := calculateMigrationsForRemove(oldRing, newRing)

	// Update state
	delete(e.nodes, n)
	e.ringVal.Store(newRing)

	return plan, nil
}
