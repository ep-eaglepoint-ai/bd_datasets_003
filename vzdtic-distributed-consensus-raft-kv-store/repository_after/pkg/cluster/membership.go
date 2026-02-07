package cluster

import (
	"fmt"
	"sync"
)

// Member represents a cluster member
type Member struct {
	ID      string
	Address string
	Voting  bool
	State   MemberState
}

// MemberState represents the state of a cluster member
type MemberState int

const (
	MemberStateActive MemberState = iota
	MemberStateJoining
	MemberStateLeaving
	MemberStateRemoved
)

// Manager manages cluster membership
type Manager struct {
	mu      sync.RWMutex
	members map[string]*Member
	version uint64
}

// NewManager creates a new membership manager
func NewManager() *Manager {
	return &Manager{
		members: make(map[string]*Member),
	}
}

// AddMember adds a member to the cluster
func (m *Manager) AddMember(id, address string, voting bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.members[id]; exists {
		return fmt.Errorf("member %s already exists", id)
	}

	m.members[id] = &Member{
		ID:      id,
		Address: address,
		Voting:  voting,
		State:   MemberStateJoining,
	}
	m.version++

	return nil
}

// RemoveMember removes a member from the cluster
func (m *Manager) RemoveMember(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	member, exists := m.members[id]
	if !exists {
		return fmt.Errorf("member %s does not exist", id)
	}

	member.State = MemberStateRemoved
	m.version++

	return nil
}

// ActivateMember activates a joining member
func (m *Manager) ActivateMember(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	member, exists := m.members[id]
	if !exists {
		return fmt.Errorf("member %s does not exist", id)
	}

	member.State = MemberStateActive
	m.version++

	return nil
}

// GetMember returns a member by ID
func (m *Manager) GetMember(id string) (*Member, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	member, ok := m.members[id]
	if !ok {
		return nil, false
	}

	return &Member{
		ID:      member.ID,
		Address: member.Address,
		Voting:  member.Voting,
		State:   member.State,
	}, true
}

// GetMembers returns all members
func (m *Manager) GetMembers() []*Member {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]*Member, 0, len(m.members))
	for _, member := range m.members {
		result = append(result, &Member{
			ID:      member.ID,
			Address: member.Address,
			Voting:  member.Voting,
			State:   member.State,
		})
	}
	return result
}

// GetActiveMembers returns all active members
func (m *Manager) GetActiveMembers() []*Member {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]*Member, 0)
	for _, member := range m.members {
		if member.State == MemberStateActive {
			result = append(result, &Member{
				ID:      member.ID,
				Address: member.Address,
				Voting:  member.Voting,
				State:   member.State,
			})
		}
	}
	return result
}

// GetVotingMembers returns all voting members
func (m *Manager) GetVotingMembers() []*Member {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]*Member, 0)
	for _, member := range m.members {
		if member.Voting && member.State == MemberStateActive {
			result = append(result, &Member{
				ID:      member.ID,
				Address: member.Address,
				Voting:  member.Voting,
				State:   member.State,
			})
		}
	}
	return result
}

// Count returns the total number of members
func (m *Manager) Count() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.members)
}

// QuorumSize returns the quorum size
func (m *Manager) QuorumSize() int {
	m.mu.RLock()
	defer m.mu.RUnlock()

	votingCount := 0
	for _, member := range m.members {
		if member.Voting && member.State == MemberStateActive {
			votingCount++
		}
	}
	return votingCount/2 + 1
}

// Version returns the configuration version
func (m *Manager) Version() uint64 {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.version
}

// Snapshot creates a snapshot of the membership
func (m *Manager) Snapshot() map[string]*Member {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make(map[string]*Member)
	for id, member := range m.members {
		result[id] = &Member{
			ID:      member.ID,
			Address: member.Address,
			Voting:  member.Voting,
			State:   member.State,
		}
	}
	return result
}

// Restore restores membership from a snapshot
func (m *Manager) Restore(snapshot map[string]*Member) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.members = make(map[string]*Member)
	for id, member := range snapshot {
		m.members[id] = &Member{
			ID:      member.ID,
			Address: member.Address,
			Voting:  member.Voting,
			State:   member.State,
		}
	}
	m.version++
}