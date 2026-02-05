package consistenthash

import (
	"sort"
	"strconv"
)

// Node represents a physical node in the cluster.
type Node string

// VNode represents a virtual node on the hash ring.
type VNode struct {
	HashID uint32
	Node   Node
}

// Ring represents an immutable snapshot of the consistent hash ring.
type Ring struct {
	vnodes []VNode
	hasher Hasher
}

// NewRing creates a new immutable Ring from a list of nodes.
func NewRing(nodes []Node, replicationFactor int, hasher Hasher) *Ring {
	if hasher == nil {
		hasher = CRC32Hasher{}
	}

	totalVNodes := len(nodes) * replicationFactor
	vnodes := make([]VNode, 0, totalVNodes)

	for _, node := range nodes {
		for i := 0; i < replicationFactor; i++ {
			// Create a virtual node key: "NodeID#Index"
			vKey := string(node) + "#" + strconv.Itoa(i)
			hash := hasher.Hash([]byte(vKey))
			vnodes = append(vnodes, VNode{
				HashID: hash,
				Node:   node,
			})
		}
	}

	// Sort vnodes by HashID to enable binary search (O(log N))
	sort.Slice(vnodes, func(i, j int) bool {
		return vnodes[i].HashID < vnodes[j].HashID
	})

	return &Ring{
		vnodes: vnodes,
		hasher: hasher,
	}
}

// GetNode returns the physical node responsible for the given key.
// It performs a binary search O(log N).
func (r *Ring) GetNode(key string) Node {
	if len(r.vnodes) == 0 {
		return ""
	}

	hash := r.hasher.Hash([]byte(key))

	// Binary search for the first vnode with HashID >= hash
	idx := sort.Search(len(r.vnodes), func(i int) bool {
		return r.vnodes[i].HashID >= hash
	})

	// If we went past the end, wrap around to the first vnode
	if idx == len(r.vnodes) {
		idx = 0
	}

	return r.vnodes[idx].Node
}

// NodeCount returns the number of physical nodes (calculated for convenience, though this is cheap).
func (r *Ring) Len() int {
	return len(r.vnodes)
}

// getNodeByHash finds the node responsible for a given raw hash value.
func (r *Ring) getNodeByHash(hash uint32) Node {
	if len(r.vnodes) == 0 {
		return ""
	}

	idx := sort.Search(len(r.vnodes), func(i int) bool {
		return r.vnodes[i].HashID >= hash
	})

	if idx == len(r.vnodes) {
		idx = 0
	}

	return r.vnodes[idx].Node
}
