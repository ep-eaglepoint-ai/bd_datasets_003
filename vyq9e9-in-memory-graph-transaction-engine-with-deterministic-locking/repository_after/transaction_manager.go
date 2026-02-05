package repository_after

import (
	"errors"
	"sort"
	"sync"
)

// Node represents an account/wallet with a balance and its own RWMutex for fine-grained locking.
type Node struct {
	ID      string
	Balance int64
	mu      sync.RWMutex
}

// TransactionManager holds the global graph state (nodes).
type TransactionManager struct {
	mu    sync.RWMutex
	nodes map[string]*Node
}

// Transaction holds a reference to the manager and a local write set (buffer). No global state is modified until Commit.
type Transaction struct {
	tm       *TransactionManager
	writeSet map[string]int64 // nodeID -> delta to apply
}

// NewTransactionManager returns a new TransactionManager.
func NewTransactionManager() *TransactionManager {
	return &TransactionManager{
		nodes: make(map[string]*Node),
	}
}

// getOrCreateNode returns the node for id, creating it with balance 0 if it does not exist. Caller must hold tm.mu (read or write).
func (tm *TransactionManager) getOrCreateNode(id string) *Node {
	if n, ok := tm.nodes[id]; ok {
		return n
	}
	n := &Node{ID: id, Balance: 0}
	tm.nodes[id] = n
	return n
}

// Begin starts a new transaction. Returns a Transaction that buffers writes in a local write set.
func (tm *TransactionManager) Begin() *Transaction {
	return &Transaction{
		tm:       tm,
		writeSet: make(map[string]int64),
	}
}

// Read returns the current balance of the node (from global state, under RLock). For consistent read within transaction, use the effective balance (current + writeSet) when validating at commit.
func (tx *Transaction) Read(nodeID string) (int64, error) {
	tx.tm.mu.RLock()
	node := tx.tm.getOrCreateNode(nodeID)
	tx.tm.mu.RUnlock()

	node.mu.RLock()
	balance := node.Balance
	node.mu.RUnlock()

	// Apply any buffered write for this node so read sees uncommitted intent
	if delta, ok := tx.writeSet[nodeID]; ok {
		balance += delta
	}
	return balance, nil
}

// Write records a delta in the local write set. It must NOT modify global node state.
func (tx *Transaction) Write(nodeID string, delta int64) error {
	tx.tm.mu.RLock()
	_ = tx.tm.getOrCreateNode(nodeID)
	tx.tm.mu.RUnlock()

	tx.writeSet[nodeID] += delta
	return nil
}

// Commit applies the write set atomically: acquires locks in sorted order, validates invariants, then applies writes. Lock release is done via defer to guarantee cleanup on panic.
func (tx *Transaction) Commit() error {
	if len(tx.writeSet) == 0 {
		return nil
	}

	// 1. Collect node IDs from write set
	ids := make([]string, 0, len(tx.writeSet))
	for id := range tx.writeSet {
		ids = append(ids, id)
	}
	// 2. Sort node IDs for deterministic lock order (deadlock prevention)
	sort.Strings(ids)

	// 3. Resolve node pointers under manager read lock (so map is not modified during commit)
	tx.tm.mu.RLock()
	nodes := make([]*Node, len(ids))
	for i, id := range ids {
		nodes[i] = tx.tm.getOrCreateNode(id)
	}
	tx.tm.mu.RUnlock()

	// 4. Acquire all locks in sorted order; release via defer
	for _, node := range nodes {
		node.mu.Lock()
		defer node.mu.Unlock()
	}

	// Map nodeID -> *Node for validation and apply (we already hold all their locks)
	nodeByID := make(map[string]*Node, len(ids))
	for i, id := range ids {
		nodeByID[id] = nodes[i]
	}

	// 5. Validate invariants (e.g. balance >= 0) before applying anything
	for id, delta := range tx.writeSet {
		node := nodeByID[id]
		if node == nil {
			return errors.New("node not found")
		}
		newBalance := node.Balance + delta
		if newBalance < 0 {
			return errors.New("balance would be negative")
		}
	}

	// 6. Apply writes to global state only after all locks held and validation passed
	for id, delta := range tx.writeSet {
		nodeByID[id].Balance += delta
	}

	return nil
}
