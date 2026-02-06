package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"time"
)

type EvaluationReport struct {
	ProjectName  string        `json:"project_name"`
	Timestamp    string        `json:"timestamp"`
	TestResults  string        `json:"test_raw_output"`
	Status       string        `json:"status"`
	ExecutionTime string       `json:"execution_time"`
}

func main() {
	start := time.Now()
	fmt.Println("Starting evaluation of StreamParser...")
	cmd := exec.Command("go", "test", "-v", "./tests/...")
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out

	err := cmd.Run()
	status := "PASSED"
	if err != nil {
		status = "FAILED"
		fmt.Printf("Tests failed: %v\n", err)
	}

	report := EvaluationReport{
		ProjectName:   "Markdown Streamer Parser",
		Timestamp:     time.Now().Format(time.RFC3339),
		TestResults:   out.String(),
		Status:        status,
		ExecutionTime: time.Since(start).String(),
	}

	reportJSON, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		fmt.Printf("Error generating JSON: %v\n", err)
		return
	}

	reportFile := "evaluation/report.json"
	err = os.WriteFile(reportFile, reportJSON, 0644)
	if err != nil {
		fmt.Printf("Error writing file: %v\n", err)
		return
	}

	fmt.Printf("Evaluation complete. Status: %s. Report saved to %s\n", status, reportFile)
}