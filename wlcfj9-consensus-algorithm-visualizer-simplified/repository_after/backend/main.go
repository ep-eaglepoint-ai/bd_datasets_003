package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"sync"
	"time"
)

type State string

const (
	Follower  State = "follower"
	Candidate State = "candidate"
	Leader    State = "leader"
)

type Node struct {
	ID          int       `json:"id"`
	Role        State     `json:"role"`
	CurrentTerm int       `json:"currentTerm"`
	VotedFor    int       `json:"votedFor"`
	IsAlive     bool      `json:"isAlive"`
	LastUpdate  time.Time `json:"lastUpdate"`

	electionTimeout time.Duration
	heartbeatTicker *time.Timer
	electionTicker  *time.Timer
}

type Cluster struct {
	Nodes []*Node    `json:"nodes"`
	mu    sync.Mutex
}

func NewCluster(nodeCount int) *Cluster {
	cluster := &Cluster{
		Nodes: make([]*Node, nodeCount),
	}
	for i := 0; i < nodeCount; i++ {
		cluster.Nodes[i] = &Node{
			ID:          i + 1,
			Role:        Follower,
			CurrentTerm: 0,
			VotedFor:    -1,
			IsAlive:     true,
			LastUpdate:  time.Now(),
		}
		cluster.resetElectionTimeout(cluster.Nodes[i])
	}
	return cluster
}

func (c *Cluster) resetElectionTimeout(n *Node) {
	// Randomized election timeout between 1500 and 3000 ms for visibility
	timeout := time.Duration(1500+rand.Intn(1500)) * time.Millisecond
	n.electionTimeout = timeout
	if n.electionTicker != nil {
		n.electionTicker.Stop()
	}
	n.electionTicker = time.AfterFunc(timeout, func() {
		c.startElection(n.ID)
	})
}

func (c *Cluster) startElection(nodeID int) {
	c.mu.Lock()
	n := c.findNode(nodeID)
	if n == nil || !n.IsAlive || n.Role == Leader {
		c.mu.Unlock()
		return
	}

	fmt.Printf("Node %d starting election for term %d\n", n.ID, n.CurrentTerm+1)
	n.Role = Candidate
	n.CurrentTerm++
	n.VotedFor = n.ID
	votes := 1
	term := n.CurrentTerm

	// Simple majority check
	aliveNodes := 0
	for _, node := range c.Nodes {
		if node.IsAlive {
			aliveNodes++
		}
	}
	
	c.mu.Unlock()

	// In a real Raft, we'd request votes. Here we'll simulate it.
	time.Sleep(50 * time.Millisecond) // Simulate network delay

	c.mu.Lock()
	defer c.mu.Unlock()

	// Re-check state after sleep
	n = c.findNode(nodeID)
	if n == nil || !n.IsAlive || n.Role != Candidate || n.CurrentTerm != term {
		return
	}

	// Simulate getting votes from other alive nodes
	for _, other := range c.Nodes {
		if other.ID != n.ID && other.IsAlive && other.CurrentTerm <= term {
			// Grant vote if other hasn't voted in this term
			if other.VotedFor == -1 || other.VotedFor == n.ID {
				votes++
				other.VotedFor = n.ID
				other.CurrentTerm = term
				other.Role = Follower
				c.resetElectionTimeout(other)
			}
		}
	}

	if votes > aliveNodes/2 {
		fmt.Printf("Node %d became leader for term %d\n", n.ID, n.CurrentTerm)
		n.Role = Leader
		if n.electionTicker != nil {
			n.electionTicker.Stop()
		}
		c.sendHeartbeats(n.ID) // Send first heartbeat immediately
	} else {
		n.Role = Follower
		n.VotedFor = -1
		c.resetElectionTimeout(n)
	}
}

func (c *Cluster) startHeartbeats(n *Node) {
	if n.heartbeatTicker != nil {
		n.heartbeatTicker.Stop()
	}
	n.heartbeatTicker = time.AfterFunc(500*time.Millisecond, func() {
		c.sendHeartbeats(n.ID)
	})
}

func (c *Cluster) sendHeartbeats(leaderID int) {
	c.mu.Lock()
	defer c.mu.Unlock()

	leader := c.findNode(leaderID)
	if leader == nil || !leader.IsAlive || leader.Role != Leader {
		return
	}

	for _, n := range c.Nodes {
		if n.ID != leader.ID && n.IsAlive {
			if n.CurrentTerm > leader.CurrentTerm {
				fmt.Printf("Node %d (Leader) stepping down: found higher term %d on Node %d\n", leader.ID, n.CurrentTerm, n.ID)
				leader.Role = Follower
				leader.CurrentTerm = n.CurrentTerm
				leader.VotedFor = -1
				c.resetElectionTimeout(leader)
				return
			}
			if n.CurrentTerm < leader.CurrentTerm {
				n.CurrentTerm = leader.CurrentTerm
				n.VotedFor = -1
			}
			n.Role = Follower
			c.resetElectionTimeout(n)
		}
	}
	leader.LastUpdate = time.Now()
	c.startHeartbeats(leader)
}

func (c *Cluster) findNode(id int) *Node {
	for _, n := range c.Nodes {
		if n.ID == id {
			return n
		}
	}
	return nil
}

func (c *Cluster) GetState() ([]*Node, int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	
	// Find current leader and term
	currentTerm := 0
	for _, n := range c.Nodes {
		if n.CurrentTerm > currentTerm {
			currentTerm = n.CurrentTerm
		}
	}

	// Create a copy of nodes for JSON response
	nodesCopy := make([]*Node, len(c.Nodes))
	for i, n := range c.Nodes {
		nodesCopy[i] = &Node{
			ID:          n.ID,
			Role:        n.Role,
			CurrentTerm: n.CurrentTerm,
			VotedFor:    n.VotedFor,
			IsAlive:     n.IsAlive,
			LastUpdate:  n.LastUpdate,
		}
	}
	return nodesCopy, currentTerm
}

func (c *Cluster) KillLeader() {
	c.mu.Lock()
	defer c.mu.Unlock()

	for _, n := range c.Nodes {
		if n.Role == Leader && n.IsAlive {
			fmt.Printf("Killing leader: Node %d\n", n.ID)
			n.IsAlive = false
			n.Role = Follower // Reset role if it comes back
			if n.heartbeatTicker != nil {
				n.heartbeatTicker.Stop()
			}
			// Automatically "revive" it after some time to simulate recovery
			go func(nodeID int) {
				time.Sleep(5 * time.Second)
				c.mu.Lock()
				defer c.mu.Unlock()
				revived := c.findNode(nodeID)
				if revived != nil {
					fmt.Printf("Reviving Node %d\n", nodeID)
					revived.IsAlive = true
					revived.VotedFor = -1
					c.resetElectionTimeout(revived)
				}
			}(n.ID)
			return
		}
	}
}

func main() {
	rand.Seed(time.Now().UnixNano())
	cluster := NewCluster(5)

	http.HandleFunc("/state", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		nodes, term := cluster.GetState()
		response := map[string]interface{}{
			"nodes": nodes,
			"term":  term,
		}
		json.NewEncoder(w).Encode(response)
	})

	http.HandleFunc("/kill-leader", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		if r.Method == http.MethodPost {
			cluster.KillLeader()
			w.WriteHeader(http.StatusOK)
			fmt.Fprintln(w, "Leader killed")
		} else {
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	})

	fmt.Println("Backend starting on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
