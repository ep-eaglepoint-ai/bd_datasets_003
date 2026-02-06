package main

import (
	"log"
	"net/http"

	offline_sync "offline_sync"
)

func main() {
	srv := offline_sync.NewInventoryServer()
	addr := ":8080"
	log.Printf("Inventory Sync Server listening on %s", addr)
	log.Printf("Try: curl http://localhost:8080/state")

	if err := http.ListenAndServe(addr, srv.Handler()); err != nil {
		log.Fatal(err)
	}
}
