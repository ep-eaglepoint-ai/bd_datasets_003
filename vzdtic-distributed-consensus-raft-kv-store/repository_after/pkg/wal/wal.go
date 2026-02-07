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

type WAL struct {
	mu               sync.RWMutex
	dir              string
	file             *os.File
	currentTerm      uint64
	votedFor         string
	entries          []Entry
	lastIndex        uint64
	lastTerm         uint64
	byteSize         int64
	byteSizeThreshold int64
}

type Entry struct {
	Term    uint64
	Index   uint64
	Command []byte
	Type    EntryType
}

type EntryType int

const (
	EntryNormal EntryType = iota
	EntryConfigChange
	EntryNoop
)

type PersistentState struct {
	CurrentTerm uint64
	VotedFor    string
	Entries     []Entry
}

type SnapshotMetadata struct {
	LastIncludedIndex uint64
	LastIncludedTerm  uint64
	Configuration     []ClusterMember
}

type ClusterMember struct {
	NodeID  string
	Address string
	Voting  bool
}

type Snapshot struct {
	Metadata SnapshotMetadata
	Data     []byte
}

const (
	walFileName           = "raft.wal"
	snapshotFileName      = "snapshot.dat"
	recordHeaderSize      = 8
	DefaultByteSizeThreshold = 10 * 1024 * 1024 // 10MB default
)

func New(dir string) (*WAL, error) {
	return NewWithThreshold(dir, DefaultByteSizeThreshold)
}

func NewWithThreshold(dir string, byteSizeThreshold int64) (*WAL, error) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create WAL directory: %w", err)
	}
	wal := &WAL{
		dir:              dir,
		entries:          make([]Entry, 0),
		byteSizeThreshold: byteSizeThreshold,
	}
	if err := wal.recover(); err != nil {
		return nil, fmt.Errorf("failed to recover WAL: %w", err)
	}
	return wal, nil
}

func (w *WAL) recover() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if err := w.loadSnapshot(); err != nil && !os.IsNotExist(err) {
		return err
	}
	walPath := filepath.Join(w.dir, walFileName)
	file, err := os.OpenFile(walPath, os.O_RDWR|os.O_CREATE, 0644)
	if err != nil {
		return err
	}
	w.file = file
	if err := w.readEntries(); err != nil && err != io.EOF {
		return err
	}
	return nil
}

func (w *WAL) readEntries() error {
	for {
		header := make([]byte, recordHeaderSize)
		if _, err := io.ReadFull(w.file, header); err != nil {
			if err == io.EOF {
				return nil
			}
			return err
		}
		crc := binary.LittleEndian.Uint32(header[:4])
		length := binary.LittleEndian.Uint32(header[4:8])
		data := make([]byte, length)
		if _, err := io.ReadFull(w.file, data); err != nil {
			return err
		}
		if crc32.ChecksumIEEE(data) != crc {
			return fmt.Errorf("CRC mismatch")
		}
		var state PersistentState
		if err := gob.NewDecoder(bytes.NewReader(data)).Decode(&state); err != nil {
			return err
		}
		w.currentTerm = state.CurrentTerm
		w.votedFor = state.VotedFor
		w.entries = state.Entries
		w.byteSize = int64(recordHeaderSize + len(data))
		if len(w.entries) > 0 {
			last := w.entries[len(w.entries)-1]
			w.lastIndex = last.Index
			w.lastTerm = last.Term
		}
	}
}

func (w *WAL) Save(term uint64, votedFor string, entries []Entry) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.currentTerm = term
	w.votedFor = votedFor
	w.entries = entries
	if len(entries) > 0 {
		last := entries[len(entries)-1]
		w.lastIndex = last.Index
		w.lastTerm = last.Term
	}
	return w.persist()
}

func (w *WAL) persist() error {
	state := PersistentState{CurrentTerm: w.currentTerm, VotedFor: w.votedFor, Entries: w.entries}
	var buf bytes.Buffer
	if err := gob.NewEncoder(&buf).Encode(state); err != nil {
		return err
	}
	data := buf.Bytes()
	w.byteSize = int64(recordHeaderSize + len(data))
	crc := crc32.ChecksumIEEE(data)
	header := make([]byte, recordHeaderSize)
	binary.LittleEndian.PutUint32(header[:4], crc)
	binary.LittleEndian.PutUint32(header[4:8], uint32(len(data)))
	if _, err := w.file.Seek(0, 0); err != nil {
		return err
	}
	if err := w.file.Truncate(0); err != nil {
		return err
	}
	if _, err := w.file.Write(header); err != nil {
		return err
	}
	if _, err := w.file.Write(data); err != nil {
		return err
	}
	return w.file.Sync()
}

func (w *WAL) AppendEntries(entries []Entry) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.entries = append(w.entries, entries...)
	if len(entries) > 0 {
		last := entries[len(entries)-1]
		w.lastIndex = last.Index
		w.lastTerm = last.Term
	}
	return w.persist()
}

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

func (w *WAL) GetLastEntry() *Entry {
	w.mu.RLock()
	defer w.mu.RUnlock()
	if len(w.entries) == 0 {
		return nil
	}
	return &w.entries[len(w.entries)-1]
}

func (w *WAL) GetLastIndex() uint64 {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.lastIndex
}

func (w *WAL) GetLastTerm() uint64 {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.lastTerm
}

func (w *WAL) GetCurrentTerm() uint64 {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.currentTerm
}

func (w *WAL) GetVotedFor() string {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.votedFor
}

func (w *WAL) SetCurrentTerm(term uint64) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.currentTerm = term
	return w.persist()
}

func (w *WAL) SetVotedFor(votedFor string) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.votedFor = votedFor
	return w.persist()
}

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
		last := w.entries[len(w.entries)-1]
		w.lastIndex = last.Index
		w.lastTerm = last.Term
	} else {
		w.lastIndex = 0
		w.lastTerm = 0
	}
	return w.persist()
}

func (w *WAL) SaveSnapshot(snapshot Snapshot) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	snapshotPath := filepath.Join(w.dir, snapshotFileName)
	var buf bytes.Buffer
	if err := gob.NewEncoder(&buf).Encode(snapshot); err != nil {
		return err
	}
	data := buf.Bytes()
	crc := crc32.ChecksumIEEE(data)
	header := make([]byte, recordHeaderSize)
	binary.LittleEndian.PutUint32(header[:4], crc)
	binary.LittleEndian.PutUint32(header[4:8], uint32(len(data)))
	file, err := os.Create(snapshotPath)
	if err != nil {
		return err
	}
	defer file.Close()
	if _, err := file.Write(header); err != nil {
		return err
	}
	if _, err := file.Write(data); err != nil {
		return err
	}
	if err := file.Sync(); err != nil {
		return err
	}
	// Compact log entries included in snapshot
	var newEntries []Entry
	for _, entry := range w.entries {
		if entry.Index > snapshot.Metadata.LastIncludedIndex {
			newEntries = append(newEntries, entry)
		}
	}
	w.entries = newEntries
	return w.persist()
}

func (w *WAL) LoadSnapshot() (*Snapshot, error) {
	w.mu.RLock()
	defer w.mu.RUnlock()
	var snapshot Snapshot
	if err := w.loadSnapshotInternal(&snapshot); err != nil {
		return nil, err
	}
	return &snapshot, nil
}

func (w *WAL) loadSnapshot() error {
	var snapshot Snapshot
	return w.loadSnapshotInternal(&snapshot)
}

func (w *WAL) loadSnapshotInternal(snapshot *Snapshot) error {
	snapshotPath := filepath.Join(w.dir, snapshotFileName)
	file, err := os.Open(snapshotPath)
	if err != nil {
		return err
	}
	defer file.Close()
	header := make([]byte, recordHeaderSize)
	if _, err := io.ReadFull(file, header); err != nil {
		return err
	}
	crc := binary.LittleEndian.Uint32(header[:4])
	length := binary.LittleEndian.Uint32(header[4:8])
	data := make([]byte, length)
	if _, err := io.ReadFull(file, data); err != nil {
		return err
	}
	if crc32.ChecksumIEEE(data) != crc {
		return fmt.Errorf("CRC mismatch in snapshot")
	}
	return gob.NewDecoder(bytes.NewReader(data)).Decode(snapshot)
}

func (w *WAL) GetAllEntries() []Entry {
	w.mu.RLock()
	defer w.mu.RUnlock()
	result := make([]Entry, len(w.entries))
	copy(result, w.entries)
	return result
}

func (w *WAL) Size() int {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return len(w.entries)
}

// ByteSize returns the current WAL size in bytes
func (w *WAL) ByteSize() int64 {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.byteSize
}

// NeedsCompaction returns true if WAL exceeds byte size threshold
func (w *WAL) NeedsCompaction() bool {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.byteSize > w.byteSizeThreshold
}

// SetByteSizeThreshold sets the byte size threshold for compaction
func (w *WAL) SetByteSizeThreshold(threshold int64) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.byteSizeThreshold = threshold
}

// GetByteSizeThreshold returns the byte size threshold
func (w *WAL) GetByteSizeThreshold() int64 {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.byteSizeThreshold
}

func (w *WAL) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.file != nil {
		return w.file.Close()
	}
	return nil
}