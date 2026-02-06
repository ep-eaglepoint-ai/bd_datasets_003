package offline_sync_test

import (
	"testing"
	"time"

	offline_sync "offline_sync"
)

func TestExtra_DuplicateEventIDInBatchRejected(t *testing.T) {
	server := newTestServer(t)
	defer server.Close()

	req := offline_sync.SyncRequest{
		ClientID: "agent-1",
		BatchID:  "batch-dup-1",
		Events: []offline_sync.Event{
			{
				EventID: "evt-dup",
				SKU:     "bandage",
				Type:    offline_sync.Increment,
				Qty:     1,
				At:      time.Now(),
			},
			{
				EventID: "evt-dup",
				SKU:     "bandage",
				Type:    offline_sync.Increment,
				Qty:     1,
				At:      time.Now(),
			},
		},
	}

	res, status := postSync(t, server.URL, req)
	if status != 400 || res.Accepted {
		t.Fatalf("expected duplicate event_id rejection, status=%d accepted=%v", status, res.Accepted)
	}
}

func TestExtra_DuplicateEventIDAcrossBatchesRejected(t *testing.T) {
	server := newTestServer(t)
	defer server.Close()

	first := offline_sync.SyncRequest{
		ClientID: "agent-1",
		BatchID:  "batch-dup-2",
		Events: []offline_sync.Event{
			{
				EventID: "evt-dup-cross",
				SKU:     "gloves",
				Type:    offline_sync.Increment,
				Qty:     1,
				At:      time.Now(),
			},
		},
	}
	res, status := postSync(t, server.URL, first)
	if status != 200 || !res.Accepted {
		t.Fatalf("expected first batch accepted, status=%d accepted=%v", status, res.Accepted)
	}

	second := offline_sync.SyncRequest{
		ClientID: "agent-1",
		BatchID:  "batch-dup-3",
		Events: []offline_sync.Event{
			{
				EventID: "evt-dup-cross",
				SKU:     "gloves",
				Type:    offline_sync.Increment,
				Qty:     1,
				At:      time.Now(),
			},
		},
	}
	res2, status2 := postSync(t, server.URL, second)
	if status2 != 409 || res2.Accepted {
		t.Fatalf("expected duplicate event_id across batches rejection, status=%d accepted=%v", status2, res2.Accepted)
	}
}
