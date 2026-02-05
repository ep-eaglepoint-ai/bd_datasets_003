package consistenthash

import (
	"fmt"
)

// Migration represents a data migration task.
type Migration struct {
	StartHash  uint32
	EndHash    uint32
	SourceNode Node
	TargetNode Node
}

// RebalancePlan is a list of migrations required to transition between ring states.
type RebalancePlan []Migration

// calculateMigrationsForAdd calculates the migrations when a node is ADDED.
// We iterate the NEW ring (superset).
// For each vnode in the new ring, we check who owned that range in the old ring.
func calculateMigrationsForAdd(oldRing, newRing *Ring) RebalancePlan {
	var migrations RebalancePlan
	if oldRing == nil || len(oldRing.vnodes) == 0 {
		return migrations // No migrations if starting from empty
	}

	for i, vnode := range newRing.vnodes {
		// Calculate range (prevHash, currHash]
		var prevHash uint32
		if i == 0 {
			prevHash = newRing.vnodes[len(newRing.vnodes)-1].HashID
		} else {
			prevHash = newRing.vnodes[i-1].HashID
		}

		currHash := vnode.HashID
		newOwner := vnode.Node

		// In the old ring, who owned 'currHash'?
		// oldRing.GetNode(currHash) returns the owner of the range ending at currHash
		// because if currHash was not a vnode in oldRing, it searched for the next one.
		// Wait, if currHash IS a new vnode, it wasn't in oldRing.
		// oldRing.GetNode(currHash) returns the node responsible for currHash.
		oldOwner := oldRing.GetNode(fmt.Sprintf("%d", currHash))
		// Wait, GetNode takes a string Key and hashes it.
		// We already have the Hash. We need an internal GetNodeByHash.

		// We'll trust the logic helper below.
		oldOwner = oldRing.getNodeByHash(currHash)

		if oldOwner != newOwner {
			migrations = append(migrations, Migration{
				StartHash:  prevHash,
				EndHash:    currHash,
				SourceNode: oldOwner,
				TargetNode: newOwner,
			})
		}
	}
	return migrations
}

// calculateMigrationsForRemove calculates the migrations when a node is REMOVED.
// We iterate the OLD ring (superset).
func calculateMigrationsForRemove(oldRing, newRing *Ring) RebalancePlan {
	var migrations RebalancePlan
	if newRing == nil || len(newRing.vnodes) == 0 {
		// Everything seems lost or we are clearing the ring.
		// This might be large, but let's assume we just dump everything?
		return migrations
	}

	for i, vnode := range oldRing.vnodes {
		// Range (prev, curr]
		var prevHash uint32
		if i == 0 {
			prevHash = oldRing.vnodes[len(oldRing.vnodes)-1].HashID
		} else {
			prevHash = oldRing.vnodes[i-1].HashID
		}

		currHash := vnode.HashID
		oldOwner := vnode.Node

		// Who owns this range in the new ring?
		newOwner := newRing.getNodeByHash(currHash)

		if oldOwner != newOwner {
			migrations = append(migrations, Migration{
				StartHash:  prevHash,
				EndHash:    currHash,
				SourceNode: oldOwner,
				TargetNode: newOwner,
			})
		}
	}
	return migrations
}
