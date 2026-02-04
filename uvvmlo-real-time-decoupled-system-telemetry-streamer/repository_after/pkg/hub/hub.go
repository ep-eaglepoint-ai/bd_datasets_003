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
type Client struct {
	Conn   *websocket.Conn
	Send   chan []byte
	Hub    *Hub
	Done   chan struct{}
	mu     sync.Mutex
	closed bool
}

// Hub maintains the set of active clients and broadcasts messages
type Hub struct {
	Clients    map[*Client]bool
	Mu         sync.RWMutex
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	done       chan struct{}
}

// NewHub creates a new Hub instance
func NewHub() *Hub {
	return &Hub{
		Clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		done:       make(chan struct{}),
	}
}

// Run starts the hub's main event loop
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.Mu.Lock()
			h.Clients[client] = true
			h.Mu.Unlock()

		case client := <-h.unregister:
			h.Mu.Lock()
			if _, ok := h.Clients[client]; ok {
				delete(h.Clients, client)
				client.Close()
			}
			h.Mu.Unlock()

		case message := <-h.broadcast:
			h.Mu.RLock()
			for client := range h.Clients {
				// Non-blocking send with select and default case
				// This ensures slow consumers don't block the broadcaster
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
			for client := range h.Clients {
				client.Close()
				delete(h.Clients, client)
			}
			h.Mu.Unlock()
			return
		}
	}
}

// Broadcast sends data to all connected clients
func (h *Hub) Broadcast(data []byte) {
	select {
	case h.broadcast <- data:
	default:
		// Broadcast channel full, drop message to prevent blocking
	}
}

// Register adds a client to the hub
func (h *Hub) Register(client *Client) {
	h.register <- client
}

// Unregister removes a client from the hub
func (h *Hub) Unregister(client *Client) {
	select {
	case h.unregister <- client:
	case <-h.done:
	}
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

// NewClient creates a new client
func NewClient(conn *websocket.Conn, hub *Hub) *Client {
	return &Client{
		Conn:   conn,
		Send:   make(chan []byte, ClientBufferSize),
		Hub:    hub,
		Done:   make(chan struct{}),
		closed: false,
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

// IsClosed returns whether the client is closed
func (c *Client) IsClosed() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.closed
}