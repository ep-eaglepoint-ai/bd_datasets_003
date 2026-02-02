package proximity

import (
	"errors"
	"sync"
	"time"
)

// ErrRideNotFound is returned when a ride is not found
var ErrRideNotFound = errors.New("ride not found")

// InMemoryRideStore implements RideStore for testing
type InMemoryRideStore struct {
	rides map[string]*Ride
	mu    sync.RWMutex
}

// NewInMemoryRideStore creates a new in-memory ride store
func NewInMemoryRideStore() *InMemoryRideStore {
	return &InMemoryRideStore{
		rides: make(map[string]*Ride),
	}
}

// CreateRide adds a new ride to the store
func (s *InMemoryRideStore) CreateRide(ride *Ride) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.rides[ride.RideID] = ride
	return nil
}

// GetRide retrieves a ride by ID
func (s *InMemoryRideStore) GetRide(rideID string) (*Ride, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	ride, ok := s.rides[rideID]
	if !ok {
		return nil, ErrRideNotFound
	}
	return ride, nil
}

// UpdateRideStatus updates the status of a ride
func (s *InMemoryRideStore) UpdateRideStatus(rideID, status string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	ride, ok := s.rides[rideID]
	if !ok {
		return ErrRideNotFound
	}
	ride.Status = status
	return nil
}

// IsRideCompleted checks if a ride is completed
func (s *InMemoryRideStore) IsRideCompleted(rideID string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	ride, ok := s.rides[rideID]
	if !ok {
		return false
	}
	return ride.Status == "completed"
}

// DeleteRide removes a ride from the store
func (s *InMemoryRideStore) DeleteRide(rideID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.rides, rideID)
	return nil
}

// GetAllRides returns all rides
func (s *InMemoryRideStore) GetAllRides() []*Ride {
	s.mu.RLock()
	defer s.mu.RUnlock()
	rides := make([]*Ride, 0, len(s.rides))
	for _, ride := range s.rides {
		rides = append(rides, ride)
	}
	return rides
}

// GetActiveRides returns all non-completed rides
func (s *InMemoryRideStore) GetActiveRides() []*Ride {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var rides []*Ride
	for _, ride := range s.rides {
		if ride.Status != "completed" {
			rides = append(rides, ride)
		}
	}
	return rides
}

// ConnectionTracker tracks client connections per user/ride
type ConnectionTracker struct {
	// userID -> list of client IDs
	userConnections map[string][]string
	// clientID -> rideID
	clientRides map[string]string
	mu          sync.RWMutex
}

// NewConnectionTracker creates a new connection tracker
func NewConnectionTracker() *ConnectionTracker {
	return &ConnectionTracker{
		userConnections: make(map[string][]string),
		clientRides:     make(map[string]string),
	}
}

// RegisterConnection tracks a new connection
func (t *ConnectionTracker) RegisterConnection(clientID, userID, rideID string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.userConnections[userID] = append(t.userConnections[userID], clientID)
	t.clientRides[clientID] = rideID
}

// UnregisterConnection removes a connection
func (t *ConnectionTracker) UnregisterConnection(clientID, userID string) {
	t.mu.Lock()
	defer t.mu.Unlock()

	// Remove from user connections
	if conns, ok := t.userConnections[userID]; ok {
		for i, id := range conns {
			if id == clientID {
				t.userConnections[userID] = append(conns[:i], conns[i+1:]...)
				break
			}
		}
	}

	delete(t.clientRides, clientID)
}

// GetUserConnections returns all connections for a user
func (t *ConnectionTracker) GetUserConnections(userID string) []string {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.userConnections[userID]
}

// GetClientRide returns the ride ID for a client
func (t *ConnectionTracker) GetClientRide(clientID string) string {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.clientRides[clientID]
}

// Session represents an active WebSocket session
type Session struct {
	ClientID     string
	UserID       string
	RideID       string
	ConnectedAt  time.Time
	LastActivity time.Time
	IsActive     bool
}

// SessionManager manages active sessions
type SessionManager struct {
	sessions map[string]*Session
	mu       sync.RWMutex
}

// NewSessionManager creates a new session manager
func NewSessionManager() *SessionManager {
	return &SessionManager{
		sessions: make(map[string]*Session),
	}
}

// CreateSession creates a new session
func (m *SessionManager) CreateSession(clientID string) *Session {
	m.mu.Lock()
	defer m.mu.Unlock()

	session := &Session{
		ClientID:     clientID,
		ConnectedAt:  time.Now(),
		LastActivity: time.Now(),
		IsActive:     true,
	}
	m.sessions[clientID] = session
	return session
}

// GetSession retrieves a session
func (m *SessionManager) GetSession(clientID string) *Session {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.sessions[clientID]
}

// UpdateSession updates session with ride info
func (m *SessionManager) UpdateSession(clientID, userID, rideID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if session, ok := m.sessions[clientID]; ok {
		session.UserID = userID
		session.RideID = rideID
		session.LastActivity = time.Now()
	}
}

// TouchSession updates last activity
func (m *SessionManager) TouchSession(clientID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if session, ok := m.sessions[clientID]; ok {
		session.LastActivity = time.Now()
	}
}

// EndSession ends a session
func (m *SessionManager) EndSession(clientID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if session, ok := m.sessions[clientID]; ok {
		session.IsActive = false
	}
	delete(m.sessions, clientID)
}

// GetActiveSessions returns all active sessions
func (m *SessionManager) GetActiveSessions() []*Session {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var sessions []*Session
	for _, s := range m.sessions {
		if s.IsActive {
			sessions = append(sessions, s)
		}
	}
	return sessions
}

// GetSessionsByRide returns sessions for a specific ride
func (m *SessionManager) GetSessionsByRide(rideID string) []*Session {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var sessions []*Session
	for _, s := range m.sessions {
		if s.RideID == rideID && s.IsActive {
			sessions = append(sessions, s)
		}
	}
	return sessions
}
