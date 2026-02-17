package main

import (
	"encoding/json"
	"net/http"
	"sync"
	"sync/atomic"
	"time"
)

type Hub struct {
	// Registered clients.
	clients map[*Client]bool

	// Rooms map: roomName -> set of clients
	rooms map[string]map[*Client]bool

	// Inbound messages from the clients or Redis.
	broadcast chan *Message

	// Register requests from the clients.
	register chan *Client

	// Unregister requests from clients.
	unregister chan *Client

	// Mutex to protect clients and rooms maps
	mu sync.RWMutex

	// Redis subscription stop channels: roomName -> stop channel
	stopSubs map[string]chan struct{}

	// Shutdown signal
	Quit chan struct{}

	// Atomic counters for lock-free metrics reads
	clientCount int64
	roomCount   int64

	// Track clients pending unregistration to avoid duplicate cleanup
	pendingUnregister map[*Client]bool
}

func NewHub() *Hub {
	return &Hub{
		clients:           make(map[*Client]bool),
		rooms:             make(map[string]map[*Client]bool),
		broadcast:         make(chan *Message, 256),
		register:          make(chan *Client),
		unregister:        make(chan *Client, 256),
		stopSubs:          make(map[string]chan struct{}),
		Quit:              make(chan struct{}),
		pendingUnregister: make(map[*Client]bool),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			atomic.AddInt64(&h.clientCount, 1)
			if h.rooms[client.room] == nil {
				h.rooms[client.room] = make(map[*Client]bool)
				atomic.AddInt64(&h.roomCount, 1)
				stop := make(chan struct{})
				h.stopSubs[client.room] = stop
				go subscribeToRoom(h, client.room, stop)
			}
			h.rooms[client.room][client] = true
			roomName := client.room
			h.mu.Unlock()
			h.broadcastPresence(roomName)

		case client := <-h.unregister:
			h.unregisterClient(client)

		case message := <-h.broadcast:
			h.mu.RLock()
			clients := h.rooms[message.Room]
			var slowClients []*Client
			for client := range clients {
				select {
				case client.send <- message:
				default:
					// Collect slow clients for synchronous unregistration
					slowClients = append(slowClients, client)
				}
			}
			h.mu.RUnlock()

			// Synchronously unregister slow clients to prevent race conditions
			for _, client := range slowClients {
				client.conn.Close()
				// Send to unregister channel (non-blocking to avoid deadlock)
				select {
				case h.unregister <- client:
				default:
					// If channel is full, the client will be cleaned up by readPump
				}
			}

		case <-h.Quit:
			h.shutdown()
			return
		}
	}
}

func (h *Hub) shutdown() {
	h.mu.Lock()
	clients := make([]*Client, 0, len(h.clients))
	for client := range h.clients {
		clients = append(clients, client)
	}

	// Stop all Redis subscriptions
	for room, stop := range h.stopSubs {
		close(stop)
		delete(h.stopSubs, room)
	}
	h.mu.Unlock()

	// Close all client connections
	for _, client := range clients {
		client.conn.Close()
	}

	// Drain remaining messages from channels with timeout
	drainTimeout := time.After(5 * time.Second)
	for {
		select {
		case client := <-h.unregister:
			h.unregisterClient(client)
		case <-h.broadcast:
			// Discard remaining broadcast messages during shutdown
		case <-drainTimeout:
			return
		default:
			// Channels are empty
			return
		}
	}
}

func (h *Hub) unregisterClient(client *Client) {
	h.mu.Lock()
	// Check if already pending unregistration to prevent double-close
	if h.pendingUnregister[client] {
		h.mu.Unlock()
		return
	}

	if _, ok := h.clients[client]; ok {
		h.pendingUnregister[client] = true
		delete(h.clients, client)
		atomic.AddInt64(&h.clientCount, -1)
		roomName := client.room
		if roomClients, exists := h.rooms[roomName]; exists {
			delete(roomClients, client)
			if len(roomClients) == 0 {
				delete(h.rooms, roomName)
				atomic.AddInt64(&h.roomCount, -1)
				if stop, ok := h.stopSubs[roomName]; ok {
					close(stop)
					delete(h.stopSubs, roomName)
				}
			}
		}
		close(client.send)
		delete(h.pendingUnregister, client)
		h.mu.Unlock()
		// Broadcast presence update after unlocking to avoid deadlock
		go h.broadcastPresence(roomName)
	} else {
		h.mu.Unlock()
	}
}

func (h *Hub) broadcastPresence(room string) {
	h.mu.RLock()
	clients, ok := h.rooms[room]
	if !ok {
		h.mu.RUnlock()
		return
	}
	users := make([]string, 0, len(clients))
	for client := range clients {
		users = append(users, client.user)
	}
	h.mu.RUnlock()

	msg := &Message{
		Type:  MessageTypePresence,
		Room:  room,
		Users: users,
	}

	h.mu.RLock()
	// Re-fetch clients to be safe
	clients = h.rooms[room]
	for client := range clients {
		select {
		case client.send <- msg:
		default:
			// Skip slow clients - they will be cleaned up by broadcast loop
		}
	}
	h.mu.RUnlock()
}

// ServeMetrics returns metrics using atomic counters for fast, lock-free reads
func (h *Hub) ServeMetrics(w http.ResponseWriter, r *http.Request) {
	// Use atomic reads for lock-free performance under load
	metrics := map[string]interface{}{
		"total_clients": atomic.LoadInt64(&h.clientCount),
		"total_rooms":   atomic.LoadInt64(&h.roomCount),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(metrics)
}
