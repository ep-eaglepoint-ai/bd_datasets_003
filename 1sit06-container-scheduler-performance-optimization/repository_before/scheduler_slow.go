package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"time"
)

type Node struct {
	ID              string
	Address         string
	TotalCPU        int
	TotalMemory     int64
	TotalDisk       int64
	UsedCPU         int
	UsedMemory      int64
	UsedDisk        int64
	Status          string
	Containers      []string
	LastHeartbeat   time.Time
}

type Container struct {
	ID              string
	Name            string
	Image           string
	NodeID          string
	RequiredCPU     int
	RequiredMemory  int64
	RequiredDisk    int64
	Status          string
	RestartPolicy   string
	RestartCount    int
	HealthCheckURL  string
	CreatedAt       time.Time
	StartedAt       time.Time
}

type ScheduleRequest struct {
	Name            string `json:"name"`
	Image           string `json:"image"`
	RequiredCPU     int    `json:"required_cpu"`
	RequiredMemory  int64  `json:"required_memory"`
	RequiredDisk    int64  `json:"required_disk"`
	RestartPolicy   string `json:"restart_policy"`
	HealthCheckURL  string `json:"health_check_url"`
}

type ScheduleResponse struct {
	ContainerID     string `json:"container_id"`
	NodeID          string `json:"node_id"`
	Status          string `json:"status"`
	Message         string `json:"message"`
}

type Scheduler struct {
	mu         sync.Mutex
	nodes      map[string]*Node
	containers map[string]*Container
	idCounter  int
}

func NewScheduler() *Scheduler {
	return &Scheduler{
		nodes:      make(map[string]*Node),
		containers: make(map[string]*Container),
		idCounter:  0,
	}
}

func (s *Scheduler) generateID() string {
	s.idCounter++
	return fmt.Sprintf("container-%d", s.idCounter)
}

func (s *Scheduler) ScheduleContainer(req ScheduleRequest) (*ScheduleResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	
	var selectedNode *Node
	for _, node := range s.nodes {
		if node.Status != "ready" {
			continue
		}
		
		availCPU := node.TotalCPU - node.UsedCPU
		availMemory := node.TotalMemory - node.UsedMemory
		availDisk := node.TotalDisk - node.UsedDisk
		
		if availCPU >= req.RequiredCPU && availMemory >= req.RequiredMemory && availDisk >= req.RequiredDisk {
			selectedNode = node
			break
		}
	}
	
	if selectedNode == nil {
		return nil, errors.New("no suitable node found")
	}
	
	container := &Container{
		ID:             s.generateID(),
		Name:           req.Name,
		Image:          req.Image,
		NodeID:         selectedNode.ID,
		RequiredCPU:    req.RequiredCPU,
		RequiredMemory: req.RequiredMemory,
		RequiredDisk:   req.RequiredDisk,
		Status:         "pending",
		RestartPolicy:  req.RestartPolicy,
		HealthCheckURL: req.HealthCheckURL,
		CreatedAt:      time.Now(),
	}
	
	selectedNode.UsedCPU += req.RequiredCPU
	selectedNode.UsedMemory += req.RequiredMemory
	selectedNode.UsedDisk += req.RequiredDisk
	selectedNode.Containers = append(selectedNode.Containers, container.ID)
	
	s.containers[container.ID] = container
	
	go s.startContainer(container.ID)
	
	return &ScheduleResponse{
		ContainerID: container.ID,
		NodeID:      selectedNode.ID,
		Status:      "scheduled",
		Message:     "Container scheduled successfully",
	}, nil
}

func (s *Scheduler) startContainer(containerID string) {
	time.Sleep(100 * time.Millisecond)
	
	s.mu.Lock()
	defer s.mu.Unlock()
	
	container, exists := s.containers[containerID]
	if !exists {
		return
	}
	
	container.Status = "running"
	container.StartedAt = time.Now()
}

func (s *Scheduler) GetContainer(id string) (*Container, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	
	container, exists := s.containers[id]
	if !exists {
		return nil, errors.New("container not found")
	}
	
	containerCopy := *container
	return &containerCopy, nil
}

func (s *Scheduler) StopContainer(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	
	container, exists := s.containers[id]
	if !exists {
		return errors.New("container not found")
	}
	
	if container.Status != "running" {
		return errors.New("container not running")
	}
	
	node := s.nodes[container.NodeID]
	node.UsedCPU -= container.RequiredCPU
	node.UsedMemory -= container.RequiredMemory
	node.UsedDisk -= container.RequiredDisk
	
	for i, cid := range node.Containers {
		if cid == id {
			node.Containers = append(node.Containers[:i], node.Containers[i+1:]...)
			break
		}
	}
	
	container.Status = "stopped"
	
	return nil
}

func (s *Scheduler) RemoveContainer(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	
	container, exists := s.containers[id]
	if !exists {
		return errors.New("container not found")
	}
	
	if container.Status == "running" {
		return errors.New("cannot remove running container")
	}
	
	delete(s.containers, id)
	
	return nil
}

func (s *Scheduler) AddNode(node *Node) {
	s.mu.Lock()
	defer s.mu.Unlock()
	
	s.nodes[node.ID] = node
}

func (s *Scheduler) RemoveNode(nodeID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	
	node, exists := s.nodes[nodeID]
	if !exists {
		return errors.New("node not found")
	}
	
	if len(node.Containers) > 0 {
		return errors.New("node has running containers")
	}
	
	delete(s.nodes, nodeID)
	
	return nil
}

func (s *Scheduler) GetNodes() []*Node {
	s.mu.Lock()
	defer s.mu.Unlock()
	
	nodes := make([]*Node, 0, len(s.nodes))
	for _, node := range s.nodes {
		nodeCopy := *node
		nodeCopy.Containers = make([]string, len(node.Containers))
		copy(nodeCopy.Containers, node.Containers)
		nodes = append(nodes, &nodeCopy)
	}
	
	return nodes
}

func (s *Scheduler) healthCheckLoop() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	
	for range ticker.C {
		s.mu.Lock()
		containerIDs := make([]string, 0, len(s.containers))
		for id, container := range s.containers {
			if container.Status == "running" && container.HealthCheckURL != "" {
				containerIDs = append(containerIDs, id)
			}
		}
		s.mu.Unlock()
		
		for _, id := range containerIDs {
			s.checkContainerHealth(id)
		}
	}
}

func (s *Scheduler) checkContainerHealth(containerID string) {
	s.mu.Lock()
	container, exists := s.containers[containerID]
	if !exists {
		s.mu.Unlock()
		return
	}
	healthURL := container.HealthCheckURL
	s.mu.Unlock()
	
	resp, err := http.Get(healthURL)
	if err != nil || resp.StatusCode != 200 {
		s.handleUnhealthyContainer(containerID)
		return
	}
	if resp != nil && resp.Body != nil {
		resp.Body.Close()
	}
}

func (s *Scheduler) handleUnhealthyContainer(containerID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	
	container, exists := s.containers[containerID]
	if !exists {
		return
	}
	
	container.Status = "failed"
	
	if container.RestartPolicy == "always" || 
	   (container.RestartPolicy == "on-failure" && container.RestartCount < 3) {
		container.RestartCount++
		go s.restartContainer(containerID)
	}
}

func (s *Scheduler) restartContainer(containerID string) {
	time.Sleep(time.Duration(1+s.containers[containerID].RestartCount) * time.Second)
	
	s.mu.Lock()
	defer s.mu.Unlock()
	
	container, exists := s.containers[containerID]
	if !exists {
		return
	}
	
	container.Status = "running"
	container.StartedAt = time.Now()
}

func (s *Scheduler) handleScheduleContainer(w http.ResponseWriter, r *http.Request) {
	var req ScheduleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	
	resp, err := s.ScheduleContainer(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	w.WriteStatus(http.StatusCreated)
	json.NewEncoder(w).Encode(resp)
}

func (s *Scheduler) handleGetContainer(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "missing container id", http.StatusBadRequest)
		return
	}
	
	container, err := s.GetContainer(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(container)
}

func (s *Scheduler) handleGetNodes(w http.ResponseWriter, r *http.Request) {
	nodes := s.GetNodes()
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(nodes)
}

func main() {
	scheduler := NewScheduler()
	
	for i := 1; i <= 10; i++ {
		node := &Node{
			ID:          fmt.Sprintf("node-%d", i),
			Address:     fmt.Sprintf("192.168.1.%d", i),
			TotalCPU:    8,
			TotalMemory: 16 * 1024 * 1024 * 1024,
			TotalDisk:   100 * 1024 * 1024 * 1024,
			Status:      "ready",
			Containers:  []string{},
		}
		scheduler.AddNode(node)
	}
	
	go scheduler.healthCheckLoop()
	
	http.HandleFunc("/api/containers", scheduler.handleScheduleContainer)
	http.HandleFunc("/api/containers/get", scheduler.handleGetContainer)
	http.HandleFunc("/api/nodes", scheduler.handleGetNodes)
	
	fmt.Println("Scheduler running on :8080")
	http.ListenAndServe(":8080", nil)
}
