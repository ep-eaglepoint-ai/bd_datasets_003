package main

import (
	"sync"
)

type Room struct {
	name    string
	clients map[*Client]bool
	mu      sync.Mutex
}

var rooms = make(map[string]*Room)
var roomsMu sync.Mutex

func GetOrCreateRoom(name string) *Room {
	roomsMu.Lock()
	if rooms[name] == nil {
		rooms[name] = &Room{
			name:    name,
			clients: make(map[*Client]bool),
		}
	}
	room := rooms[name]
	roomsMu.Unlock()
	return room
}

func (r *Room) AddClient(client *Client) {
	r.clients[client] = true
}

func (r *Room) RemoveClient(client *Client) {
	delete(r.clients, client)
}

func (r *Room) Broadcast(msg *Message) {
	for client := range r.clients {
		go func(c *Client) {
			c.send <- msg
		}(client)
	}
}

func (r *Room) GetUsers() []string {
	users := []string{}
	for client := range r.clients {
		users = append(users, client.user)
	}
	return users
}
