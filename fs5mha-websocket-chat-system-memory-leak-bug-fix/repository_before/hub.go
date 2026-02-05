package main

import (
	"encoding/json"
	"net/http"
	"sync"
)

type Hub struct {
	clients    map[*Client]bool
	rooms      map[string]map[*Client]bool
	broadcast  chan *Message
	register   chan *Client
	unregister chan *Client
	mu         sync.Mutex
}

func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		rooms:      make(map[string]map[*Client]bool),
		broadcast:  make(chan *Message),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.clients[client] = true
			if h.rooms[client.room] == nil {
				h.rooms[client.room] = make(map[*Client]bool)
			}
			h.rooms[client.room][client] = true
			h.broadcastPresence(client.room)

		case client := <-h.unregister:
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				delete(h.rooms[client.room], client)
				close(client.send)
				h.broadcastPresence(client.room)
			}

		case message := <-h.broadcast:
			clients := h.rooms[message.Room]
			for client := range clients {
				client.send <- message
			}
		}
	}
}

func (h *Hub) broadcastPresence(room string) {
	clients := h.rooms[room]
	users := make([]string, 0)
	for client := range clients {
		users = append(users, client.user)
	}
	msg := &Message{
		Type:  MessageTypePresence,
		Room:  room,
		Users: users,
	}
	for client := range clients {
		client.send <- msg
	}
}

func (h *Hub) ServeMetrics(w http.ResponseWriter, r *http.Request) {
	h.mu.Lock()
	metrics := map[string]interface{}{
		"total_clients": len(h.clients),
		"total_rooms":   len(h.rooms),
	}
	h.mu.Unlock()
	json.NewEncoder(w).Encode(metrics)
}
