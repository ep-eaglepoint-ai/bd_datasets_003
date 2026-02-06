package offline_sync_test

import (
	"testing"
	"time"

	offline_sync "offline_sync"
)

func TestReq2_RejectsEmptyEventList(t *testing.T) {
	server := newTestServer(t)
	defer server.Close()

	res, status := postSync(t, server.URL, offline_sync.SyncRequest{
		ClientID: "agent-1",
		BatchID:  "batch-empty",
		Events:   []offline_sync.Event{},
	})

	if status != 400 {
		t.Fatalf("expected status 400, got %d", status)
	}
	if res.Accepted {
		t.Fatalf("expected batch rejected")
	}
}

func TestReq2_ClientSendsIntentEvents(t *testing.T) {
	server := newTestServer(t)
	defer server.Close()

	client := newTestClient(t, server.URL)
	if err := client.RebaseFromServer(); err != nil {
		t.Fatalf("rebase: %v", err)
	}
	initial := fetchState(t, server.URL)

	client.SetOnline(false)
	client.RecordIncrement("bandage", 2)
	if len(client.PendingEvents) != 1 {
		t.Fatalf("expected 1 pending event, got %d", len(client.PendingEvents))
	}

	client.SetOnline(true)
	if err := client.FlushPending(); err != nil {
		t.Fatalf("flush: %v", err)
	}

	state := fetchState(t, server.URL)
	if state.Inventory["bandage"] != initial.Inventory["bandage"]+2 {
		t.Fatalf("expected bandage inventory to increase after intent events, got %d", state.Inventory["bandage"])
	}
}

func TestReq2_EventsContainTypeAndQty(t *testing.T) {
	server := newTestServer(t)
	defer server.Close()

	req := offline_sync.SyncRequest{
		ClientID: "agent-1",
		BatchID:  "batch-evt-1",
		Events: []offline_sync.Event{
			{
				EventID: "evt-1",
				SKU:     "gloves",
				Type:    offline_sync.Increment,
				Qty:     1,
				At:      time.Now(),
			},
		},
	}

	res, status := postSync(t, server.URL, req)
	if status != 200 || !res.Accepted {
		t.Fatalf("expected accepted sync, status=%d accepted=%v", status, res.Accepted)
	}
}
