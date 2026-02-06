package offline_sync_test

import (
	"testing"
)

func TestReq3_OptimisticLocalApply(t *testing.T) {
	server := newTestServer(t)
	defer server.Close()

	client := newTestClient(t, server.URL)
	if err := client.RebaseFromServer(); err != nil {
		t.Fatalf("rebase: %v", err)
	}

	client.SetOnline(false)
	before := client.LocalInventory["bandage"]
	client.RecordDecrement("bandage", 3)
	client.RecordIncrement("bandage", 1)

	if len(client.PendingEvents) != 2 {
		t.Fatalf("expected 2 pending events, got %d", len(client.PendingEvents))
	}
	if client.LocalInventory["bandage"] != before-2 {
		t.Fatalf("expected optimistic local update, got %d", client.LocalInventory["bandage"])
	}
}
