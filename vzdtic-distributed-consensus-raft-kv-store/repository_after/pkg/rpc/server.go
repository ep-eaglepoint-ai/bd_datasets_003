package rpc

import (
	"context"
	"fmt"
	"log"
	"net"

	"github.com/vzdtic/raft-kv-store/repository_after/pkg/raft"
	"google.golang.org/grpc"
)

// Server wraps the gRPC server
type Server struct {
	raftNode   *raft.Raft
	grpcServer *grpc.Server
	listener   net.Listener
	logger     *log.Logger
	UnimplementedRaftServiceServer
	UnimplementedKVServiceServer
	UnimplementedClusterServiceServer
}

// Unimplemented servers for gRPC (we'll define interfaces inline)
type UnimplementedRaftServiceServer struct{}
type UnimplementedKVServiceServer struct{}
type UnimplementedClusterServiceServer struct{}

// NewServer creates a new gRPC server
func NewServer(raftNode *raft.Raft, address string, logger *log.Logger) (*Server, error) {
	listener, err := net.Listen("tcp", address)
	if err != nil {
		return nil, fmt.Errorf("failed to listen on %s: %w", address, err)
	}

	s := &Server{
		raftNode:   raftNode,
		grpcServer: grpc.NewServer(),
		listener:   listener,
		logger:     logger,
	}

	// Register services manually (without generated code)
	// In production, we'd use the generated proto service registrations

	return s, nil
}

// Start starts the gRPC server
func (s *Server) Start() error {
	s.logger.Printf("gRPC server listening on %s", s.listener.Addr().String())
	return s.grpcServer.Serve(s.listener)
}

// Stop stops the gRPC server
func (s *Server) Stop() {
	s.grpcServer.GracefulStop()
}

// RequestVote handles RequestVote RPC
func (s *Server) RequestVote(ctx context.Context, req *RequestVoteRequest) (*RequestVoteResponse, error) {
	raftReq := &raft.RequestVoteRequest{
		Term:         req.Term,
		CandidateID:  req.CandidateId,
		LastLogIndex: req.LastLogIndex,
		LastLogTerm:  req.LastLogTerm,
	}

	resp := s.raftNode.HandleRequestVote(raftReq)

	return &RequestVoteResponse{
		Term:        resp.Term,
		VoteGranted: resp.VoteGranted,
	}, nil
}

// AppendEntries handles AppendEntries RPC
func (s *Server) AppendEntries(ctx context.Context, req *AppendEntriesRequest) (*AppendEntriesResponse, error) {
	entries := make([]raft.LogEntry, len(req.Entries))
	for i, e := range req.Entries {
		entries[i] = raft.LogEntry{
			Term:    e.Term,
			Index:   e.Index,
			Command: e.Command,
			Type:    raft.EntryType(e.Type),
		}
	}

	raftReq := &raft.AppendEntriesRequest{
		Term:         req.Term,
		LeaderID:     req.LeaderId,
		PrevLogIndex: req.PrevLogIndex,
		PrevLogTerm:  req.PrevLogTerm,
		Entries:      entries,
		LeaderCommit: req.LeaderCommit,
	}

	resp := s.raftNode.HandleAppendEntries(raftReq)

	return &AppendEntriesResponse{
		Term:          resp.Term,
		Success:       resp.Success,
		MatchIndex:    resp.MatchIndex,
		ConflictIndex: resp.ConflictIndex,
		ConflictTerm:  resp.ConflictTerm,
	}, nil
}

// InstallSnapshot handles InstallSnapshot RPC
func (s *Server) InstallSnapshot(ctx context.Context, req *InstallSnapshotRequest) (*InstallSnapshotResponse, error) {
	members := make([]raft.ClusterMember, len(req.Configuration))
	for i, m := range req.Configuration {
		members[i] = raft.ClusterMember{
			NodeID:  m.NodeId,
			Address: m.Address,
			Voting:  m.Voting,
		}
	}

	raftReq := &raft.InstallSnapshotRequest{
		Term:              req.Term,
		LeaderID:          req.LeaderId,
		LastIncludedIndex: req.LastIncludedIndex,
		LastIncludedTerm:  req.LastIncludedTerm,
		Data:              req.Data,
		Configuration:     members,
	}

	resp := s.raftNode.HandleInstallSnapshot(raftReq)

	return &InstallSnapshotResponse{
		Term: resp.Term,
	}, nil
}

// Set handles Set RPC
func (s *Server) Set(ctx context.Context, req *SetRequest) (*SetResponse, error) {
	if !s.raftNode.IsLeader() {
		leaderID, _, _ := s.raftNode.GetClusterInfo()
		return &SetResponse{
			Success:    false,
			Error:      "not leader",
			LeaderHint: leaderID,
		}, nil
	}

	err := s.raftNode.Set(req.Key, req.Value, req.ClientId, req.RequestId)
	if err != nil {
		return &SetResponse{
			Success: false,
			Error:   err.Error(),
		}, nil
	}

	return &SetResponse{
		Success: true,
	}, nil
}

// Get handles Get RPC
func (s *Server) Get(ctx context.Context, req *GetRequest) (*GetResponse, error) {
	value, found, err := s.raftNode.Get(req.Key, req.Linearizable)
	if err != nil {
		leaderID, _, _ := s.raftNode.GetClusterInfo()
		return &GetResponse{
			Error:      err.Error(),
			LeaderHint: leaderID,
		}, nil
	}

	return &GetResponse{
		Found: found,
		Value: value,
	}, nil
}

// Delete handles Delete RPC
func (s *Server) Delete(ctx context.Context, req *DeleteRequest) (*DeleteResponse, error) {
	if !s.raftNode.IsLeader() {
		leaderID, _, _ := s.raftNode.GetClusterInfo()
		return &DeleteResponse{
			Success:    false,
			Error:      "not leader",
			LeaderHint: leaderID,
		}, nil
	}

	err := s.raftNode.Delete(req.Key, req.ClientId, req.RequestId)
	if err != nil {
		return &DeleteResponse{
			Success: false,
			Error:   err.Error(),
		}, nil
	}

	return &DeleteResponse{
		Success: true,
	}, nil
}

// AddNode handles AddNode RPC
func (s *Server) AddNode(ctx context.Context, req *AddNodeRequest) (*AddNodeResponse, error) {
	err := s.raftNode.AddNode(req.NodeId, req.Address)
	if err != nil {
		return &AddNodeResponse{
			Success: false,
			Error:   err.Error(),
		}, nil
	}

	return &AddNodeResponse{
		Success: true,
	}, nil
}

// RemoveNode handles RemoveNode RPC
func (s *Server) RemoveNode(ctx context.Context, req *RemoveNodeRequest) (*RemoveNodeResponse, error) {
	err := s.raftNode.RemoveNode(req.NodeId)
	if err != nil {
		return &RemoveNodeResponse{
			Success: false,
			Error:   err.Error(),
		}, nil
	}

	return &RemoveNodeResponse{
		Success: true,
	}, nil
}

// GetClusterInfo handles GetClusterInfo RPC
func (s *Server) GetClusterInfo(ctx context.Context, req *GetClusterInfoRequest) (*GetClusterInfoResponse, error) {
	leaderID, term, members := s.raftNode.GetClusterInfo()

	protoMembers := make([]*ClusterMember, len(members))
	for i, m := range members {
		protoMembers[i] = &ClusterMember{
			NodeId:  m.NodeID,
			Address: m.Address,
			Voting:  m.Voting,
		}
	}

	return &GetClusterInfoResponse{
		LeaderId: leaderID,
		Term:     term,
		Members:  protoMembers,
	}, nil
}

// Message types (these would normally come from generated proto code)
type RequestVoteRequest struct {
	Term         uint64
	CandidateId  string
	LastLogIndex uint64
	LastLogTerm  uint64
}

type RequestVoteResponse struct {
	Term        uint64
	VoteGranted bool
}

type LogEntry struct {
	Term    uint64
	Index   uint64
	Command []byte
	Type    int32
}

type AppendEntriesRequest struct {
	Term         uint64
	LeaderId     string
	PrevLogIndex uint64
	PrevLogTerm  uint64
	Entries      []*LogEntry
	LeaderCommit uint64
}

type AppendEntriesResponse struct {
	Term          uint64
	Success       bool
	MatchIndex    uint64
	ConflictIndex uint64
	ConflictTerm  uint64
}

type ClusterMember struct {
	NodeId  string
	Address string
	Voting  bool
}

type InstallSnapshotRequest struct {
	Term              uint64
	LeaderId          string
	LastIncludedIndex uint64
	LastIncludedTerm  uint64
	Data              []byte
	Configuration     []*ClusterMember
}

type InstallSnapshotResponse struct {
	Term uint64
}

type SetRequest struct {
	Key       string
	Value     []byte
	ClientId  string
	RequestId uint64
}

type SetResponse struct {
	Success    bool
	Error      string
	LeaderHint string
}

type GetRequest struct {
	Key          string
	Linearizable bool
}

type GetResponse struct {
	Found      bool
	Value      []byte
	Error      string
	LeaderHint string
}

type DeleteRequest struct {
	Key       string
	ClientId  string
	RequestId uint64
}

type DeleteResponse struct {
	Success    bool
	Error      string
	LeaderHint string
}

type AddNodeRequest struct {
	NodeId  string
	Address string
}

type AddNodeResponse struct {
	Success bool
	Error   string
}

type RemoveNodeRequest struct {
	NodeId string
}

type RemoveNodeResponse struct {
	Success bool
	Error   string
}

type GetClusterInfoRequest struct{}

type GetClusterInfoResponse struct {
	LeaderId string
	Term     uint64
	Members  []*ClusterMember
}