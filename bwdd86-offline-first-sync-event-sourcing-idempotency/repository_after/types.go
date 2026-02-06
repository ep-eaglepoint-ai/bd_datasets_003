package offline_sync

import "time"

type OpType string

const (
	Increment OpType = "INCREMENT"
	Decrement OpType = "DECREMENT"
)

type Event struct {
	EventID string    `json:"event_id"`
	SKU     string    `json:"sku"`
	Type    OpType    `json:"type"`
	Qty     int       `json:"qty"`
	At      time.Time `json:"at"`
}

type SyncRequest struct {
	ClientID string  `json:"client_id"`
	BatchID  string  `json:"batch_id"`
	Events   []Event `json:"events"`
}

type SyncResponse struct {
	BatchID         string         `json:"batch_id"`
	Accepted        bool           `json:"accepted"`
	Reason          string         `json:"reason,omitempty"`
	RebaseRequired  bool           `json:"rebase_required"`
	ServerVersion   int64          `json:"server_version"`
	Inventory       map[string]int `json:"inventory"`
	ProcessedAsDup  bool           `json:"processed_as_duplicate"`
	ProcessedDupWhy string         `json:"processed_duplicate_reason,omitempty"`
}

type StateResponse struct {
	ServerVersion int64          `json:"server_version"`
	Inventory     map[string]int `json:"inventory"`
}

func copyInventory(src map[string]int) map[string]int {
	dst := make(map[string]int, len(src))
	for k, v := range src {
		dst[k] = v
	}
	return dst
}
