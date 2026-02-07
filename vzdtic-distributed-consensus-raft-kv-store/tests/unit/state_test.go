package unit

import (
	"testing"
	"time"

	"github.com/vzdtic/raft-kv-store/repository_after/pkg/raft"
)

func TestNodeState(t *testing.T) {
	state := raft.NewNodeState()

	// Test initial state
	if state.GetState() != raft.Follower {
		t.Error("Expected initial state to be Follower")
	}

	if state.GetCurrentTerm() != 0 {
		t.Error("Expected initial term to be 0")
	}

	if state.GetVotedFor() != "" {
		t.Error("Expected initial votedFor to be empty")
	}
}

func TestNodeStateTransitions(t *testing.T) {
	state := raft.NewNodeState()

	// Transition to Candidate
	state.SetState(raft.Candidate)
	if state.GetState() != raft.Candidate {
		t.Error("Expected state to be Candidate")
	}

	// Transition to Leader
	state.SetState(raft.Leader)
	if state.GetState() != raft.Leader {
		t.Error("Expected state to be Leader")
	}

	// Transition back to Follower
	state.SetState(raft.Follower)
	if state.GetState() != raft.Follower {
		t.Error("Expected state to be Follower")
	}
}

func TestNodeStateTermVote(t *testing.T) {
	state := raft.NewNodeState()

	state.SetCurrentTerm(5)
	if state.GetCurrentTerm() != 5 {
		t.Errorf("Expected term 5, got %d", state.GetCurrentTerm())
	}

	state.SetVotedFor("node2")
	if state.GetVotedFor() != "node2" {
		t.Errorf("Expected votedFor 'node2', got '%s'", state.GetVotedFor())
	}
}

func TestNodeStateCommitApply(t *testing.T) {
	state := raft.NewNodeState()

	state.SetCommitIndex(10)
	if state.GetCommitIndex() != 10 {
		t.Errorf("Expected commit index 10, got %d", state.GetCommitIndex())
	}

	state.SetLastApplied(5)
	if state.GetLastApplied() != 5 {
		t.Errorf("Expected last applied 5, got %d", state.GetLastApplied())
	}
}

func TestNodeStateLeaderState(t *testing.T) {
	state := raft.NewNodeState()

	peers := []string{"node2", "node3"}
	state.ResetLeaderState(peers, 10)

	// Check nextIndex initialized to lastLogIndex + 1
	for _, peer := range peers {
		if state.GetNextIndex(peer) != 11 {
			t.Errorf("Expected nextIndex 11 for %s, got %d", peer, state.GetNextIndex(peer))
		}
		if state.GetMatchIndex(peer) != 0 {
			t.Errorf("Expected matchIndex 0 for %s, got %d", peer, state.GetMatchIndex(peer))
		}
	}
}

func TestNodeStateHeartbeat(t *testing.T) {
	state := raft.NewNodeState()

	now := time.Now()
	state.SetLastHeartbeat(now)

	if state.GetLastHeartbeat() != now {
		t.Error("Expected last heartbeat to match")
	}
}

func TestIsLeader(t *testing.T) {
	state := raft.NewNodeState()

	if state.IsLeader() {
		t.Error("Expected not to be leader initially")
	}

	state.SetState(raft.Leader)
	if !state.IsLeader() {
		t.Error("Expected to be leader after setting state")
	}
}