package client

import (
	"bytes"
	"encoding/json"
	"log"
	"math/rand"
	"net/http"
	"os"
	"reservation-system/repository_after/model"
	"sync"
	"time"
)

const (
	defaultServerURL = "http://localhost:8080"
	maxRetries       = 5
	baseBackoff      = 100 * time.Millisecond
)

func RunClient() {
	//  New(NewSource(seed)) to get different sequences on each
	rand.New(rand.NewSource(time.Now().UnixNano()))

	var wg sync.WaitGroup
	httpClient := &http.Client{
		Timeout: 2 * time.Second,
	}

	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			AttemptReserve(httpClient, workerID)
		}(i)
	}

	wg.Wait()
	log.Println("Client finished all requests")
}

func getServerUrl() string {
	if url := os.Getenv("SERVER_URL"); url != "" {
		return url
	}
	return defaultServerURL
}

func AttemptReserve(client *http.Client, workerID int) {
	payload := model.ReserveRequest{
		ResourceID: "item-1",
		Quantity:   1,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		log.Printf("[worker %d] JSON marshal error: %v", workerID, err)
		return
	}

	for attempt := 0; attempt < maxRetries; attempt++ {
		url := getServerUrl()
		req, err := http.NewRequest(http.MethodPost, url+"/reserve", bytes.NewBuffer(body))
		if err != nil {
			log.Printf("[worker %d] request creation error: %v", workerID, err)
			return
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := client.Do(req)
		if err != nil {
			log.Printf("[worker %d] connection error: %v", workerID, err)
			Backoff(attempt)
			continue
		}

		resp.Body.Close()

		if resp.StatusCode == http.StatusOK {
			log.Printf("[worker %d] reservation successful", workerID)
			return
		}

		if resp.StatusCode == http.StatusConflict {
			log.Printf("[worker %d] stock exhausted (409)", workerID)
			return
		}

		if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500 {
			log.Printf("[worker %d] retryable error %d", workerID, resp.StatusCode)
			Backoff(attempt)
			continue
		}

		log.Printf("[worker %d] unexpected status %d", workerID, resp.StatusCode)
		return
	}

	log.Printf("[worker %d] failed after %d attempts", workerID, maxRetries)
}

func Backoff(attempt int) {
	exp := baseBackoff * time.Duration(1<<attempt)
	jitter := time.Duration(rand.Int63n(int64(exp / 2)))
	time.Sleep(exp + jitter)
}
