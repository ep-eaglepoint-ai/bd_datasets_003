// High-Concurrency Seat Reservation Backend
// Principal Full Stack Engineer Implementation
// 
// This module implements a raw HTTP server for seat reservations with:
// - Thread-safe seat management using sync.Mutex
// - Real-time updates via Server-Sent Events
// - Concurrent booking handling with proper conflict resolution
//
// REQ-1: Uses only Go standard library (no external dependencies)
// REQ-2: sync.Mutex protects all seat decrement operations
// REQ-3: Server-Sent Events with proper headers
// REQ-4: Broadcasts updates to all connected clients

package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
)

// SeatReservationServer manages concurrent seat bookings with real-time updates
type SeatReservationServer struct {
	// REQ-2: sync.Mutex protects the availableSeats counter from race conditions
	availableSeats int        // Current number of available seats
	seatMutex      sync.Mutex // Protects availableSeats during concurrent access
	
	// Client management for Server-Sent Events broadcasting
	sseClients      map[chan string]bool // Active SSE client connections
	clientsMutex    sync.Mutex           // Protects sseClients map during concurrent access
}

// BookingResponse represents the JSON response for booking requests
type BookingResponse struct {
	Success        bool   `json:"success"`
	AvailableSeats int    `json:"availableSeats,omitempty"`
	Error          string `json:"error,omitempty"`
}

// NewSeatReservationServer creates a new server instance with initial seat count
func NewSeatReservationServer(initialSeats int) *SeatReservationServer {
	return &SeatReservationServer{
		availableSeats: initialSeats,
		sseClients:     make(map[chan string]bool),
	}
}

// addSSEClient safely adds a new SSE client to the broadcast list
func (s *SeatReservationServer) addSSEClient(clientChannel chan string) {
	s.clientsMutex.Lock()
	defer s.clientsMutex.Unlock()
	s.sseClients[clientChannel] = true
}

// removeSSEClient safely removes an SSE client and closes its channel
func (s *SeatReservationServer) removeSSEClient(clientChannel chan string) {
	s.clientsMutex.Lock()
	defer s.clientsMutex.Unlock()
	delete(s.sseClients, clientChannel)
	close(clientChannel)
}

// REQ-4: broadcastSeatUpdate sends seat count updates to all connected SSE clients
func (s *SeatReservationServer) broadcastSeatUpdate(seatCount int) {
	message := fmt.Sprintf("%d", seatCount)
	
	s.clientsMutex.Lock()
	defer s.clientsMutex.Unlock()
	
	// Send update to all connected clients
	for clientChannel := range s.sseClients {
		select {
		case clientChannel <- message:
			// Message sent successfully
		default:
			// Client channel is blocked, remove it to prevent memory leaks
			delete(s.sseClients, clientChannel)
			close(clientChannel)
		}
	}
}

// REQ-3: handleSSEEvents implements Server-Sent Events endpoint
// Streams real-time seat inventory updates to connected clients
func (s *SeatReservationServer) handleSSEEvents(w http.ResponseWriter, r *http.Request) {
	// REQ-3: Set required SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	// Create dedicated channel for this client
	clientChannel := make(chan string)
	s.addSSEClient(clientChannel)
	defer s.removeSSEClient(clientChannel)

	// Send current seat count immediately upon connection
	s.seatMutex.Lock()
	currentSeats := s.availableSeats
	s.seatMutex.Unlock()
	
	fmt.Fprintf(w, "data: %d\n\n", currentSeats)
	w.(http.Flusher).Flush()

	// Listen for updates and client disconnection
	for {
		select {
		case update := <-clientChannel:
			// Send seat count update to client
			fmt.Fprintf(w, "data: %s\n\n", update)
			w.(http.Flusher).Flush()
		case <-r.Context().Done():
			// Client disconnected, cleanup handled by defer
			return
		}
	}
}

// REQ-2: handleSeatBooking processes seat reservation requests with mutex protection
// Returns 200 OK on success, 409 Conflict when no seats available
func (s *SeatReservationServer) handleSeatBooking(w http.ResponseWriter, r *http.Request) {
	// Only accept POST requests
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Set response headers
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	// REQ-2: Critical section - mutex protects seat decrement operation
	s.seatMutex.Lock()
	
	if s.availableSeats > 0 {
		// Seat available - perform atomic decrement
		s.availableSeats--
		newSeatCount := s.availableSeats
		s.seatMutex.Unlock()

		// REQ-4: Broadcast update to all SSE clients after successful booking
		s.broadcastSeatUpdate(newSeatCount)

		// Return success response
		response := BookingResponse{
			Success:        true,
			AvailableSeats: newSeatCount,
		}
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(response)
		
	} else {
		// No seats available - return conflict
		s.seatMutex.Unlock()
		
		response := BookingResponse{
			Success: false,
			Error:   "No seats available",
		}
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(response)
	}
}

// handleCORSPreflight handles CORS preflight requests
func (s *SeatReservationServer) handleCORSPreflight(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.WriteHeader(http.StatusOK)
}

// REQ-1: main function uses only Go standard library
func main() {
	// Initialize server with 10 available seats
	server := NewSeatReservationServer(10)

	// Register HTTP handlers
	http.HandleFunc("/events", server.handleSSEEvents)
	http.HandleFunc("/book", server.handleSeatBooking)
	http.HandleFunc("/", server.handleCORSPreflight)

	// Start HTTP server
	log.Println("🚀 High-Concurrency Seat Reservation Server starting on :8080")
	log.Println("📡 SSE Endpoint: GET /events")
	log.Println("🎫 Booking Endpoint: POST /book")
	
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal("❌ Server failed to start:", err)
	}
}