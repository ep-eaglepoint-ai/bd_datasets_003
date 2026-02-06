package offline_sync_test

import (
	"testing"
	"time"

	offline_sync "offline_sync"
)

func TestReq9_FinalStateFormulaAppliedOnce(t *testing.T) {
	server := newTestServer(t)
	defer server.Close()

	initial := fetchState(t, server.URL)

	req := offline_sync.SyncRequest{
		ClientID: "agent-1",
		BatchID:  "batch-req9",
		Events: []offline_sync.Event{
			{
				EventID: "evt-req9-1",
				SKU:     "bandage",
				Type:    offline_sync.Increment,
				Qty:     4,
				At:      time.Now(),
			},
			{
				EventID: "evt-req9-2",
				SKU:     "syringe",
				Type:    offline_sync.Decrement,
				Qty:     2,
				At:      time.Now(),
			},
			{
				EventID: "evt-req9-3",
				SKU:     "gloves",
				Type:    offline_sync.Increment,
				Qty:     3,
				At:      time.Now(),
			},
		},
	}

	res, status := postSync(t, server.URL, req)
	if status != 200 || !res.Accepted {
		t.Fatalf("expected accepted sync, status=%d accepted=%v", status, res.Accepted)
	}

	state := fetchState(t, server.URL)
	if state.Inventory["bandage"] != initial.Inventory["bandage"]+4 {
		t.Fatalf("expected bandage to increment once")
	}
	if state.Inventory["syringe"] != initial.Inventory["syringe"]-2 {
		t.Fatalf("expected syringe to decrement once")
	}
	if state.Inventory["gloves"] != initial.Inventory["gloves"]+3 {
		t.Fatalf("expected gloves to increment once")
	}
}
