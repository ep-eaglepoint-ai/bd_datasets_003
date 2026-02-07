package unit

import (
	"testing"

	"github.com/vzdtic/raft-kv-store/repository_after/pkg/kv"
)

func TestKVStore(t *testing.T) {
	store := kv.New()

	// Test Set
	cmd, err := kv.EncodeCommand(kv.CommandSet, "key1", []byte("value1"), "client1", 1)
	if err != nil {
		t.Fatalf("Failed to encode command: %v", err)
	}

	_, err = store.Apply(cmd)
	if err != nil {
		t.Fatalf("Failed to apply command: %v", err)
	}

	// Test Get
	value, found := store.Get("key1")
	if !found {
		t.Fatal("Expected to find key1")
	}

	if string(value) != "value1" {
		t.Errorf("Expected 'value1', got '%s'", string(value))
	}
}

func TestKVDelete(t *testing.T) {
	store := kv.New()

	// Set key
	setCmd, _ := kv.EncodeCommand(kv.CommandSet, "key1", []byte("value1"), "client1", 1)
	store.Apply(setCmd)

	// Delete key
	delCmd, _ := kv.EncodeCommand(kv.CommandDelete, "key1", nil, "client1", 2)
	store.Apply(delCmd)

	// Verify deletion
	_, found := store.Get("key1")
	if found {
		t.Error("Expected key1 to be deleted")
	}
}

func TestKVSnapshot(t *testing.T) {
	store := kv.New()

	// Set keys
	cmd1, _ := kv.EncodeCommand(kv.CommandSet, "key1", []byte("value1"), "client1", 1)
	cmd2, _ := kv.EncodeCommand(kv.CommandSet, "key2", []byte("value2"), "client1", 2)
	store.Apply(cmd1)
	store.Apply(cmd2)

	// Create snapshot
	data, err := store.Snapshot()
	if err != nil {
		t.Fatalf("Failed to create snapshot: %v", err)
	}

	// Create new store and restore
	store2 := kv.New()
	if err := store2.Restore(data); err != nil {
		t.Fatalf("Failed to restore snapshot: %v", err)
	}

	// Verify restoration
	value, found := store2.Get("key1")
	if !found || string(value) != "value1" {
		t.Error("Failed to restore key1")
	}

	value, found = store2.Get("key2")
	if !found || string(value) != "value2" {
		t.Error("Failed to restore key2")
	}
}

func TestKVDuplicateRequest(t *testing.T) {
	store := kv.New()

	// Apply same request twice
	cmd, _ := kv.EncodeCommand(kv.CommandSet, "key1", []byte("value1"), "client1", 1)
	store.Apply(cmd)

	// Apply again with same client and request ID
	cmd2, _ := kv.EncodeCommand(kv.CommandSet, "key1", []byte("value2"), "client1", 1)
	store.Apply(cmd2)

	// Value should still be value1 (duplicate was ignored)
	value, _ := store.Get("key1")
	if string(value) != "value1" {
		t.Errorf("Expected 'value1', got '%s' - duplicate not detected", string(value))
	}
}