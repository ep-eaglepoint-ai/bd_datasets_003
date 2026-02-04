package flowguard

import (
	"hash/fnv"
	"math"
	"sync"
	"time"
)

// Global constants
const (
	ShardCount = 256
)

// UserBucket represents the state of a single user's leaky bucket
type UserBucket struct {
	Level       float64
	LastUpdated time.Time
}

// Shard guards a partition of the user space
type Shard struct {
	sync.RWMutex
	Buckets map[string]*UserBucket
}

// FlowGuard manages the sharded rate limiter
type FlowGuard struct {
	Shards []*Shard
}

// NewFlowGuard creates a new rate limiter instance
func NewFlowGuard() *FlowGuard {
	fg := &FlowGuard{
		Shards: make([]*Shard, ShardCount),
	}
	for i := 0; i < ShardCount; i++ {
		fg.Shards[i] = &Shard{
			Buckets: make(map[string]*UserBucket),
		}
	}
	return fg
}

// getShardIndex computes the shard index for a given userID using FNV-1a
func (fg *FlowGuard) getShardIndex(userID string) uint32 {
	h := fnv.New32a()
	h.Write([]byte(userID))
	return h.Sum32() % ShardCount
}

// TryPour attempts to pour 'volumeML' for 'userID'.
// Returns true if allowed, false if rejected.
// capacity: max bucket size in ML
// drainRate: decay rate in ML per second
func (fg *FlowGuard) TryPour(userID string, volumeML float64, capacity float64, drainRate float64) bool {
	shardIdx := fg.getShardIndex(userID)
	shard := fg.Shards[shardIdx]

	shard.Lock()
	defer shard.Unlock()

	now := time.Now()
	bucket, exists := shard.Buckets[userID]

	var currentLevel float64

	if exists {
		// Calculate leaks over elapsed time
		elapsed := now.Sub(bucket.LastUpdated).Seconds()
		leaked := elapsed * drainRate
		currentLevel = math.Max(0, bucket.Level-leaked)
		
		// Lazy Eviction Logic (Requirement 4):
		// strictly speaking, we could delete here if currentLevel == 0 && volumeML == 0?
		// But usually we are here to ADD volume. 
		// If we wanted to purely "clean up" we'd delete.
		// However, we are about to check if we can add volume.
		// Let's implement active deletion on access if it was fully drained
		// AND we fail the check? No, if we serve the request we must store new state.
		// Re-reading: "detect and delete user records whose bucket levels have decayed to zero"
		// If currentLevel is 0, it means the bucket is effectively empty.
		// If we succeed adding volume, we update it.
		// If we DO NOT succeed (request > capacity) and level is 0, we can delete it? 
		// (Request > Cap on an empty bucket is an immediate fail).
		// But typically, if level is 0, it's a "reset".
		// Let's continue with the pour logic.
	} else {
		currentLevel = 0
	}

	if currentLevel+volumeML <= capacity {
		// Allowed
		newLevel := currentLevel + volumeML
		
		if exists {
			bucket.Level = newLevel
			bucket.LastUpdated = now
		} else {
			shard.Buckets[userID] = &UserBucket{
				Level:       newLevel,
				LastUpdated: now,
			}
		}
		return true
	}

	// Rejected
	
	// Lazy Eviction Opportunity:
	// If the bucket exists AND it had decayed to zero (currentLevel == 0)
	// AND we are rejecting this new large request (so we aren't updating the bucket state)
	// We can delete the stale record to free memory.
	// Since we are holding the Lock, this is safe `inline` eviction.
	if exists && currentLevel == 0 {
		delete(shard.Buckets, userID)
	}

	return false
}

// Debug API for testing, usually not used in prod
func (fg *FlowGuard) GetBucketState(userID string) (float64, bool) {
	shardIdx := fg.getShardIndex(userID)
	shard := fg.Shards[shardIdx]

	shard.RLock()
	defer shard.RUnlock()

	if bucket, ok := shard.Buckets[userID]; ok {
		return bucket.Level, true
	}
	return 0, false
}
