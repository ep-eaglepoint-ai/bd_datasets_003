package main

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"sync"
	"time"
)

// Role represents the state of a node
type Role string

const (
	Follower  Role = "follower"
	Candidate Role = "candidate"
	Leader    Role = "leader"
)

// Event types for internal signaling
type EventType int

const (
	EventHeartbeat EventType = iota
	EventVoteGranted
)

// Node represents a single node in the cluster
type Node struct {
	ID          int       `json:"id"`
	Role        Role      `json:"role"`
	CurrentTerm int       `json:"currentTerm"`
	IsAlive     bool      `json:"isAlive"`
	
	// Internal state
	votedFor       int
	votesReceived  int
	eventCh        chan EventType
	
	mu sync.Mutex
}

// Cluster manages the set of nodes
type Cluster struct {
	Nodes []*Node
	mu    sync.RWMutex
}

var cluster *Cluster

// Configuration
const (
	NumNodes             = 5
	HeartbeatInterval    = 100 * time.Millisecond
	MinElectionTimeout   = 1500 * time.Millisecond
	MaxElectionTimeout   = 3000 * time.Millisecond
)

func main() {
	rand.Seed(time.Now().UnixNano())

	cluster = &Cluster{
		Nodes: make([]*Node, NumNodes),
	}

	for i := 0; i < NumNodes; i++ {
		cluster.Nodes[i] = newNode(i + 1)
		go cluster.Nodes[i].run()
	}

	http.HandleFunc("/state", handleState)
	http.HandleFunc("/kill-leader", handleKillLeader)
	
	// Enable CORS
	corsHandler := func(h http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			if r.Method == "OPTIONS" {
				return
			}
			h.ServeHTTP(w, r)
		})
	}

	fmt.Println("Server starting on :8080")
	if err := http.ListenAndServe(":8080", corsHandler(http.DefaultServeMux)); err != nil {
		panic(err)
	}
}

func newNode(id int) *Node {
	n := &Node{
		ID:          id,
		Role:        Follower,
		CurrentTerm: 0,
		IsAlive:     true,
		votedFor:    -1,
		eventCh:     make(chan EventType, 10),
	}
	return n
}

func (n *Node) run() {
	// Create election timer
	electionTimer := time.NewTimer(n.randomTimeout())
	// Create heartbeat ticker (but only used if leader)
	heartbeatTicker := time.NewTicker(HeartbeatInterval)
	defer heartbeatTicker.Stop()
	
	for {
		// If dead, do nothing but wait
		if !n.safeIsAlive() {
			time.Sleep(100 * time.Millisecond)
			// Drain channels to prevent blocking senders?
			// Actually sender uses non-blocking send or we just don't care if full
			continue
		}

		select {
		case <-electionTimer.C:
			// Election timeout!
			n.mu.Lock()
			if n.IsAlive && n.Role != Leader {
				n.startElection()
				// Reset timer after starting election
				electionTimer.Stop()
				electionTimer.Reset(n.randomTimeout())
			} else {
				// Just reset if we are leader or something
				electionTimer.Stop()
				electionTimer.Reset(n.randomTimeout())
			}
			n.mu.Unlock()

		case <-heartbeatTicker.C:
			n.mu.Lock()
			if n.IsAlive && n.Role == Leader {
				n.sendHeartbeats()
			}
			n.mu.Unlock()

		case <-n.eventCh:
			// Received external event (Heartbeat or VoteGranted), reset election timer
			if !electionTimer.Stop() {
				// Drain channel if not empty, but default pattern is select
				select {
				case <-electionTimer.C:
				default:
				}
			}
			electionTimer.Reset(n.randomTimeout())
		}
	}
}

func (n *Node) randomTimeout() time.Duration {
	return MinElectionTimeout + time.Duration(rand.Int63n(int64(MaxElectionTimeout-MinElectionTimeout)))
}

func (n *Node) safeIsAlive() bool {
	n.mu.Lock()
	defer n.mu.Unlock()
	return n.IsAlive
}

func (n *Node) startElection() {
	n.Role = Candidate
	n.CurrentTerm++
	n.votedFor = n.ID
	n.votesReceived = 1 // Vote for self
	// fmt.Printf("Node %d starting election for term %d\n", n.ID, n.CurrentTerm) // Debug

	// Request votes from others
	go func() {
		cluster.mu.RLock()
		peers := make([]*Node, len(cluster.Nodes))
		copy(peers, cluster.Nodes)
		cluster.mu.RUnlock()

		for _, peer := range peers {
			if peer.ID == n.ID {
				continue
			}
			go n.requestVote(peer)
		}
	}()
}

func (n *Node) requestVote(peer *Node) {
	n.mu.Lock()
	term := n.CurrentTerm
	candidateID := n.ID
	n.mu.Unlock()

	// Peer logic
	granted := peer.handleRequestVote(term, candidateID)

	if granted {
		n.mu.Lock()
		defer n.mu.Unlock()
		if n.Role != Candidate || n.CurrentTerm != term {
			return
		}
		n.votesReceived++
		// Majority check
		if n.votesReceived > NumNodes/2 {
			n.becomeLeader()
		}
	}
}

func (peer *Node) handleRequestVote(term int, candidateID int) bool {
	peer.mu.Lock()
	defer peer.mu.Unlock()

	if !peer.IsAlive {
		return false
	}

	if term > peer.CurrentTerm {
		peer.CurrentTerm = term
		peer.Role = Follower
		peer.votedFor = -1
		// Notify loop to reset timer
		peer.notifyEvent()
	}

	if term == peer.CurrentTerm && (peer.votedFor == -1 || peer.votedFor == candidateID) {
		peer.votedFor = candidateID
		peer.notifyEvent() // Granting vote resets timer
		return true
	}
	return false
}

func (n *Node) becomeLeader() {
	if n.Role == Leader {
		return
	}
	n.Role = Leader
	// fmt.Printf("Node %d became LEADER for term %d\n", n.ID, n.CurrentTerm) // Debug
	
	// Immediately send heartbeats
	n.sendHeartbeats()
}

func (n *Node) sendHeartbeats() {
	// Send to all
	cluster.mu.RLock()
	peers := make([]*Node, len(cluster.Nodes))
	copy(peers, cluster.Nodes)
	cluster.mu.RUnlock()

	for _, peer := range peers {
		if peer.ID == n.ID {
			continue
		}
		go n.sendAppendEntries(peer)
	}
}

func (n *Node) sendAppendEntries(peer *Node) {
	n.mu.Lock()
	term := n.CurrentTerm
	leaderID := n.ID
	n.mu.Unlock()

	// Peer logic
	peer.handleAppendEntries(term, leaderID)
}

func (peer *Node) handleAppendEntries(term int, leaderID int) {
	peer.mu.Lock()
	defer peer.mu.Unlock()

	if !peer.IsAlive {
		return
	}

	if term >= peer.CurrentTerm {
		if term > peer.CurrentTerm {
			peer.Role = Follower
			peer.votedFor = -1
		} else if peer.Role == Candidate {
			peer.Role = Follower
		}
		peer.CurrentTerm = term
		peer.notifyEvent() // Heartbeat received
	}
}

func (n *Node) notifyEvent() {
	select {
	case n.eventCh <- EventHeartbeat:
	default:
	}
}

// API Handlers

type StateResponse struct {
	Nodes []*NodeStruct `json:"nodes"`
	Term  int           `json:"term"`
}

type NodeStruct struct {
	ID          int    `json:"id"`
	Role        string `json:"role"`
	CurrentTerm int    `json:"currentTerm"`
	IsAlive     bool   `json:"isAlive"`
	VotedFor    int    `json:"votedFor"`
}

func handleState(w http.ResponseWriter, r *http.Request) {
	cluster.mu.RLock()
	defer cluster.mu.RUnlock()

	var nodes []*NodeStruct
	maxTerm := 0

	for _, n := range cluster.Nodes {
		n.mu.Lock()
		nodeData := &NodeStruct{
			ID:          n.ID,
			Role:        string(n.Role),
			CurrentTerm: n.CurrentTerm,
			IsAlive:     n.IsAlive,
			VotedFor:    n.votedFor,
		}
		if n.CurrentTerm > maxTerm {
			maxTerm = n.CurrentTerm
		}
		n.mu.Unlock()
		nodes = append(nodes, nodeData)
	}

	resp := StateResponse{
		Nodes: nodes,
		Term:  maxTerm,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func handleKillLeader(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cluster.mu.RLock()
	defer cluster.mu.RUnlock()

	found := false
	for _, n := range cluster.Nodes {
		n.mu.Lock()
		if n.Role == Leader && n.IsAlive {
			n.IsAlive = false
			n.Role = Follower // Leader dies
			found = true
			fmt.Printf("Killing leader node %d\n", n.ID)
		}
		n.mu.Unlock()
		if found {
			break
		}
	}
	// If no leader found, maybe we should kill the one with highest ID or role Candidate, 
	// but requirement assumes there is a leader usually.
	
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
