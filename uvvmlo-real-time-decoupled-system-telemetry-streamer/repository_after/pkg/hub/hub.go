package hub

import (
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	// WriteWait time allowed to write a message to the peer
	WriteWait = 10 * time.Second
	// ClientBufferSize is the send buffer size per client
	ClientBufferSize = 16
	// SendTimeout for sending to client channel
	SendTimeout = 100 * time.Millisecond
)

// Client represents a WebSocket client connection
// Stores only lifecycle state (Send channel, Done signal, connection mutex)
// Does NOT store application/telemetry state per the prompt requirements
type Client struct {
	Conn   *websocket.Conn
	Send   chan []byte
	Hub    *Hub
	Done   chan struct{}
	mu     sync.RWMutex
	closed bool
}

// Hub maintains the set of active clients and broadcasts messages
// Registry is keyed by *websocket.Conn as per requirement #1
type Hub struct {
	Clients    map[*websocket.Conn]*Client // Single source of truth: conn -> client data
	Mu         sync.RWMutex
	broadcast  chan []byte
	register   chan *websocket.Conn
	unregister chan *websocket.Conn
	done       chan struct{}
}

// NewHub creates a new Hub instance
func NewHub() *Hub {
	return &Hub{
		Clients:    make(map[*websocket.Conn]*Client),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *websocket.Conn),
		unregister: make(chan *websocket.Conn),
		done:       make(chan struct{}),
	}
}

// Run starts the hub's main event loop
func (h *Hub) Run() {
	for {
		select {
		case conn := <-h.register:
			h.Mu.Lock()
			// Create and register client atomically
			h.Clients[conn] = &Client{
				Conn: conn,
				Send: make(chan []byte, ClientBufferSize),
				Hub:  h,
				Done: make(chan struct{}),
			}
			h.Mu.Unlock()

		case conn := <-h.unregister:
			h.Mu.Lock()
			if client, ok := h.Clients[conn]; ok {
				delete(h.Clients, conn)
				client.Close()
			}
			h.Mu.Unlock()

		case message := <-h.broadcast:
			h.Mu.RLock()
			for _, client := range h.Clients {
				// Non-blocking send with timeout (requirement #2)
				select {
				case client.Send <- message:
					// Message sent successfully
				case <-time.After(SendTimeout):
					// Client too slow, drop message to prevent blocking
				default:
					// Channel full, drop message immediately
				}
			}
			h.Mu.RUnlock()

		case <-h.done:
			h.Mu.Lock()
			for _, client := range h.Clients {
				client.Close()
			}
			h.Clients = make(map[*websocket.Conn]*Client)
			h.Mu.Unlock()
			return
		}
	}
}

// Broadcast sends data to all connected clients (non-blocking)
func (h *Hub) Broadcast(data []byte) {
	select {
	case h.broadcast <- data:
	default:
		// Broadcast channel full, drop message to prevent blocking
	}
}

// Register adds a client to the hub
func (h *Hub) Register(conn *websocket.Conn) {
	h.register <- conn
}

// Unregister removes a client from the hub (requirement #3: cleanup sequence)
func (h *Hub) Unregister(conn *websocket.Conn) {
	select {
	case h.unregister <- conn:
	case <-h.done:
	}
}

// GetClient retrieves client data for a connection
func (h *Hub) GetClient(conn *websocket.Conn) *Client {
	h.Mu.RLock()
	defer h.Mu.RUnlock()
	return h.Clients[conn]
}

// ClientCount returns the number of connected clients
func (h *Hub) ClientCount() int {
	h.Mu.RLock()
	defer h.Mu.RUnlock()
	return len(h.Clients)
}

// Stop gracefully stops the hub
func (h *Hub) Stop() {
	select {
	case <-h.done:
		// Already closed
	default:
		close(h.done)
	}
}

// Close safely closes the client connection and channels
func (c *Client) Close() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.closed {
		c.closed = true
		close(c.Done)
		close(c.Send)
		c.Conn.Close()
	}
}

// IsClosed returns whether the client is closed (FIX #7: use RLock for read-only)
func (c *Client) IsClosed() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.closed
}