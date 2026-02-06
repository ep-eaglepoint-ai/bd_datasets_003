// client.go
//
// Disconnected Client Simulator (offline-first)
//
// Client model:
// - Maintains a local inventory mirror.
// - Applies operations optimistically while offline.
// - Buffers intent events (not final state) in a local queue.
// - When online, flushes the queued events as a single batch to the server.
//
// Critical behavior demonstrated:
// - Idempotent replay: if ACK is lost, client retries SAME BatchID + SAME events.
// - Atomicity handling: if server rejects (stock < 0), client must REBASE:
//   fetch true server state and clear its pending queue.

package offline_sync

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type Client struct {
	ID        string
	ServerURL string

	// Offline-first local state.
	LocalInventory map[string]int
	PendingEvents  []Event // local operation queue

	// Inflight batch:
	// When we start a flush, we freeze the batch ID and events.
	// If ACK is lost, we re-send the exact same batch again.
	Inflight *SyncRequest

	Online bool
	HTTP   *http.Client
}

func NewClient(id, serverURL string) *Client {
	return &Client{
		ID:             id,
		ServerURL:      serverURL,
		LocalInventory: map[string]int{},
		PendingEvents:  nil,
		Inflight:       nil,
		Online:         true,
		HTTP: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

func (c *Client) SetOnline(online bool) {
	c.Online = online
}

func (c *Client) RecordIncrement(sku string, qty int) {
	c.recordEvent(Increment, sku, qty)
}

func (c *Client) RecordDecrement(sku string, qty int) {
	c.recordEvent(Decrement, sku, qty)
}

func (c *Client) recordEvent(op OpType, sku string, qty int) {
	ev := Event{
		EventID: newID("evt"),
		SKU:     sku,
		Type:    op,
		Qty:     qty,
		At:      time.Now(),
	}

	// 1) Optimistic local apply (offline-first).
	applyLocal(c.LocalInventory, ev)

	// 2) Buffer the *intent event* (event sourcing).
	c.PendingEvents = append(c.PendingEvents, ev)

	fmt.Printf("[CLIENT] queued %-9s sku=%-8s qty=%d event_id=%s (local now=%d)\n",
		ev.Type, ev.SKU, ev.Qty, ev.EventID, c.LocalInventory[ev.SKU])
}

func applyLocal(inv map[string]int, ev Event) {
	switch ev.Type {
	case Increment:
		inv[ev.SKU] = inv[ev.SKU] + ev.Qty
	case Decrement:
		inv[ev.SKU] = inv[ev.SKU] - ev.Qty // optimistic: may go negative locally
	}
}

func (c *Client) RebaseFromServer() error {
	state, err := c.FetchServerState()
	if err != nil {
		return err
	}
	c.LocalInventory = copyInventory(state.Inventory)

	// When rebasing, we must clear our pending queue and inflight batch,
	// because our local intent history is no longer safely replayable.
	c.PendingEvents = nil
	c.Inflight = nil

	fmt.Printf("[CLIENT] REBASE complete. ServerVersion=%d LocalInventory=%v\n",
		state.ServerVersion, c.LocalInventory)
	return nil
}

func (c *Client) FetchServerState() (*StateResponse, error) {
	url := c.ServerURL + "/state"
	resp, err := c.HTTP.Get(url)
	if err != nil {
		return nil, fmt.Errorf("GET /state failed: %w", err)
	}
	defer resp.Body.Close()

	var out StateResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("decode /state: %w", err)
	}
	return &out, nil
}

// FlushPending sends the client's buffered intent events to the server.
// If ACK is lost, the client can call FlushPending again; it will resend the same Inflight batch.
func (c *Client) FlushPending() error {
	if !c.Online {
		fmt.Println("[CLIENT] offline -> not flushing")
		return nil
	}

	// If we don't have an inflight batch, create one from the current queue.
	if c.Inflight == nil {
		if len(c.PendingEvents) == 0 {
			fmt.Println("[CLIENT] nothing to flush")
			return nil
		}
		c.Inflight = &SyncRequest{
			ClientID: c.ID,
			BatchID:  newID("batch"),
			Events:   append([]Event(nil), c.PendingEvents...), // freeze snapshot
		}
		fmt.Printf("[CLIENT] created inflight batch=%s events=%d\n",
			c.Inflight.BatchID, len(c.Inflight.Events))
	}

	// Send inflight to server.
	res, status, err := c.postSync(*c.Inflight)
	if err != nil {
		fmt.Printf("[CLIENT] POST /sync failed (will retry later). err=%v\n", err)
		return err
	}

	if res.Accepted {
		fmt.Printf("[CLIENT] SYNC ACCEPTED batch=%s serverVersion=%d dup=%v\n",
			res.BatchID, res.ServerVersion, res.ProcessedAsDup)

		// Reconcile: set local inventory to server truth.
		c.LocalInventory = copyInventory(res.Inventory)

		// Clear queue + inflight (we're now consistent).
		c.PendingEvents = nil
		c.Inflight = nil
		return nil
	}

	// Rejected -> must rebase (per prompt).
	fmt.Printf("[CLIENT] SYNC REJECTED status=%d batch=%s reason=%s\n", status, res.BatchID, res.Reason)
	if res.RebaseRequired {
		fmt.Println("[CLIENT] server requires REBASE: fetching /state and clearing local queue")
		return c.RebaseFromServer()
	}
	return fmt.Errorf("sync rejected without rebase_required (unexpected): %s", res.Reason)
}

// FlushPendingSimulateAckLoss sends the batch but intentionally "loses" the acknowledgement,
// meaning we do NOT clear the inflight batch. Then the next FlushPending() will re-send the same batch.
//
// This simulates spotty 4G where the server processed the request, but the client never saw the response.
func (c *Client) FlushPendingSimulateAckLoss() error {
	if !c.Online {
		fmt.Println("[CLIENT] offline -> not flushing")
		return nil
	}

	// Ensure inflight exists.
	if c.Inflight == nil {
		if len(c.PendingEvents) == 0 {
			fmt.Println("[CLIENT] nothing to flush")
			return nil
		}
		c.Inflight = &SyncRequest{
			ClientID: c.ID,
			BatchID:  newID("batch"),
			Events:   append([]Event(nil), c.PendingEvents...),
		}
		fmt.Printf("[CLIENT] created inflight batch=%s events=%d\n",
			c.Inflight.BatchID, len(c.Inflight.Events))
	}

	// Send request, but "lose" the response (ignore it).
	_, _, err := c.postSyncIgnoreResponse(*c.Inflight)
	if err != nil {
		fmt.Printf("[CLIENT] simulated send failed: %v\n", err)
		return err
	}

	fmt.Printf("[CLIENT] ACK LOST (simulated). Will retry SAME batch=%s later.\n", c.Inflight.BatchID)
	// IMPORTANT: We intentionally do NOT clear PendingEvents or Inflight here.
	return fmt.Errorf("simulated ack loss")
}

func (c *Client) postSync(req SyncRequest) (*SyncResponse, int, error) {
	url := c.ServerURL + "/sync"

	body, err := json.Marshal(req)
	if err != nil {
		return nil, 0, fmt.Errorf("marshal sync request: %w", err)
	}

	httpReq, err := http.NewRequest("POST", url, bytes.NewReader(body))
	if err != nil {
		return nil, 0, fmt.Errorf("new request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTP.Do(httpReq)
	if err != nil {
		return nil, 0, fmt.Errorf("do request: %w", err)
	}
	defer resp.Body.Close()

	var out SyncResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, resp.StatusCode, fmt.Errorf("decode sync response: %w", err)
	}

	return &out, resp.StatusCode, nil
}

func (c *Client) postSyncIgnoreResponse(req SyncRequest) (*http.Response, int, error) {
	url := c.ServerURL + "/sync"

	body, err := json.Marshal(req)
	if err != nil {
		return nil, 0, fmt.Errorf("marshal sync request: %w", err)
	}

	httpReq, err := http.NewRequest("POST", url, bytes.NewReader(body))
	if err != nil {
		return nil, 0, fmt.Errorf("new request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTP.Do(httpReq)
	if err != nil {
		return nil, 0, fmt.Errorf("do request: %w", err)
	}

	// "Lose" the ACK: we discard the body and do not parse it.
	_, _ = io.Copy(io.Discard, resp.Body)
	_ = resp.Body.Close()

	return resp, resp.StatusCode, nil
}

func newID(prefix string) string {
	// Standard library only "UUID-ish" random ID.
	// 16 random bytes -> 32 hex chars.
	var b [16]byte
	_, _ = rand.Read(b[:])
	return fmt.Sprintf("%s_%s", prefix, hex.EncodeToString(b[:]))
}

func (c *Client) PrintLocalState() {
	fmt.Printf("[CLIENT] Online=%v Pending=%d Inflight=%v LocalInventory=%v\n",
		c.Online,
		len(c.PendingEvents),
		func() string {
			if c.Inflight == nil {
				return "<nil>"
			}
			return fmt.Sprintf("{batch=%s events=%d}", c.Inflight.BatchID, len(c.Inflight.Events))
		}(),
		c.LocalInventory,
	)
}

