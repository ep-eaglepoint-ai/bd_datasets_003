package api

import (
	"context"
	"errors"
	"time"

	"github.com/vzdtic/distributed-consensus-raft-kv-store/repository_after/pkg/raft"
)

// Client provides a client interface to the Raft KV store
type Client struct {
	nodes   []*raft.Node
	timeout time.Duration
}

// NewClient creates a new client
func NewClient(nodes []*raft.Node) *Client {
	return &Client{
		nodes:   nodes,
		timeout: 5 * time.Second,
	}
}

// Set sets a key-value pair
func (c *Client) Set(ctx context.Context, key, value string) error {
	leader := c.findLeader()
	if leader == nil {
		return errors.New("no leader available")
	}

	cmd := raft.Command{
		Type:  raft.CommandSet,
		Key:   key,
		Value: value,
	}

	_, err := leader.SubmitWithResult(ctx, cmd)
	return err
}

// Get retrieves a value by key
func (c *Client) Get(ctx context.Context, key string) (string, error) {
	leader := c.findLeader()
	if leader == nil {
		return "", errors.New("no leader available")
	}

	return leader.Read(ctx, key)
}

// Delete removes a key
func (c *Client) Delete(ctx context.Context, key string) error {
	leader := c.findLeader()
	if leader == nil {
		return errors.New("no leader available")
	}

	cmd := raft.Command{
		Type: raft.CommandDelete,
		Key:  key,
	}

	_, err := leader.SubmitWithResult(ctx, cmd)
	return err
}

// findLeader finds the current leader node
func (c *Client) findLeader() *raft.Node {
	for _, node := range c.nodes {
		if node.IsLeader() {
			return node
		}
	}
	return nil
}

// SetTimeout sets the client timeout
func (c *Client) SetTimeout(d time.Duration) {
	c.timeout = d
}