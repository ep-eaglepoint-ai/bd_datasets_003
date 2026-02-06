package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/vzdtic/distributed-consensus-raft-kv-store/repository_after/pkg/api"
	grpctransport "github.com/vzdtic/distributed-consensus-raft-kv-store/repository_after/pkg/grpc"
	"github.com/vzdtic/distributed-consensus-raft-kv-store/repository_after/pkg/kv"
	"github.com/vzdtic/distributed-consensus-raft-kv-store/repository_after/pkg/raft"
	"github.com/vzdtic/distributed-consensus-raft-kv-store/repository_after/pkg/wal"
)

func main() {
	nodeID := flag.String("id", "", "Node ID")
	addr := flag.String("addr", "", "gRPC listen address (e.g., localhost:5000)")
	httpAddr := flag.String("http", "", "HTTP API listen address (e.g., localhost:8000)")
	peers := flag.String("peers", "", "Comma-separated list of peer addresses (id1=addr1,id2=addr2)")
	walDir := flag.String("wal", "", "WAL directory path")
	flag.Parse()

	if *nodeID == "" || *addr == "" || *httpAddr == "" {
		flag.Usage()
		os.Exit(1)
	}

	// Parse peer addresses with proper splitting
	peerAddrs := make(map[string]string)
	peerIDs := make([]string, 0)
	if *peers != "" {
		for _, peer := range strings.Split(*peers, ",") {
			peer = strings.TrimSpace(peer)
			parts := strings.SplitN(peer, "=", 2) // Use SplitN to handle values with "="
			if len(parts) == 2 {
				peerAddrs[parts[0]] = parts[1]
				if parts[0] != *nodeID {
					peerIDs = append(peerIDs, parts[0])
				}
			}
		}
	}
	peerAddrs[*nodeID] = *addr

	walPath := *walDir
	if walPath == "" {
		walPath = fmt.Sprintf("/tmp/raft-wal-%s", *nodeID)
	}

	log.Printf("Starting Raft node %s", *nodeID)
	log.Printf("gRPC address: %s", *addr)
	log.Printf("HTTP address: %s", *httpAddr)
	log.Printf("Peers: %v", peerIDs)
	log.Printf("WAL path: %s", walPath)

	walInstance, err := wal.NewWAL(walPath)
	if err != nil {
		log.Fatalf("Failed to create WAL: %v", err)
	}

	store := kv.NewStore()

	// Create transport and set node BEFORE starting
	transport := grpctransport.NewGRPCTransport(*addr, peerAddrs)

	config := raft.NodeConfig{
		ID:                 *nodeID,
		Peers:              peerIDs,
		ElectionTimeoutMin: 500 * time.Millisecond,
		ElectionTimeoutMax: 1000 * time.Millisecond,
		HeartbeatInterval:  50 * time.Millisecond,
		WALPath:            walPath,
		SnapshotThreshold:  1000,
	}

	node := raft.NewNode(config, transport, walInstance, store)

	// Set node BEFORE starting transport
	transport.SetNode(node)

	if err := transport.Start(); err != nil {
		log.Fatalf("Failed to start transport: %v", err)
	}

	if err := node.Start(); err != nil {
		log.Fatalf("Failed to start node: %v", err)
	}

	apiServer := &http.Server{
		Addr:    *httpAddr,
		Handler: api.NewHTTPHandler(node, store),
	}

	go func() {
		log.Printf("HTTP API listening on %s", *httpAddr)
		if err := apiServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	log.Println("Shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	apiServer.Shutdown(ctx)
	transport.Stop()
	node.Stop()
	walInstance.Close()

	log.Println("Shutdown complete")
}