package main

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
)

const (
	// Time allowed to write a message to the peer.
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer.
	pongWait = 60 * time.Second

	// Send pings to peer with this period. Must be less than pongWait.
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer.
	maxMessageSize = 512
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

type Client struct {
	hub  *Hub
	conn *websocket.Conn
	send chan *Message
	room string
	user string
}

func ServeWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
	room := r.URL.Query().Get("room")
	user := r.URL.Query().Get("user")
	if room == "" || user == "" {
		http.Error(w, "room and user required", http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("upgrade error:", err)
		return
	}

	client := &Client{
		hub:  hub,
		conn: conn,
		send: make(chan *Message, 256),
		room: room,
		user: user,
	}

	client.hub.register <- client

	// Start pumps
	go client.writePump()
	go client.readPump()
}

func (c *Client) readPump() {
	defer func() {
		c.conn.Close()
		select {
		case c.hub.unregister <- c:
		default:
		}
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}

		var msg Message
		if err := json.Unmarshal(data, &msg); err != nil {
			log.Println("unmarshal error:", err)
			continue
		}

		// Enforce user and room from connection
		msg.User = c.user
		msg.Room = c.room

		// Attempt to enqueue broadcast without blocking indefinitely.
		select {
		case c.hub.broadcast <- &msg:
			// Async publish to Redis with error notification
			go func(m *Message) {
				if err := publishToRedis(m); err != nil {
					// Notify sender of Redis publish failure
					errMsg := &Message{
						Type:    MessageTypeChat,
						Room:    c.room,
						User:    "system",
						Content: "message delivered locally, but cross-instance delivery failed",
					}
					select {
					case c.send <- errMsg:
					default:
						// Channel full, skip notification
					}
				}
			}(&msg)
		default:
			// Hub is overloaded; return an error to the sender where possible.
			errMsg := &Message{
				Type:    MessageTypeChat,
				Room:    c.room,
				User:    "system",
				Content: "server overloaded, message dropped",
			}

			select {
			case c.send <- errMsg:
			default:
				// If even the error cannot be delivered, close the connection
				// and let the pumps clean up.
				c.conn.Close()
				return
			}
		}
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// The hub closed the channel.
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			// Write single message directly for simplicity and compatibility
			data, err := json.Marshal(message)
			if err != nil {
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, data); err != nil {
				return
			}

			// Efficiently batch remaining queued messages
			n := len(c.send)
			for i := 0; i < n; i++ {
				msg := <-c.send
				data, err := json.Marshal(msg)
				if err != nil {
					continue
				}
				if err := c.conn.WriteMessage(websocket.TextMessage, data); err != nil {
					return
				}
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
