package wal

import (
	"bytes"
	"encoding/binary"
	"encoding/gob"
	"fmt"
	"hash/crc32"
	"io"
	"os"
	"path/filepath"
	"sync"
)

// WAL represents a Write-Ahead Log for persistent storage
type WAL struct {
	mu          sync.RWMutex
	dir         string
	file        *os.File
	currentTerm uint64
	votedFor    string
	entries     []Entry
	lastIndex   uint64
	lastTerm    uint64
}

// Entry represents a log entry in the WAL
type Entry struct {
	Term    uint64
	Index   uint64
	Command []byte
	Type    EntryType
}

// EntryType defines the type of log entry
type EntryType int

const (
	EntryNormal EntryType = iota
	EntryConfigChange
	EntryNoop
)

// PersistentState holds the state that must be persisted
type PersistentState struct {
	CurrentTerm uint64
	VotedFor    string
	Entries     []Entry
}

// SnapshotMetadata holds metadata for a snapshot
type SnapshotMetadata struct {
	LastIncludedIndex uint64
	LastIncludedTerm  uint64
	Configuration     []ClusterMember
}

// ClusterMember represents a cluster member
type ClusterMember struct {
	NodeID  string
	Address string
	Voting  bool
}

// Snapshot represents a complete snapshot
type Snapshot struct {
	Metadata SnapshotMetadata
	Data     []byte
}

const (
	walFileName      = "raft.wal"
	snapshotFileName = "snapshot.dat"
	recordHeaderSize = 8 // 4 bytes CRC + 4 bytes length
)

// New creates a new WAL instance
func New(dir string) (*WAL, error) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create WAL directory: %w", err)
	}

	wal := &WAL{
		dir:       dir,
		entries:   make([]Entry, 0),
		lastIndex: 0,
		lastTerm:  0,
	}

	if err := wal.recover(); err != nil {
		return nil, fmt.Errorf("failed to recover WAL: %w", err)
	}

	return wal, nil
}

// recover restores state from disk
func (w *WAL) recover() error {
	w.mu.Lock()
	defer w.mu.Unlock()

	// Try to load snapshot first
	if err := w.loadSnapshot(); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to load snapshot: %w", err)
	}

	// Load WAL entries
	walPath := filepath.Join(w.dir, walFileName)
	file, err := os.OpenFile(walPath, os.O_RDWR|os.O_CREATE, 0644)
	if err != nil {
		return fmt.Errorf("failed to open WAL file: %w", err)
	}
	w.file = file

	// Read existing entries
	if err := w.readEntries(); err != nil && err != io.EOF {
		return fmt.Errorf("failed to read WAL entries: %w", err)
	}

	return nil
}

// readEntries reads all entries from the WAL file
func (w *WAL) readEntries() error {
	for {
		// Read header
		header := make([]byte, recordHeaderSize)
		if _, err := io.ReadFull(w.file, header); err != nil {
			if err == io.EOF {
				return nil
			}
			return err
		}

		crc := binary.LittleEndian.Uint32(header[:4])
		length := binary.LittleEndian.Uint32(header[4:8])

		// Read data
		data := make([]byte, length)
		if _, err := io.ReadFull(w.file, data); err != nil {
			return err
		}

		// Verify CRC
		if crc32.ChecksumIEEE(data) != crc {
			return fmt.Errorf("CRC mismatch in WAL entry")
		}

		// Decode state
		var state PersistentState
		dec := gob.NewDecoder(bytes.NewReader(data))
		if err := dec.Decode(&state); err != nil {
			return fmt.Errorf("failed to decode WAL entry: %w", err)
		}

		w.currentTerm = state.CurrentTerm
		w.votedFor = state.VotedFor
		w.entries = state.Entries

		if len(w.entries) > 0 {
			lastEntry := w.entries[len(w.entries)-1]
			w.lastIndex = lastEntry.Index
			w.lastTerm = lastEntry.Term
		}
	}
}

// Save persists the current state to disk
func (w *WAL) Save(term uint64, votedFor string, entries []Entry) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	w.currentTerm = term
	w.votedFor = votedFor
	w.entries = entries

	if len(entries) > 0 {
		lastEntry := entries[len(entries)-1]
		w.lastIndex = lastEntry.Index
		w.lastTerm = lastEntry.Term
	}

	return w.persist()
}

// persist writes the current state to disk
func (w *WAL) persist() error {
	state := PersistentState{
		CurrentTerm: w.currentTerm,
		VotedFor:    w.votedFor,
		Entries:     w.entries,
	}

	var buf bytes.Buffer
	enc := gob.NewEncoder(&buf)
	if err := enc.Encode(state); err != nil {
		return fmt.Errorf("failed to encode state: %w", err)
	}

	data := buf.Bytes()
	crc := crc32.ChecksumIEEE(data)

	header := make([]byte, recordHeaderSize)
	binary.LittleEndian.PutUint32(header[:4], crc)
	binary.LittleEndian.PutUint32(header[4:8], uint32(len(data)))

	// Seek to beginning of file (overwrite strategy for simplicity)
	if _, err := w.file.Seek(0, 0); err != nil {
		return fmt.Errorf("failed to seek WAL file: %w", err)
	}

	if err := w.file.Truncate(0); err != nil {
		return fmt.Errorf("failed to truncate WAL file: %w", err)
	}

	if _, err := w.file.Write(header); err != nil {
		return fmt.Errorf("failed to write WAL header: %w", err)
	}

	if _, err := w.file.Write(data); err != nil {
		return fmt.Errorf("failed to write WAL data: %w", err)
	}

	return w.file.Sync()
}

// AppendEntries appends new entries to the log
func (w *WAL) AppendEntries(entries []Entry) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	w.entries = append(w.entries, entries...)

	if len(entries) > 0 {
		lastEntry := entries[len(entries)-1]
		w.lastIndex = lastEntry.Index
		w.lastTerm = lastEntry.Term
	}

	return w.persist()
}

// GetEntries returns entries from startIndex to endIndex (inclusive)
func (w *WAL) GetEntries(startIndex, endIndex uint64) []Entry {
	w.mu.RLock()
	defer w.mu.RUnlock()

	if len(w.entries) == 0 {
		return nil
	}

	var result []Entry
	for _, entry := range w.entries {
		if entry.Index >= startIndex && entry.Index <= endIndex {
			result = append(result, entry)
		}
	}
	return result
}

// GetEntry returns a specific entry by index
func (w *WAL) GetEntry(index uint64) *Entry {
	w.mu.RLock()
	defer w.mu.RUnlock()

	for _, entry := range w.entries {
		if entry.Index == index {
			return &entry
		}
	}
	return nil
}

// GetLastEntry returns the last log entry
func (w *WAL) GetLastEntry() *Entry {
	w.mu.RLock()
	defer w.mu.RUnlock()

	if len(w.entries) == 0 {
		return nil
	}
	return &w.entries[len(w.entries)-1]
}

// GetLastIndex returns the last log index
func (w *WAL) GetLastIndex() uint64 {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.lastIndex
}

// GetLastTerm returns the term of the last log entry
func (w *WAL) GetLastTerm() uint64 {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.lastTerm
}

// GetCurrentTerm returns the current term
func (w *WAL) GetCurrentTerm() uint64 {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.currentTerm
}

// GetVotedFor returns the voted for candidate
func (w *WAL) GetVotedFor() string {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.votedFor
}

// SetCurrentTerm sets the current term
func (w *WAL) SetCurrentTerm(term uint64) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	w.currentTerm = term
	return w.persist()
}

// SetVotedFor sets the voted for candidate
func (w *WAL) SetVotedFor(votedFor string) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	w.votedFor = votedFor
	return w.persist()
}

// TruncateAfter removes all entries after the given index
func (w *WAL) TruncateAfter(index uint64) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	var newEntries []Entry
	for _, entry := range w.entries {
		if entry.Index <= index {
			newEntries = append(newEntries, entry)
		}
	}
	w.entries = newEntries

	if len(w.entries) > 0 {
		lastEntry := w.entries[len(w.entries)-1]
		w.lastIndex = lastEntry.Index
		w.lastTerm = lastEntry.Term
	} else {
		w.lastIndex = 0
		w.lastTerm = 0
	}

	return w.persist()
}

// SaveSnapshot saves a snapshot to disk
func (w *WAL) SaveSnapshot(snapshot Snapshot) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	snapshotPath := filepath.Join(w.dir, snapshotFileName)

	var buf bytes.Buffer
	enc := gob.NewEncoder(&buf)
	if err := enc.Encode(snapshot); err != nil {
		return fmt.Errorf("failed to encode snapshot: %w", err)
	}

	data := buf.Bytes()
	crc := crc32.ChecksumIEEE(data)

	header := make([]byte, recordHeaderSize)
	binary.LittleEndian.PutUint32(header[:4], crc)
	binary.LittleEndian.PutUint32(header[4:8], uint32(len(data)))

	file, err := os.Create(snapshotPath)
	if err != nil {
		return fmt.Errorf("failed to create snapshot file: %w", err)
	}
	defer file.Close()

	if _, err := file.Write(header); err != nil {
		return fmt.Errorf("failed to write snapshot header: %w", err)
	}

	if _, err := file.Write(data); err != nil {
		return fmt.Errorf("failed to write snapshot data: %w", err)
	}

	if err := file.Sync(); err != nil {
		return fmt.Errorf("failed to sync snapshot file: %w", err)
	}

	// Compact log entries that are included in snapshot
	var newEntries []Entry
	for _, entry := range w.entries {
		if entry.Index > snapshot.Metadata.LastIncludedIndex {
			newEntries = append(newEntries, entry)
		}
	}
	w.entries = newEntries

	return w.persist()
}

// LoadSnapshot loads a snapshot from disk
func (w *WAL) LoadSnapshot() (*Snapshot, error) {
	w.mu.RLock()
	defer w.mu.RUnlock()

	var snapshot Snapshot
	if err := w.loadSnapshotInternal(&snapshot); err != nil {
		return nil, err
	}
	return &snapshot, nil
}

// loadSnapshot loads snapshot internally (no lock)
func (w *WAL) loadSnapshot() error {
	var snapshot Snapshot
	return w.loadSnapshotInternal(&snapshot)
}

// loadSnapshotInternal loads a snapshot from disk
func (w *WAL) loadSnapshotInternal(snapshot *Snapshot) error {
	snapshotPath := filepath.Join(w.dir, snapshotFileName)

	file, err := os.Open(snapshotPath)
	if err != nil {
		return err
	}
	defer file.Close()

	header := make([]byte, recordHeaderSize)
	if _, err := io.ReadFull(file, header); err != nil {
		return fmt.Errorf("failed to read snapshot header: %w", err)
	}

	crc := binary.LittleEndian.Uint32(header[:4])
	length := binary.LittleEndian.Uint32(header[4:8])

	data := make([]byte, length)
	if _, err := io.ReadFull(file, data); err != nil {
		return fmt.Errorf("failed to read snapshot data: %w", err)
	}

	if crc32.ChecksumIEEE(data) != crc {
		return fmt.Errorf("CRC mismatch in snapshot")
	}

	dec := gob.NewDecoder(bytes.NewReader(data))
	if err := dec.Decode(snapshot); err != nil {
		return fmt.Errorf("failed to decode snapshot: %w", err)
	}

	return nil
}

// GetAllEntries returns all entries
func (w *WAL) GetAllEntries() []Entry {
	w.mu.RLock()
	defer w.mu.RUnlock()

	result := make([]Entry, len(w.entries))
	copy(result, w.entries)
	return result
}

// Size returns the number of entries
func (w *WAL) Size() int {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return len(w.entries)
}

// Close closes the WAL
func (w *WAL) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()

	if w.file != nil {
		return w.file.Close()
	}
	return nil
}