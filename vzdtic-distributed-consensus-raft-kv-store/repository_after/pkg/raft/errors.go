package raft

import "errors"

var (
	ErrNotLeader                = errors.New("not the leader")
	ErrTimeout                  = errors.New("operation timed out")
	ErrNodeNotFound             = errors.New("node not found")
	ErrLogCompacted             = errors.New("log has been compacted")
	ErrSnapshotFailed           = errors.New("snapshot operation failed")
	ErrMembershipChangeDisabled = errors.New("membership changes are disabled - joint consensus not implemented")
	ErrNodeStopped              = errors.New("node has been stopped")
)