package offline_sync_test

import (
	"testing"
)

func TestReq4_OfflineQueueThenFlushWhenOnline(t *testing.T) {
	server := newTestServer(t)
	defer server.Close()

	client := newTestClient(t, server.URL)
	if err := client.RebaseFromServer(); err != nil {
		t.Fatalf("rebase: %v", err)
	}

	initial := fetchState(t, server.URL)

	client.SetOnline(false)
	client.RecordDecrement("gloves", 2)

	if err := client.FlushPending(); err != nil {
		t.Fatalf("flush offline: %v", err)
	}
	if client.Inflight != nil {
		t.Fatalf("expected no inflight batch while offline")
	}
	if len(client.PendingEvents) != 1 {
		t.Fatalf("expected pending events to remain while offline")
	}

	afterOffline := fetchState(t, server.URL)
	if afterOffline.Inventory["gloves"] != initial.Inventory["gloves"] {
		t.Fatalf("server inventory should not change while offline")
	}

	client.SetOnline(true)
	if err := client.FlushPending(); err != nil {
		t.Fatalf("flush online: %v", err)
	}
	if len(client.PendingEvents) != 0 || client.Inflight != nil {
		t.Fatalf("expected pending events cleared after flush")
	}

	afterOnline := fetchState(t, server.URL)
	if afterOnline.Inventory["gloves"] != initial.Inventory["gloves"]-2 {
		t.Fatalf("expected server inventory to apply queued event")
	}
}
