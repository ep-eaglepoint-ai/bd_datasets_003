package main

import (
	"fmt"

	offline_sync "offline_sync"
)

func main() {
	serverURL := "http://localhost:8080"
	client := offline_sync.NewClient("agent-eyob-1", serverURL)

	fmt.Println("=== 1) Initial REBASE from server ===")
	if err := client.RebaseFromServer(); err != nil {
		panic(err)
	}

	fmt.Println("\n=== 2) OFFLINE: agent performs work (optimistic local apply + queue events) ===")
	client.SetOnline(false)
	client.RecordDecrement("bandage", 3)
	client.RecordDecrement("syringe", 2)
	client.RecordIncrement("bandage", 1)
	client.PrintLocalState()

	fmt.Println("\n=== 3) ONLINE: flush batch but simulate ACK loss ===")
	client.SetOnline(true)
	_ = client.FlushPendingSimulateAckLoss()
	client.PrintLocalState()

	fmt.Println("\n=== 4) ONLINE: retry SAME batch (idempotent replay) ===")
	if err := client.FlushPending(); err != nil {
		panic(err)
	}
	client.PrintLocalState()

	fmt.Println("\n=== 5) OFFLINE: create a batch that will FAIL to prove atomicity (no partial apply) ===")
	client.SetOnline(false)
	client.RecordDecrement("bandage", 2)
	client.RecordDecrement("syringe", 999)
	client.PrintLocalState()

	fmt.Println("\n=== 6) ONLINE: flush failing batch (server rejects -> client rebases + clears queue) ===")
	client.SetOnline(true)
	if err := client.FlushPending(); err != nil {
		fmt.Println("[CLIENT] flush error:", err)
	}
	client.PrintLocalState()

	fmt.Println("\n=== 7) Final Server Truth ===")
	state, err := client.FetchServerState()
	if err != nil {
		panic(err)
	}
	fmt.Printf("[SERVER] version=%d inventory=%v\n", state.ServerVersion, state.Inventory)
}
