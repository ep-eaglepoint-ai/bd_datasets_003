package offline_sync_test

import (
	"testing"
)

func TestReq5_IdempotentBatchReplay(t *testing.T) {
	server := newTestServer(t)
	defer server.Close()

	client := newTestClient(t, server.URL)
	if err := client.RebaseFromServer(); err != nil {
		t.Fatalf("rebase: %v", err)
	}

	initial := fetchState(t, server.URL)

	client.RecordIncrement("bandage", 2)
	client.SetOnline(true)

	_ = client.FlushPendingSimulateAckLoss()
	stateAfterFirst := fetchState(t, server.URL)

	if err := client.FlushPending(); err != nil {
		t.Fatalf("retry flush: %v", err)
	}
	stateAfterSecond := fetchState(t, server.URL)

	if stateAfterFirst.ServerVersion != stateAfterSecond.ServerVersion {
		t.Fatalf("expected idempotent replay with stable version, got %d then %d", stateAfterFirst.ServerVersion, stateAfterSecond.ServerVersion)
	}
	if stateAfterFirst.Inventory["bandage"] != initial.Inventory["bandage"]+2 {
		t.Fatalf("expected bandage increment once, got %d", stateAfterFirst.Inventory["bandage"])
	}
	if stateAfterSecond.Inventory["bandage"] != stateAfterFirst.Inventory["bandage"] {
		t.Fatalf("expected no further change on replay")
	}
}
