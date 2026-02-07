package unit

import (
	"testing"

	"github.com/vzdtic/raft-kv-store/repository_after/pkg/cluster"
)

func TestMembershipManagerAddRemove(t *testing.T) {
	m := cluster.NewManager()

	// Add members
	if err := m.AddMember("node1", "localhost:9001", true); err != nil {
		t.Fatalf("Failed to add node1: %v", err)
	}
	if err := m.AddMember("node2", "localhost:9002", true); err != nil {
		t.Fatalf("Failed to add node2: %v", err)
	}
	if err := m.AddMember("node3", "localhost:9003", true); err != nil {
		t.Fatalf("Failed to add node3: %v", err)
	}

	// Verify count
	if m.Count() != 3 {
		t.Errorf("Expected 3 members, got %d", m.Count())
	}

	// Verify member retrieval
	member, ok := m.GetMember("node1")
	if !ok {
		t.Fatal("Expected to find node1")
	}
	if member.ID != "node1" {
		t.Errorf("Expected ID 'node1', got '%s'", member.ID)
	}
	if member.Address != "localhost:9001" {
		t.Errorf("Expected address 'localhost:9001', got '%s'", member.Address)
	}
	if !member.Voting {
		t.Error("Expected node1 to be voting")
	}
	if member.State != cluster.MemberStateJoining {
		t.Errorf("Expected state Joining, got %d", member.State)
	}

	// Duplicate add should fail
	if err := m.AddMember("node1", "localhost:9001", true); err == nil {
		t.Error("Expected error when adding duplicate member")
	}

	// Activate members
	if err := m.ActivateMember("node1"); err != nil {
		t.Fatalf("Failed to activate node1: %v", err)
	}
	if err := m.ActivateMember("node2"); err != nil {
		t.Fatalf("Failed to activate node2: %v", err)
	}
	if err := m.ActivateMember("node3"); err != nil {
		t.Fatalf("Failed to activate node3: %v", err)
	}

	// Verify active state
	member, _ = m.GetMember("node1")
	if member.State != cluster.MemberStateActive {
		t.Errorf("Expected state Active, got %d", member.State)
	}

	// Verify active members
	active := m.GetActiveMembers()
	if len(active) != 3 {
		t.Errorf("Expected 3 active members, got %d", len(active))
	}

	// Verify quorum size (3 voting members -> quorum = 2)
	if m.QuorumSize() != 2 {
		t.Errorf("Expected quorum size 2, got %d", m.QuorumSize())
	}

	// Remove a member
	if err := m.RemoveMember("node3"); err != nil {
		t.Fatalf("Failed to remove node3: %v", err)
	}

	member, ok = m.GetMember("node3")
	if !ok {
		t.Fatal("Expected node3 to still exist (in Removed state)")
	}
	if member.State != cluster.MemberStateRemoved {
		t.Errorf("Expected state Removed, got %d", member.State)
	}

	// Active members should now be 2
	active = m.GetActiveMembers()
	if len(active) != 2 {
		t.Errorf("Expected 2 active members after removal, got %d", len(active))
	}

	// Remove non-existent should fail
	if err := m.RemoveMember("node99"); err == nil {
		t.Error("Expected error removing non-existent member")
	}

	// Activate non-existent should fail
	if err := m.ActivateMember("node99"); err == nil {
		t.Error("Expected error activating non-existent member")
	}
}

func TestMembershipManagerVotingMembers(t *testing.T) {
	m := cluster.NewManager()

	m.AddMember("node1", "localhost:9001", true)
	m.AddMember("node2", "localhost:9002", true)
	m.AddMember("node3", "localhost:9003", false) // non-voting

	m.ActivateMember("node1")
	m.ActivateMember("node2")
	m.ActivateMember("node3")

	voting := m.GetVotingMembers()
	if len(voting) != 2 {
		t.Errorf("Expected 2 voting members, got %d", len(voting))
	}

	for _, v := range voting {
		if v.ID == "node3" {
			t.Error("node3 should not be in voting members")
		}
	}

	// Quorum should be based on voting members only (2 voting -> quorum = 2)
	if m.QuorumSize() != 2 {
		t.Errorf("Expected quorum size 2, got %d", m.QuorumSize())
	}
}

func TestMembershipManagerSnapshot(t *testing.T) {
	m1 := cluster.NewManager()

	m1.AddMember("node1", "localhost:9001", true)
	m1.AddMember("node2", "localhost:9002", true)
	m1.ActivateMember("node1")
	m1.ActivateMember("node2")

	// Take snapshot
	snap := m1.Snapshot()
	if len(snap) != 2 {
		t.Fatalf("Expected 2 members in snapshot, got %d", len(snap))
	}

	// Restore into a new manager
	m2 := cluster.NewManager()
	m2.Restore(snap)

	// Verify restored state
	member, ok := m2.GetMember("node1")
	if !ok {
		t.Fatal("Expected to find node1 after restore")
	}
	if member.Address != "localhost:9001" {
		t.Errorf("Expected address 'localhost:9001', got '%s'", member.Address)
	}
	if member.State != cluster.MemberStateActive {
		t.Errorf("Expected state Active after restore, got %d", member.State)
	}

	if m2.Count() != 2 {
		t.Errorf("Expected 2 members after restore, got %d", m2.Count())
	}
}

func TestMembershipManagerVersion(t *testing.T) {
	m := cluster.NewManager()

	v0 := m.Version()
	m.AddMember("node1", "localhost:9001", true)
	v1 := m.Version()
	if v1 <= v0 {
		t.Error("Expected version to increase after AddMember")
	}

	m.ActivateMember("node1")
	v2 := m.Version()
	if v2 <= v1 {
		t.Error("Expected version to increase after ActivateMember")
	}

	m.RemoveMember("node1")
	v3 := m.Version()
	if v3 <= v2 {
		t.Error("Expected version to increase after RemoveMember")
	}
}

func TestMembershipManagerGetAllMembers(t *testing.T) {
	m := cluster.NewManager()

	m.AddMember("node1", "localhost:9001", true)
	m.AddMember("node2", "localhost:9002", true)
	m.AddMember("node3", "localhost:9003", true)
	m.ActivateMember("node1")
	// node2 stays Joining, node3 stays Joining

	all := m.GetMembers()
	if len(all) != 3 {
		t.Errorf("Expected 3 members total, got %d", len(all))
	}

	active := m.GetActiveMembers()
	if len(active) != 1 {
		t.Errorf("Expected 1 active member, got %d", len(active))
	}
}