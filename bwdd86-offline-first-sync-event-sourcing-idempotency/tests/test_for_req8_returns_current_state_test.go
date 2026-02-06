package offline_sync_test

import (
	"testing"
	"time"

	offline_sync "offline_sync"
)

func TestReq8_ReturnsCurrentStateAfterSync(t *testing.T) {
	server := newTestServer(t)
	defer server.Close()

	req := offline_sync.SyncRequest{
		ClientID: "agent-1",
		BatchID:  "batch-req8",
		Events: []offline_sync.Event{
			{
				EventID: "evt-req8-1",
				SKU:     "gloves",
				Type:    offline_sync.Decrement,
				Qty:     1,
				At:      time.Now(),
			},
		},
	}

	res, status := postSync(t, server.URL, req)
	if status != 200 || !res.Accepted {
		t.Fatalf("expected accepted sync")
	}

	state := fetchState(t, server.URL)
	if res.ServerVersion != state.ServerVersion {
		t.Fatalf("expected response version to match state")
	}
	if res.Inventory["gloves"] != state.Inventory["gloves"] {
		t.Fatalf("expected response inventory to match state")
	}
}
