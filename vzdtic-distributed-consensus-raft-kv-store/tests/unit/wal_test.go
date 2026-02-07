package unit

import (
	"os"
	"testing"

	"github.com/vzdtic/raft-kv-store/repository_after/pkg/wal"
)

func TestWALNew(t *testing.T) {
	dir := t.TempDir()
	w, err := wal.New(dir)
	if err != nil {
		t.Fatalf("Failed to create WAL: %v", err)
	}
	defer w.Close()

	if w.GetLastIndex() != 0 {
		t.Errorf("Expected last index 0, got %d", w.GetLastIndex())
	}
}

func TestWALAppendEntries(t *testing.T) {
	dir := t.TempDir()
	w, err := wal.New(dir)
	if err != nil {
		t.Fatalf("Failed to create WAL: %v", err)
	}
	defer w.Close()

	entries := []wal.Entry{
		{Term: 1, Index: 1, Command: []byte("cmd1"), Type: wal.EntryNormal},
		{Term: 1, Index: 2, Command: []byte("cmd2"), Type: wal.EntryNormal},
		{Term: 2, Index: 3, Command: []byte("cmd3"), Type: wal.EntryNormal},
	}

	if err := w.AppendEntries(entries); err != nil {
		t.Fatalf("Failed to append entries: %v", err)
	}

	if w.GetLastIndex() != 3 {
		t.Errorf("Expected last index 3, got %d", w.GetLastIndex())
	}

	if w.GetLastTerm() != 2 {
		t.Errorf("Expected last term 2, got %d", w.GetLastTerm())
	}
}

func TestWALGetEntry(t *testing.T) {
	dir := t.TempDir()
	w, err := wal.New(dir)
	if err != nil {
		t.Fatalf("Failed to create WAL: %v", err)
	}
	defer w.Close()

	entries := []wal.Entry{
		{Term: 1, Index: 1, Command: []byte("cmd1"), Type: wal.EntryNormal},
		{Term: 1, Index: 2, Command: []byte("cmd2"), Type: wal.EntryNormal},
	}

	if err := w.AppendEntries(entries); err != nil {
		t.Fatalf("Failed to append entries: %v", err)
	}

	entry := w.GetEntry(1)
	if entry == nil {
		t.Fatal("Expected to find entry at index 1")
	}

	if string(entry.Command) != "cmd1" {
		t.Errorf("Expected command 'cmd1', got '%s'", string(entry.Command))
	}
}

func TestWALTruncateAfter(t *testing.T) {
	dir := t.TempDir()
	w, err := wal.New(dir)
	if err != nil {
		t.Fatalf("Failed to create WAL: %v", err)
	}
	defer w.Close()

	entries := []wal.Entry{
		{Term: 1, Index: 1, Command: []byte("cmd1"), Type: wal.EntryNormal},
		{Term: 1, Index: 2, Command: []byte("cmd2"), Type: wal.EntryNormal},
		{Term: 1, Index: 3, Command: []byte("cmd3"), Type: wal.EntryNormal},
	}

	if err := w.AppendEntries(entries); err != nil {
		t.Fatalf("Failed to append entries: %v", err)
	}

	if err := w.TruncateAfter(1); err != nil {
		t.Fatalf("Failed to truncate: %v", err)
	}

	if w.GetLastIndex() != 1 {
		t.Errorf("Expected last index 1, got %d", w.GetLastIndex())
	}
}

func TestWALPersistence(t *testing.T) {
	dir := t.TempDir()

	// Create and write
	w1, err := wal.New(dir)
	if err != nil {
		t.Fatalf("Failed to create WAL: %v", err)
	}

	entries := []wal.Entry{
		{Term: 1, Index: 1, Command: []byte("cmd1"), Type: wal.EntryNormal},
	}

	if err := w1.Save(1, "node1", entries); err != nil {
		t.Fatalf("Failed to save: %v", err)
	}
	w1.Close()

	// Reopen and verify
	w2, err := wal.New(dir)
	if err != nil {
		t.Fatalf("Failed to reopen WAL: %v", err)
	}
	defer w2.Close()

	if w2.GetCurrentTerm() != 1 {
		t.Errorf("Expected term 1, got %d", w2.GetCurrentTerm())
	}

	if w2.GetVotedFor() != "node1" {
		t.Errorf("Expected votedFor 'node1', got '%s'", w2.GetVotedFor())
	}
}

func TestWALSnapshot(t *testing.T) {
	dir := t.TempDir()
	w, err := wal.New(dir)
	if err != nil {
		t.Fatalf("Failed to create WAL: %v", err)
	}
	defer w.Close()

	// Add entries
	entries := []wal.Entry{
		{Term: 1, Index: 1, Command: []byte("cmd1"), Type: wal.EntryNormal},
		{Term: 1, Index: 2, Command: []byte("cmd2"), Type: wal.EntryNormal},
		{Term: 1, Index: 3, Command: []byte("cmd3"), Type: wal.EntryNormal},
	}

	if err := w.AppendEntries(entries); err != nil {
		t.Fatalf("Failed to append entries: %v", err)
	}

	// Save snapshot
	snapshot := wal.Snapshot{
		Metadata: wal.SnapshotMetadata{
			LastIncludedIndex: 2,
			LastIncludedTerm:  1,
			Configuration: []wal.ClusterMember{
				{NodeID: "node1", Address: "localhost:9001", Voting: true},
			},
		},
		Data: []byte("snapshot data"),
	}

	if err := w.SaveSnapshot(snapshot); err != nil {
		t.Fatalf("Failed to save snapshot: %v", err)
	}

	// Verify entries after snapshot were compacted
	if w.Size() != 1 {
		t.Errorf("Expected 1 entry after snapshot, got %d", w.Size())
	}

	// Load snapshot
	loaded, err := w.LoadSnapshot()
	if err != nil {
		t.Fatalf("Failed to load snapshot: %v", err)
	}

	if loaded.Metadata.LastIncludedIndex != 2 {
		t.Errorf("Expected last included index 2, got %d", loaded.Metadata.LastIncludedIndex)
	}
}

func TestMain(m *testing.M) {
	os.Exit(m.Run())
}