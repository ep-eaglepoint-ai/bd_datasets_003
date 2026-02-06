package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/mux"
)

type Question struct {
	Text     string   `json:"text"`
	Answer   string   `json:"-"`
	Choices  []string `json:"choices"`
	Duration int      `json:"duration"` // seconds
}

type Player struct {
	Name  string `json:"name"`
	Score int    `json:"score"`
}

type Game struct {
	ID         int
	Players    map[string]*Player
	Questions  []Question
	CurrentQ   int
	StartTime  time.Time
	Lock       sync.Mutex
}

var (
	games   = make(map[int]*Game)
	gamesMu sync.Mutex
	nextID  = 0
)

// Create a new game
func createGame(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Questions []Question `json:"questions"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", 400)
		return
	}

	gamesMu.Lock()
	nextID++
	game := &Game{
		ID:        nextID,
		Players:   make(map[string]*Player),
		Questions: req.Questions,
		CurrentQ:  0,
		StartTime: time.Now(),
	}
	games[nextID] = game
	gamesMu.Unlock()

	json.NewEncoder(w).Encode(map[string]int{"game_id": nextID})
}

// Join a game
func joinGame(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := toInt(vars["id"])

	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", 400)
		return
	}

	gamesMu.Lock()
	game, ok := games[id]
	gamesMu.Unlock()
	if !ok {
		http.Error(w, "Game not found", 404)
		return
	}

	game.Lock.Lock()
	defer game.Lock.Unlock()
	if _, exists := game.Players[req.Name]; exists {
		http.Error(w, "Player already joined", 400)
		return
	}
	game.Players[req.Name] = &Player{Name: req.Name, Score: 0}
	json.NewEncoder(w).Encode(map[string]string{"status": "joined"})
}

// Get current question
func getQuestion(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := toInt(vars["id"])

	gamesMu.Lock()
	game, ok := games[id]
	gamesMu.Unlock()
	if !ok {
		http.Error(w, "Game not found", 404)
		return
	}

	game.Lock.Lock()
	defer game.Lock.Unlock()
	if game.CurrentQ >= len(game.Questions) {
		http.Error(w, "Game over", 400)
		return
	}

	q := game.Questions[game.CurrentQ]
	json.NewEncoder(w).Encode(map[string]interface{}{
		"text":    q.Text,
		"choices": q.Choices,
		"duration": q.Duration,
	})
}

// Submit an answer
func submitAnswer(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := toInt(vars["id"])

	var req struct {
		Name   string `json:"name"`
		Answer string `json:"answer"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", 400)
		return
	}

	gamesMu.Lock()
	game, ok := games[id]
	gamesMu.Unlock()
	if !ok {
		http.Error(w, "Game not found", 404)
		return
	}

	game.Lock.Lock()
	defer game.Lock.Unlock()

	if game.CurrentQ >= len(game.Questions) {
		http.Error(w, "Game over", 400)
		return
	}

	q := game.Questions[game.CurrentQ]
	elapsed := time.Since(game.StartTime).Seconds()
	if elapsed > float64(q.Duration) {
		http.Error(w, "Time expired", 400)
		return
	}

	player, ok := game.Players[req.Name]
	if !ok {
		http.Error(w, "Player not found", 404)
		return
	}

	if req.Answer == q.Answer {
		player.Score += 10
	} else {
		player.Score += 0
	}

	json.NewEncoder(w).Encode(map[string]string{"status": "answer recorded"})
}

// Get scores
func getScores(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := toInt(vars["id"])

	gamesMu.Lock()
	game, ok := games[id]
	gamesMu.Unlock()
	if !ok {
		http.Error(w, "Game not found", 404)
		return
	}

	game.Lock.Lock()
	defer game.Lock.Unlock()
	json.NewEncoder(w).Encode(game.Players)
}

func toInt(s string) int {
	var i int
	fmt.Sscan(s, &i)
	return i
}

func main() {
	r := mux.NewRouter()
	r.HandleFunc("/game", createGame).Methods("POST")
	r.HandleFunc("/game/{id}/join", joinGame).Methods("POST")
	r.HandleFunc("/game/{id}/question", getQuestion).Methods("GET")
	r.HandleFunc("/game/{id}/answer", submitAnswer).Methods("POST")
	r.HandleFunc("/game/{id}/score", getScores).Methods("GET")

	fmt.Println("Server running on :8080")
	log.Fatal(http.ListenAndServe(":8080", r))
}
