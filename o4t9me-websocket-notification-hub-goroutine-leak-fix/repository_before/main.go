package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

type Message struct {
	Topic   string          `json:"topic"`
	Payload json.RawMessage `json:"payload"`
}

type Client struct {
	hub    *Hub
	conn   *websocket.Conn
	send   chan []byte
	topics map[string]bool
}

type Hub struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	mu         sync.Mutex
	metrics    *Metrics
}

type Metrics struct {
	ActiveConnections int `json:"active_connections"`
	MessagesSent      int `json:"messages_sent"`
	mu                sync.Mutex
}

func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		metrics:    &Metrics{},
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			h.metrics.mu.Lock()
			h.metrics.ActiveConnections++
			h.metrics.mu.Unlock()

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()
			h.metrics.mu.Lock()
			h.metrics.ActiveConnections--
			h.metrics.mu.Unlock()

		case message := <-h.broadcast:
			h.mu.Lock()
			for client := range h.clients {
				client.send <- message
			}
			h.mu.Unlock()
			h.metrics.mu.Lock()
			h.metrics.MessagesSent++
			h.metrics.mu.Unlock()
		}
	}
}

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 4096
)

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()
	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})
	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("read error: %v", err)
			}
			break
		}

		var msg Message
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("invalid message format: %v", err)
			continue
		}

		c.hub.broadcastToTopic(msg)
	}
}

func (c *Client) writePump() {
	for {
		select {
		case message, ok := <-c.send:
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			n := len(c.send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-time.After(pingPeriod):
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (h *Hub) broadcastToTopic(msg Message) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("marshal error: %v", err)
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	metricsLog := ""
	for client := range h.clients {
		if client.topics[msg.Topic] {
			client.send <- data
			metricsLog += fmt.Sprintf("client=%p ", client)
		}
	}
	if metricsLog != "" {
		log.Printf("broadcast topic=%s targets: %s", msg.Topic, metricsLog)
	}
}

func (h *Hub) healthCheck() {
	for {
		time.Sleep(30 * time.Second)
		resp, err := http.Get("http://localhost:8081/health")
		if err != nil {
			log.Printf("health check failed: %v", err)
			continue
		}
		if resp.StatusCode != http.StatusOK {
			log.Printf("downstream unhealthy: status=%d", resp.StatusCode)
		}
	}
}

func serveWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}
	client := &Client{
		hub:    hub,
		conn:   conn,
		send:   make(chan []byte),
		topics: make(map[string]bool),
	}

	topics := r.URL.Query()["topic"]
	for _, t := range topics {
		client.topics[t] = true
	}

	client.hub.register <- client

	go client.writePump()
	go client.readPump()
}

func main() {
	hub := NewHub()
	go hub.Run()
	go hub.healthCheck()

	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		serveWs(hub, w, r)
	})

	http.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) {
		hub.metrics.mu.Lock()
		defer hub.metrics.mu.Unlock()
		json.NewEncoder(w).Encode(hub.metrics)
	})

	log.Println("server starting on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
