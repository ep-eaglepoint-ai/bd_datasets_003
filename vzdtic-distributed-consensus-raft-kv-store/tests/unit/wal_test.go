package unit

import (
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

	entries := []wal.Entry{
		{Term: 1, Index: 1, Command: []byte("cmd1"), Type: wal.EntryNormal},
		{Term: 1, Index: 2, Command: []byte("cmd2"), Type: wal.EntryNormal},
		{Term: 1, Index: 3, Command: []byte("cmd3"), Type: wal.EntryNormal},
	}

	if err := w.AppendEntries(entries); err != nil {
		t.Fatalf("Failed to append entries: %v", err)
	}

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

	if w.Size() != 1 {
		t.Errorf("Expected 1 entry after snapshot, got %d", w.Size())
	}

	loaded, err := w.LoadSnapshot()
	if err != nil {
		t.Fatalf("Failed to load snapshot: %v", err)
	}

	if loaded.Metadata.LastIncludedIndex != 2 {
		t.Errorf("Expected last included index 2, got %d", loaded.Metadata.LastIncludedIndex)
	}
}

func TestWALByteSizeThreshold(t *testing.T) {
	dir := t.TempDir()
	
	// Create WAL with small threshold
	w, err := wal.NewWithThreshold(dir, 100) // 100 bytes threshold
	if err != nil {
		t.Fatalf("Failed to create WAL: %v", err)
	}
	defer w.Close()

	// Initially should not need compaction
	if w.NeedsCompaction() {
		t.Error("Fresh WAL should not need compaction")
	}

	// Add entries to exceed threshold
	largeCommand := make([]byte, 200)
	entries := []wal.Entry{
		{Term: 1, Index: 1, Command: largeCommand, Type: wal.EntryNormal},
	}

	if err := w.AppendEntries(entries); err != nil {
		t.Fatalf("Failed to append entries: %v", err)
	}

	// Should need compaction now
	if !w.NeedsCompaction() {
		t.Errorf("WAL should need compaction, byteSize=%d, threshold=%d", 
			w.ByteSize(), w.GetByteSizeThreshold())
	}

	// Test setting threshold
	w.SetByteSizeThreshold(1000)
	if w.NeedsCompaction() {
		t.Error("Should not need compaction after increasing threshold")
	}
}

func TestWALByteSizeTracking(t *testing.T) {
	dir := t.TempDir()
	w, err := wal.New(dir)
	if err != nil {
		t.Fatalf("Failed to create WAL: %v", err)
	}
	defer w.Close()

	initialSize := w.ByteSize()

	entries := []wal.Entry{
		{Term: 1, Index: 1, Command: []byte("command1"), Type: wal.EntryNormal},
		{Term: 1, Index: 2, Command: []byte("command2"), Type: wal.EntryNormal},
	}

	if err := w.AppendEntries(entries); err != nil {
		t.Fatalf("Failed to append entries: %v", err)
	}

	newSize := w.ByteSize()
	if newSize <= initialSize {
		t.Errorf("Byte size should increase after appending, was %d now %d", initialSize, newSize)
	}
}