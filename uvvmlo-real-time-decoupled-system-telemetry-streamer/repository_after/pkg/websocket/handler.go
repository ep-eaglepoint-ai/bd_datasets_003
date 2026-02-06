package websocket

import (
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"telemetry-streamer/pkg/hub"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

const (
	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = (pongWait * 9) / 10
)

// HandleConnection upgrades HTTP to WebSocket and manages the connection
func HandleConnection(w http.ResponseWriter, r *http.Request, h *hub.Hub) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	h.Register(conn)

	// Start decoupled read and write goroutines
	go writePump(conn, h)
	go readPump(conn, h)
}

// readPump handles incoming messages and connection monitoring
func readPump(conn *websocket.Conn, h *hub.Hub) {
	defer func() {
		h.Unregister(conn)
	}()

	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket read error: %v", err)
			}
			break
		}
	}
}

// writePump sends messages to the WebSocket connection
func writePump(conn *websocket.Conn, h *hub.Hub) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
	}()

	client := h.GetClient(conn)
	if client == nil {
		return
	}

	for {
		select {
		case message, ok := <-client.Send:
			conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			err := conn.WriteMessage(websocket.TextMessage, message)
			if err != nil {
				return
			}

		case <-ticker.C:
			conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}

		case <-client.Done:
			return
		}
	}
}