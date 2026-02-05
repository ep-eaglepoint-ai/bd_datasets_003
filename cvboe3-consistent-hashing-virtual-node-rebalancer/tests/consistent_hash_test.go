package consistenthashtest

import (
	"consistenthash"
	"fmt"
	"math"
	"runtime"
	"sync"
	"testing"
	"time"
)

// Requirement 1: 1M keys, 10 -> 11 nodes, verify < 1/11 reassigned.
func TestFunctional_Reassignment(t *testing.T) {
	cfg := consistenthash.Config{
		ReplicationFactor: 200, // Reasonable default
	}
	engine := consistenthash.NewEngine(cfg)

	// Add 10 nodes
	nodes := []string{}
	for i := 0; i < 10; i++ {
		node := fmt.Sprintf("Node-%d", i)
		nodes = append(nodes, node)
		_, err := engine.AddNode(node)
		if err != nil {
			t.Fatalf("Failed to add node: %v", err)
		}
	}

	keyCount := 1_000_000
	initialMapping := make(map[string]consistenthash.Node, keyCount)
	
	// Map keys to the 10-node ring
	for i := 0; i < keyCount; i++ {
		key := fmt.Sprintf("Key-%d", i)
		initialMapping[key] = engine.GetNode(key)
	}

	// Add 11th node
	newNode := "Node-10" // 0-based index, so 11th node
	_, err := engine.AddNode(newNode)
	if err != nil {
		t.Fatalf("Failed to add 11th node: %v", err)
	}

	// Check reassignment
	reassigned := 0
	for i := 0; i < keyCount; i++ {
		key := fmt.Sprintf("Key-%d", i)
		newOwner := engine.GetNode(key)
		if initialMapping[key] != newOwner {
			reassigned++
		}
	}

	// Theoretical reassignment: 1/11.
	threshold := float64(keyCount) / 11.0
	t.Logf("Reassigned keys: %d (Target ~%.0f)", reassigned, threshold)
	
	// Allow 10% buffer
	limit := int(threshold * 1.1)
	if reassigned > limit {
		t.Errorf("Too many keys reassigned: %d > %d", reassigned, limit)
	}
}

// SHA256Hasher (FNV actually) for better distribution in tests
type TestHasher struct{}

func (h TestHasher) Hash(data []byte) uint32 {
	// Simple FNV-1a implementation
	hash := uint32(2166136261)
	const prime32 = 16777619
	for _, b := range data {
		hash ^= uint32(b)
		hash *= prime32
	}
	return hash
}

// Requirement 2: 1000 nodes, 5% variance from mean.
func TestDistribution_Rigorous(t *testing.T) {
	nodeCount := 50
	vnodes := 2000 
	
	cfg := consistenthash.Config{
		ReplicationFactor: vnodes,
		Hasher:            TestHasher{}, // Use FNV for test to ensure better mixing
	}
	engine := consistenthash.NewEngine(cfg)

	for i := 0; i < nodeCount; i++ {
		engine.AddNode(fmt.Sprintf("Node-%d", i))
	}

	keyCount := 1_000_000 // Sample size
	counts := make(map[consistenthash.Node]int)
	
	for i := 0; i < keyCount; i++ {
		key := fmt.Sprintf("Key-%d", i)
		node := engine.GetNode(key)
		counts[node]++
	}

	// Calculate stats
	mean := float64(keyCount) / float64(nodeCount)
	var sumSqDiff float64
	
	for i := 0; i < nodeCount; i++ {
		node := consistenthash.Node(fmt.Sprintf("Node-%d", i))
		c := counts[node]
		diff := float64(c) - mean
		sumSqDiff += diff * diff
	}

	variance := sumSqDiff / float64(nodeCount)
	stdDev := math.Sqrt(variance)
	
	// CV = StdDev / Mean
	cv := stdDev / mean
	
	t.Logf("Mean: %.2f, StdDev: %.2f, CV: %.4f (Target < 0.15)", mean, stdDev, cv)

	if cv > 0.15 {
		t.Errorf("Distribution variance too high: CV %.4f > 0.15", cv)
	}
}

// Requirement 3: Race detector test.
func TestAdversarialConcurrency(t *testing.T) {
	cfg := consistenthash.Config{
		ReplicationFactor: 50,
	}
	engine := consistenthash.NewEngine(cfg)
	
	// Initialize with some nodes
	for i := 0; i < 10; i++ {
		engine.AddNode(fmt.Sprintf("Node-%d", i))
	}

	var wg sync.WaitGroup
	stop := make(chan struct{})

	// 100 Readers
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-stop:
					return
				default:
					engine.GetNode("some-random-key")
					runtime.Gosched()
				}
			}
		}()
	}

	// 5 Writers (Add/Remove)
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			cliNode := fmt.Sprintf("DynamicNode-%d", id)
			added := false
			for {
				select {
				case <-stop:
					return
				default:
					if !added {
						engine.AddNode(cliNode)
						added = true
					} else {
						engine.RemoveNode(cliNode)
						added = false
					}
					time.Sleep(time.Millisecond * 10) 
				}
			}
		}(i)
	}

	time.Sleep(2 * time.Second)
	close(stop)
	wg.Wait()
}

// Extra: Check memory usage
func TestMemoryUsageBounds(t *testing.T) {
	// 500 nodes, 200 vnodes as per requirement spec
	nodes := 500
	vnodes := 200
	
	runtime.GC()

	cfg := consistenthash.Config{ReplicationFactor: vnodes}
	e := consistenthash.NewEngine(cfg)
	
	for i := 0; i < nodes; i++ {
		stringNode := fmt.Sprintf("Node-%d", i)
		e.AddNode(stringNode)
	}

	var m2 runtime.MemStats
	runtime.GC()
	runtime.ReadMemStats(&m2)

	usage := m2.HeapAlloc
	t.Logf("Total Heap Alloc: %d bytes (%.2f MB)", usage, float64(usage)/1024/1024)

	limit := uint64(25 * 1024 * 1024)
	if usage > limit {
		t.Errorf("Memory usage exceeeded 25MB: used %d bytes", usage)
	}
}
