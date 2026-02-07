package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/vzdtic/raft-kv-store/repository_after/pkg/raft"
	"github.com/vzdtic/raft-kv-store/repository_after/pkg/rpc"
)

func main() {
	nodeID := flag.String("id", "", "Node ID")
	peers := flag.String("peers", "", "Comma-separated list of peer addresses (id:address)")
	listenAddr := flag.String("listen", ":9000", "Listen address for RPC")
	dataDir := flag.String("data", "./data", "Data directory")

	flag.Parse()

	// Use environment variables if flags not set
	if *nodeID == "" {
		*nodeID = os.Getenv("NODE_ID")
	}
	if *peers == "" {
		*peers = os.Getenv("CLUSTER_ADDRESSES")
	}

	if *nodeID == "" {
		log.Fatal("Node ID is required")
	}

	logger := log.New(os.Stdout, fmt.Sprintf("[%s] ", *nodeID), log.LstdFlags)

	// Parse peers
	peerMap := make(map[string]string)
	if *peers != "" {
		for _, peer := range strings.Split(*peers, ",") {
			parts := strings.SplitN(peer, ":", 2)
			if len(parts) == 2 {
				peerMap[parts[0]] = peer
			}
		}
	}

	// Create transport
	transport := rpc.NewTransport()

	// Create Raft config
	config := raft.DefaultConfig(*nodeID)
	config.Peers = peerMap
	config.WALDir = fmt.Sprintf("%s/%s", *dataDir, *nodeID)

	// Create Raft node
	raftNode, err := raft.New(config, transport, logger)
	if err != nil {
		log.Fatalf("Failed to create Raft node: %v", err)
	}

	// Start Raft node
	raftNode.Start()

	// Create and start gRPC server
	server, err := rpc.NewServer(raftNode, *listenAddr, logger)
	if err != nil {
		log.Fatalf("Failed to create server: %v", err)
	}

	go func() {
		if err := server.Start(); err != nil {
			log.Fatalf("Server failed: %v", err)
		}
	}()

	logger.Printf("Server started on %s", *listenAddr)

	// Wait for shutdown signal
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	logger.Println("Shutting down...")
	server.Stop()
	raftNode.Stop()
}