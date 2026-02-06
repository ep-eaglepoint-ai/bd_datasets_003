package offline_sync_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	offline_sync "offline_sync"
)

func newTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	server := offline_sync.NewInventoryServer()
	return httptest.NewServer(server.Handler())
}

func newTestClient(t *testing.T, serverURL string) *offline_sync.Client {
	t.Helper()
	client := offline_sync.NewClient("test-agent", serverURL)
	client.HTTP.Timeout = 2 * time.Second
	return client
}

func postSync(t *testing.T, serverURL string, req offline_sync.SyncRequest) (*offline_sync.SyncResponse, int) {
	t.Helper()
	body, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal sync request: %v", err)
	}

	httpReq, err := http.NewRequest("POST", serverURL+"/sync", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		t.Fatalf("POST /sync failed: %v", err)
	}
	defer resp.Body.Close()

	var out offline_sync.SyncResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode sync response: %v", err)
	}

	return &out, resp.StatusCode
}

func fetchState(t *testing.T, serverURL string) *offline_sync.StateResponse {
	t.Helper()
	resp, err := http.Get(serverURL + "/state")
	if err != nil {
		t.Fatalf("GET /state failed: %v", err)
	}
	defer resp.Body.Close()

	var out offline_sync.StateResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode /state: %v", err)
	}
	return &out
}
