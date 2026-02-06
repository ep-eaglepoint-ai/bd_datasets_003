package offline_sync_test

import (
	"testing"
)

func TestReq6_AtomicityAndRebaseOnReject(t *testing.T) {
	server := newTestServer(t)
	defer server.Close()

	client := newTestClient(t, server.URL)
	if err := client.RebaseFromServer(); err != nil {
		t.Fatalf("rebase: %v", err)
	}

	before := fetchState(t, server.URL)

	client.SetOnline(false)
	client.RecordDecrement("bandage", 2)
	client.RecordDecrement("syringe", 999)

	client.SetOnline(true)
	if err := client.FlushPending(); err != nil {
		t.Fatalf("flush: %v", err)
	}

	after := fetchState(t, server.URL)
	if after.Inventory["bandage"] != before.Inventory["bandage"] || after.Inventory["syringe"] != before.Inventory["syringe"] {
		t.Fatalf("expected atomic rollback; inventory should be unchanged")
	}

	if len(client.PendingEvents) != 0 || client.Inflight != nil {
		t.Fatalf("expected client to clear pending/inflight after rebase")
	}

	if client.LocalInventory["bandage"] != after.Inventory["bandage"] || client.LocalInventory["syringe"] != after.Inventory["syringe"] {
		t.Fatalf("expected client to reconcile to server state after rebase")
	}
}
