package grpc

import (
	"context"
	"fmt"
	"net"
	"sync"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"github.com/vzdtic/distributed-consensus-raft-kv-store/repository_after/pkg/grpc/proto"
	"github.com/vzdtic/distributed-consensus-raft-kv-store/repository_after/pkg/raft"
)

// GRPCTransport implements network transport using gRPC
type GRPCTransport struct {
	mu          sync.RWMutex
	localAddr   string
	node        *raft.Node
	server      *grpc.Server
	listener    net.Listener
	connections map[string]*grpc.ClientConn
	clients     map[string]proto.RaftServiceClient
	peerAddrs   map[string]string
	timeout     time.Duration
}

// raftServer implements the gRPC service interface
type raftServer struct {
	proto.UnimplementedRaftServiceServer
	transport *GRPCTransport
}

func NewGRPCTransport(addr string, peerAddrs map[string]string) *GRPCTransport {
	return &GRPCTransport{
		localAddr:   addr,
		connections: make(map[string]*grpc.ClientConn),
		clients:     make(map[string]proto.RaftServiceClient),
		peerAddrs:   peerAddrs,
		timeout:     5 * time.Second,
	}
}

func (t *GRPCTransport) Start() error {
	listener, err := net.Listen("tcp", t.localAddr)
	if err != nil {
		return fmt.Errorf("failed to listen: %w", err)
	}
	t.listener = listener

	t.server = grpc.NewServer()
	proto.RegisterRaftServiceServer(t.server, &raftServer{transport: t})

	go func() {
		if err := t.server.Serve(listener); err != nil {
			fmt.Printf("gRPC server error: %v\n", err)
		}
	}()

	return nil
}

func (t *GRPCTransport) Stop() {
	t.mu.Lock()
	defer t.mu.Unlock()

	for _, conn := range t.connections {
		conn.Close()
	}

	if t.server != nil {
		t.server.GracefulStop()
	}
	if t.listener != nil {
		t.listener.Close()
	}
}

func (t *GRPCTransport) SetNode(node *raft.Node) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.node = node
}

func (t *GRPCTransport) getClient(target string) (proto.RaftServiceClient, error) {
	t.mu.RLock()
	if client, ok := t.clients[target]; ok {
		t.mu.RUnlock()
		return client, nil
	}
	t.mu.RUnlock()

	t.mu.Lock()
	defer t.mu.Unlock()

	if client, ok := t.clients[target]; ok {
		return client, nil
	}

	addr, ok := t.peerAddrs[target]
	if !ok {
		return nil, fmt.Errorf("unknown peer: %s", target)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	conn, err := grpc.DialContext(ctx, addr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to %s: %w", addr, err)
	}

	client := proto.NewRaftServiceClient(conn)
	t.connections[target] = conn
	t.clients[target] = client
	return client, nil
}

// Transport interface implementations (client-side)

func (t *GRPCTransport) RequestVote(target string, args *raft.RequestVoteArgs) (*raft.RequestVoteReply, error) {
	client, err := t.getClient(target)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), t.timeout)
	defer cancel()

	req := &proto.RequestVoteRequest{
		Term:         args.Term,
		CandidateId:  args.CandidateID,
		LastLogIndex: args.LastLogIndex,
		LastLogTerm:  args.LastLogTerm,
	}

	resp, err := client.RequestVote(ctx, req)
	if err != nil {
		return nil, err
	}

	return &raft.RequestVoteReply{
		Term:        resp.Term,
		VoteGranted: resp.VoteGranted,
	}, nil
}

func (t *GRPCTransport) AppendEntries(target string, args *raft.AppendEntriesArgs) (*raft.AppendEntriesReply, error) {
	client, err := t.getClient(target)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), t.timeout)
	defer cancel()

	entries := make([]*proto.LogEntry, len(args.Entries))
	for i, entry := range args.Entries {
		entries[i] = &proto.LogEntry{
			Index: entry.Index,
			Term:  entry.Term,
			Command: &proto.Command{
				Type:  int32(entry.Command.Type),
				Key:   entry.Command.Key,
				Value: entry.Command.Value,
			},
		}
	}

	req := &proto.AppendEntriesRequest{
		Term:         args.Term,
		LeaderId:     args.LeaderID,
		PrevLogIndex: args.PrevLogIndex,
		PrevLogTerm:  args.PrevLogTerm,
		Entries:      entries,
		LeaderCommit: args.LeaderCommit,
	}

	resp, err := client.AppendEntries(ctx, req)
	if err != nil {
		return nil, err
	}

	return &raft.AppendEntriesReply{
		Term:          resp.Term,
		Success:       resp.Success,
		ConflictIndex: resp.ConflictIndex,
		ConflictTerm:  resp.ConflictTerm,
	}, nil
}

func (t *GRPCTransport) InstallSnapshot(target string, args *raft.InstallSnapshotArgs) (*raft.InstallSnapshotReply, error) {
	client, err := t.getClient(target)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), t.timeout*2)
	defer cancel()

	req := &proto.InstallSnapshotRequest{
		Term:              args.Term,
		LeaderId:          args.LeaderID,
		LastIncludedIndex: args.LastIncludedIndex,
		LastIncludedTerm:  args.LastIncludedTerm,
		Data:              args.Data,
	}

	resp, err := client.InstallSnapshot(ctx, req)
	if err != nil {
		return nil, err
	}

	return &raft.InstallSnapshotReply{
		Term: resp.Term,
	}, nil
}

// gRPC service implementation (server-side)

func (s *raftServer) RequestVote(ctx context.Context, req *proto.RequestVoteRequest) (*proto.RequestVoteResponse, error) {
	s.transport.mu.RLock()
	node := s.transport.node
	s.transport.mu.RUnlock()

	if node == nil {
		return nil, fmt.Errorf("node not set")
	}

	args := &raft.RequestVoteArgs{
		Term:         req.Term,
		CandidateID:  req.CandidateId,
		LastLogIndex: req.LastLogIndex,
		LastLogTerm:  req.LastLogTerm,
	}

	reply := node.HandleRequestVote(args)

	return &proto.RequestVoteResponse{
		Term:        reply.Term,
		VoteGranted: reply.VoteGranted,
	}, nil
}

func (s *raftServer) AppendEntries(ctx context.Context, req *proto.AppendEntriesRequest) (*proto.AppendEntriesResponse, error) {
	s.transport.mu.RLock()
	node := s.transport.node
	s.transport.mu.RUnlock()

	if node == nil {
		return nil, fmt.Errorf("node not set")
	}

	entries := make([]raft.LogEntry, len(req.Entries))
	for i, entry := range req.Entries {
		entries[i] = raft.LogEntry{
			Index: entry.Index,
			Term:  entry.Term,
			Command: raft.Command{
				Type:  raft.CommandType(entry.Command.Type),
				Key:   entry.Command.Key,
				Value: entry.Command.Value,
			},
		}
	}

	args := &raft.AppendEntriesArgs{
		Term:         req.Term,
		LeaderID:     req.LeaderId,
		PrevLogIndex: req.PrevLogIndex,
		PrevLogTerm:  req.PrevLogTerm,
		Entries:      entries,
		LeaderCommit: req.LeaderCommit,
	}

	reply := node.HandleAppendEntries(args)

	return &proto.AppendEntriesResponse{
		Term:          reply.Term,
		Success:       reply.Success,
		ConflictIndex: reply.ConflictIndex,
		ConflictTerm:  reply.ConflictTerm,
	}, nil
}

func (s *raftServer) InstallSnapshot(ctx context.Context, req *proto.InstallSnapshotRequest) (*proto.InstallSnapshotResponse, error) {
	s.transport.mu.RLock()
	node := s.transport.node
	s.transport.mu.RUnlock()

	if node == nil {
		return nil, fmt.Errorf("node not set")
	}

	args := &raft.InstallSnapshotArgs{
		Term:              req.Term,
		LeaderID:          req.LeaderId,
		LastIncludedIndex: req.LastIncludedIndex,
		LastIncludedTerm:  req.LastIncludedTerm,
		Data:              req.Data,
	}

	reply := node.HandleInstallSnapshot(args)

	return &proto.InstallSnapshotResponse{
		Term: reply.Term,
	}, nil
}