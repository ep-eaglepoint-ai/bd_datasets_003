package main

import (
	"fmt"
	"net/http"
	"os"

	"github.com/google/uuid"
	"github.com/private/securedep"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		id := uuid.New().String()
		fmt.Fprintf(
			w,
			"Secure Build Kit Microservice - Static Binary\nModule loaded: github.com/google/uuid v1.6.0\nPrivate dep: %s\nRequest ID: %s\n",
			securedep.Version(),
			id,
		)
	})

	fmt.Printf("Starting server on port %s...\n", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		fmt.Fprintf(os.Stderr, "Server failed: %v\n", err)
		os.Exit(1)
	}
}
