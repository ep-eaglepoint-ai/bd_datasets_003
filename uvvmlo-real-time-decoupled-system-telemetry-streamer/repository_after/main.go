package main

import (
	"log"
	"net/http"
	"time"

	"telemetry-streamer/pkg/hub"
	"telemetry-streamer/pkg/metrics"
	wshandler "telemetry-streamer/pkg/websocket"
)

func main() {
	h := hub.NewHub()
	go h.Run()

	collector := metrics.NewCollector(1 * time.Second)
	// No need to inject hub - collector now reads actual system connections
	go collector.Start(h.Broadcast)

	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		wshandler.HandleConnection(w, r, h)
	})

	http.Handle("/", http.FileServer(http.Dir("./frontend/build")))

	log.Println("Server starting on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}