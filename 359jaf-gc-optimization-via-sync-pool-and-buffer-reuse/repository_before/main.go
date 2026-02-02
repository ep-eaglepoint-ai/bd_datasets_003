package main

import (
	"encoding/json"
	"fmt"
	"io"
	"time"
)

// BidResponse represents the complex object we send back 100k times/sec
type BidResponse struct {
	ID        string  `json:"id"`
	BidID     string  `json:"bid_id"`
	Price     float64 `json:"price"`
	Currency  string  `json:"cur"`
	AdMarkup  string  `json:"adm"`
	WinUrl    string  `json:"nurl"`
	Timestamp int64   `json:"ts"`
}

// SerializeBidResponse writes the JSON representation of the bid to w.
//
// OPTIMIZATION TARGET:
// This function allocates a new buffer and new encoder every time.
// It generates massive GC pressure under load.
func SerializeBidResponse(w io.Writer, bid *BidResponse) error {
	// BAD: Allocating a new buffer on the heap every single call.
	// This causes 1 alloc for the buffer structure, 1 for the internal slice.
	// plus json.Marshal logic would cause more.
	
	// We use Encoder here, but we are still creating the buffer wrapper 
	// and throwing it away instantly.
	
	// In a real high-perf scenario, even the Encoder might be pooled, 
	// but let's focus on the Buffer first.
	
	buf := new(bytes.Buffer) // Allocation #1
	enc := json.NewEncoder(buf) // Allocation #2 (Encoder struct)
	
	if err := enc.Encode(bid); err != nil {
		return err
	}
	
	// Write to the actual output
	if _, err := w.Write(buf.Bytes()); err != nil {
		return err
	}
	
	return nil
}

// Mock usage to demonstrate the function signature
func main() {
	bid := &BidResponse{
		ID:        "1234-5678",
		BidID:     "bid-999",
		Price:     5.25,
		Currency:  "USD",
		AdMarkup:  "<div>ads</div>",
		WinUrl:    "http://ads.com/win",
		Timestamp: time.Now().Unix(),
	}
	
	// Simulate a run
	SerializeBidResponse(io.Discard, bid)
	fmt.Println("Serialization ran successfully (run benchmark to see perf).")
}

// Minimal shim for the before-code to compile
import "bytes"