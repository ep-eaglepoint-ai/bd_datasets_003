package rpc

import (
	"context"
	"encoding/gob"
	"fmt"
	"net"
	"sync"
	"time"

	"github.com/vzdtic/raft-kv-store/repository_after/pkg/raft"
)

// Client is a simple RPC client for Raft communication
type Client struct {
	mu      sync.RWMutex
	conns   map[string]net.Conn
	timeout time.Duration
}

// NewClient creates a new RPC client
func NewClient(timeout time.Duration) *Client {
	return &Client{
		conns:   make(map[string]net.Conn),
		timeout: timeout,
	}
}

// Transport implements the raft.Transport interface
type Transport struct {
	client *Client
}

// NewTransport creates a new transport
func NewTransport() *Transport {
	return &Transport{
		client: NewClient(100 * time.Millisecond),
	}
}

// RequestVote sends a RequestVote RPC
func (t *Transport) RequestVote(ctx context.Context, target string, req *raft.RequestVoteRequest) (*raft.RequestVoteResponse, error) {
	conn, err := t.client.getConn(target)
	if err != nil {
		return nil, err
	}

	// Encode request
	enc := gob.NewEncoder(conn)
	if err := enc.Encode("RequestVote"); err != nil {
		t.client.removeConn(target)
		return nil, err
	}
	if err := enc.Encode(req); err != nil {
		t.client.removeConn(target)
		return nil, err
	}

	// Decode response
	var resp raft.RequestVoteResponse
	dec := gob.NewDecoder(conn)
	if err := dec.Decode(&resp); err != nil {
		t.client.removeConn(target)
		return nil, err
	}

	return &resp, nil
}

// AppendEntries sends an AppendEntries RPC
func (t *Transport) AppendEntries(ctx context.Context, target string, req *raft.AppendEntriesRequest) (*raft.AppendEntriesResponse, error) {
	conn, err := t.client.getConn(target)
	if err != nil {
		return nil, err
	}

	// Encode request
	enc := gob.NewEncoder(conn)
	if err := enc.Encode("AppendEntries"); err != nil {
		t.client.removeConn(target)
		return nil, err
	}
	if err := enc.Encode(req); err != nil {
		t.client.removeConn(target)
		return nil, err
	}

	// Decode response
	var resp raft.AppendEntriesResponse
	dec := gob.NewDecoder(conn)
	if err := dec.Decode(&resp); err != nil {
		t.client.removeConn(target)
		return nil, err
	}

	return &resp, nil
}

// InstallSnapshot sends an InstallSnapshot RPC
func (t *Transport) InstallSnapshot(ctx context.Context, target string, req *raft.InstallSnapshotRequest) (*raft.InstallSnapshotResponse, error) {
	conn, err := t.client.getConn(target)
	if err != nil {
		return nil, err
	}

	// Encode request
	enc := gob.NewEncoder(conn)
	if err := enc.Encode("InstallSnapshot"); err != nil {
		t.client.removeConn(target)
		return nil, err
	}
	if err := enc.Encode(req); err != nil {
		t.client.removeConn(target)
		return nil, err
	}

	// Decode response
	var resp raft.InstallSnapshotResponse
	dec := gob.NewDecoder(conn)
	if err := dec.Decode(&resp); err != nil {
		t.client.removeConn(target)
		return nil, err
	}

	return &resp, nil
}

// getConn gets or creates a connection to target
func (c *Client) getConn(target string) (net.Conn, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if conn, ok := c.conns[target]; ok {
		return conn, nil
	}

	conn, err := net.DialTimeout("tcp", target, c.timeout)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to %s: %w", target, err)
	}

	c.conns[target] = conn
	return conn, nil
}

// removeConn removes a connection
func (c *Client) removeConn(target string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if conn, ok := c.conns[target]; ok {
		conn.Close()
		delete(c.conns, target)
	}
}

// Close closes all connections
func (c *Client) Close() {
	c.mu.Lock()
	defer c.mu.Unlock()

	for target, conn := range c.conns {
		conn.Close()
		delete(c.conns, target)
	}
}