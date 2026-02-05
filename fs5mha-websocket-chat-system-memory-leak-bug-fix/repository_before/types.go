package main

type MessageType string

const (
	MessageTypeChat     MessageType = "chat"
	MessageTypeJoin     MessageType = "join"
	MessageTypeLeave    MessageType = "leave"
	MessageTypePresence MessageType = "presence"
)

type Message struct {
	Type    MessageType `json:"type"`
	Room    string      `json:"room"`
	User    string      `json:"user"`
	Content string      `json:"content,omitempty"`
	Users   []string    `json:"users,omitempty"`
}
