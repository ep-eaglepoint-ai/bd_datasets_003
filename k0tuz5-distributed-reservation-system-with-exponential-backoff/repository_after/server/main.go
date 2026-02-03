package main

import (
	"encoding/json"
	"log"
	"net/http"

	"reservation-system/repository_after/model"
)

func main() {
	inventory := &model.Inventory{
		Items: map[string]int{
			"item-1": 100,
		},
	}

	rateLimiter := model.NewRateLimiter(100)

	http.HandleFunc("/reserve", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		if !rateLimiter.Allow() {
			http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
			return
		}

		defer r.Body.Close()

		var req model.ReserveRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid json payload", http.StatusBadRequest)
			return
		}

		if req.Quantity <= 0 {
			http.Error(w, "quantity must be positive", http.StatusBadRequest)
			return
		}

		inventory.Mu.Lock()
		defer inventory.Mu.Unlock()

		current := inventory.Items[req.ResourceID]
		if current < req.Quantity {
			http.Error(w, "insufficient stock", http.StatusConflict)
			return
		}

		inventory.Items[req.ResourceID] -= req.Quantity
		log.Printf("Stock after: %d", inventory.Items[req.ResourceID])

		w.WriteHeader(http.StatusOK)
		w.Write([]byte("reservation successful"))
	})

	log.Println("Server listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
