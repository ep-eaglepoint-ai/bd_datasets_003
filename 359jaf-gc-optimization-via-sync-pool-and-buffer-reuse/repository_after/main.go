package gc_optimization

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"sync"
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

// Create a pool for bytes.Buffer.
var bufferPool = sync.Pool{
	New: func() interface{} {
		return bytes.NewBuffer(make([]byte, 0, 1024))
	},
}

// SerializeBidResponse writes the JSON representation of the bid to w.
func SerializeBidResponse(w io.Writer, bid *BidResponse) error {
	// Retrieve a buffer from the pool
	buf := bufferPool.Get().(*bytes.Buffer)

	// Ensure the buffer is returned and scrubbed
	defer func() {
		buf.Reset()
		bufferPool.Put(buf)
	}()

	// Use NewEncoder directly on the pooled buffer.
	enc := json.NewEncoder(buf)

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
