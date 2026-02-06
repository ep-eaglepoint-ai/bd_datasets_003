package raft

import "errors"

var (
	ErrNotLeader               = errors.New("not the leader")
	ErrTimeout                 = errors.New("operation timed out")
	ErrNodeNotFound            = errors.New("node not found")
	ErrLogCompacted            = errors.New("log has been compacted")
	ErrSnapshotFailed          = errors.New("snapshot operation failed")
	ErrMembershipChangePending = errors.New("membership change already in progress")
	ErrNodeStopped             = errors.New("node has been stopped")
	ErrNodeAlreadyExists       = errors.New("node already exists in cluster")
	ErrCannotRemoveLastNode    = errors.New("cannot remove the last node from cluster")
)