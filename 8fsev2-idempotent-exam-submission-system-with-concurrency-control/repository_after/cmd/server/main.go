package main

import (
	"assessment-platform/repository_after"
	"log"
	"net/http"
)

func main() {
	http.HandleFunc("/submit", repository_after.SubmitHandler)
	log.Println("Architectural Server running on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}