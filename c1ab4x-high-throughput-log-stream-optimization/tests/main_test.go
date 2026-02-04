package main

import (
	"bytes"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"runtime"
	"strings"
	"testing"
)

// Helper function to generate test log lines
func generateLogLine(level, msg string) string {
	return fmt.Sprintf(`{"timestamp":"2024-01-01T00:00:00Z","level":"%s","msg":"%s","service":"test","request_id":"123"}`, level, msg)
}

// =============================================================================
// Requirement 1: Must NOT use io.ReadAll or ioutil.ReadFile (OOM Trap)
// =============================================================================
func TestReq1_NoReadAllUsage(t *testing.T) {
	sourceFile := os.Getenv("SOURCE_FILE")
	if sourceFile == "" {
		t.Fatal("SOURCE_FILE environment variable not set")
	}

	content, err := os.ReadFile(sourceFile)
	if err != nil {
		t.Fatalf("Failed to read source file: %v", err)
	}

	source := string(content)

	if strings.Contains(source, "io.ReadAll") {
		t.Error("Requirement 1 FAILED: Code uses io.ReadAll which causes OOM on large files")
	}

	if strings.Contains(source, "ioutil.ReadFile") {
		t.Error("Requirement 1 FAILED: Code uses ioutil.ReadFile which causes OOM on large files")
	}

	if strings.Contains(source, "ioutil.ReadAll") {
		t.Error("Requirement 1 FAILED: Code uses ioutil.ReadAll which causes OOM on large files")
	}
}

// =============================================================================
// Requirement 2: Must use bufio.NewScanner or bufio.NewReader for input
// =============================================================================
func TestReq2_UsesBufioForInput(t *testing.T) {
	sourceFile := os.Getenv("SOURCE_FILE")
	if sourceFile == "" {
		t.Fatal("SOURCE_FILE environment variable not set")
	}

	content, err := os.ReadFile(sourceFile)
	if err != nil {
		t.Fatalf("Failed to read source file: %v", err)
	}

	source := string(content)

	usesBufioScanner := strings.Contains(source, "bufio.NewScanner") || strings.Contains(source, "bufio.Scanner")
	usesBufioReader := strings.Contains(source, "bufio.NewReader") || strings.Contains(source, "bufio.Reader")

	if !usesBufioScanner && !usesBufioReader {
		t.Error("Requirement 2 FAILED: Code must use bufio.NewScanner or bufio.NewReader for streaming input")
	}
}

// =============================================================================
// Requirement 3: Must use bufio.NewWriter for output to reduce syscalls
// =============================================================================
func TestReq3_UsesBufioWriter(t *testing.T) {
	sourceFile := os.Getenv("SOURCE_FILE")
	if sourceFile == "" {
		t.Fatal("SOURCE_FILE environment variable not set")
	}

	content, err := os.ReadFile(sourceFile)
	if err != nil {
		t.Fatalf("Failed to read source file: %v", err)
	}

	source := string(content)

	if !strings.Contains(source, "bufio.NewWriter") && !strings.Contains(source, "bufio.Writer") {
		t.Error("Requirement 3 FAILED: Code must use bufio.NewWriter for buffered output")
	}
}

// =============================================================================
// Requirement 4: Must avoid json.Unmarshal inside the loop
// =============================================================================
func TestReq4_NoJsonUnmarshalInLoop(t *testing.T) {
	sourceFile := os.Getenv("SOURCE_FILE")
	if sourceFile == "" {
		t.Fatal("SOURCE_FILE environment variable not set")
	}

	content, err := os.ReadFile(sourceFile)
	if err != nil {
		t.Fatalf("Failed to read source file: %v", err)
	}

	// Parse the Go source file
	fset := token.NewFileSet()
	node, err := parser.ParseFile(fset, sourceFile, content, parser.AllErrors)
	if err != nil {
		t.Fatalf("Failed to parse source file: %v", err)
	}

	// Check for json.Unmarshal usage inside loops
	var foundUnmarshalInLoop bool

	ast.Inspect(node, func(n ast.Node) bool {
		// Look for for/range loops
		switch loop := n.(type) {
		case *ast.ForStmt, *ast.RangeStmt:
			// Check if json.Unmarshal is called inside this loop
			ast.Inspect(loop, func(inner ast.Node) bool {
				if call, ok := inner.(*ast.CallExpr); ok {
					if sel, ok := call.Fun.(*ast.SelectorExpr); ok {
						if ident, ok := sel.X.(*ast.Ident); ok {
							if ident.Name == "json" && sel.Sel.Name == "Unmarshal" {
								foundUnmarshalInLoop = true
								return false
							}
						}
					}
				}
				return true
			})
		}
		return true
	})

	if foundUnmarshalInLoop {
		t.Error("Requirement 4 FAILED: json.Unmarshal is used inside a loop - use byte manipulation instead")
	}
}

// =============================================================================
// Requirement 5: Must reduce allocations (avoid string conversions in loop)
// =============================================================================
func TestReq5_ReducedAllocations(t *testing.T) {
	sourceFile := os.Getenv("SOURCE_FILE")
	if sourceFile == "" {
		t.Fatal("SOURCE_FILE environment variable not set")
	}

	content, err := os.ReadFile(sourceFile)
	if err != nil {
		t.Fatalf("Failed to read source file: %v", err)
	}

	// Parse the Go source file
	fset := token.NewFileSet()
	node, err := parser.ParseFile(fset, sourceFile, content, parser.AllErrors)
	if err != nil {
		t.Fatalf("Failed to parse source file: %v", err)
	}

	// Check for string(byteSlice) conversions inside loops
	var stringConversionsInLoop int

	ast.Inspect(node, func(n ast.Node) bool {
		switch loop := n.(type) {
		case *ast.ForStmt, *ast.RangeStmt:
			ast.Inspect(loop, func(inner ast.Node) bool {
				if call, ok := inner.(*ast.CallExpr); ok {
					if ident, ok := call.Fun.(*ast.Ident); ok {
						if ident.Name == "string" && len(call.Args) == 1 {
							stringConversionsInLoop++
						}
					}
				}
				return true
			})
		}
		return true
	})

	// Also check for strings.Split which is allocation-heavy
	source := string(content)
	if strings.Contains(source, "strings.Split") {
		t.Error("Requirement 5 FAILED: strings.Split creates many allocations - use streaming approach")
	}

	if stringConversionsInLoop > 2 {
		t.Errorf("Requirement 5 FAILED: Too many string() conversions in loop (%d) - causes GC pressure", stringConversionsInLoop)
	}
}

// =============================================================================
// Requirement 6: Output must match original format exactly
// =============================================================================
func TestReq6_OutputFormatCorrect(t *testing.T) {
	input := strings.Join([]string{
		generateLogLine("ERROR", "Database connection failed"),
		generateLogLine("INFO", "Server started"),
		generateLogLine("ERROR", "Authentication failed"),
		generateLogLine("WARN", "High memory usage"),
		generateLogLine("ERROR", "Timeout occurred"),
	}, "\n")

	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output)
	if err != nil {
		t.Fatalf("ProcessLogStream returned error: %v", err)
	}

	expected := "[ERROR] Database connection failed\n[ERROR] Authentication failed\n[ERROR] Timeout occurred\n"

	if output.String() != expected {
		t.Errorf("Requirement 6 FAILED: Output format mismatch\nExpected:\n%s\nGot:\n%s", expected, output.String())
	}
}

func TestReq6_FiltersOnlyErrorLogs(t *testing.T) {
	input := strings.Join([]string{
		generateLogLine("INFO", "Info message"),
		generateLogLine("DEBUG", "Debug message"),
		generateLogLine("WARN", "Warning message"),
		generateLogLine("ERROR", "Error message"),
		generateLogLine("FATAL", "Fatal message"),
	}, "\n")

	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output)
	if err != nil {
		t.Fatalf("ProcessLogStream returned error: %v", err)
	}

	result := output.String()

	if !strings.Contains(result, "[ERROR] Error message") {
		t.Error("Requirement 6 FAILED: Should include ERROR level logs")
	}

	if strings.Contains(result, "INFO") || strings.Contains(result, "DEBUG") ||
		strings.Contains(result, "WARN") || strings.Contains(result, "FATAL") {
		t.Error("Requirement 6 FAILED: Should only include ERROR level logs")
	}
}

func TestReq6_HandlesEmptyInput(t *testing.T) {
	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(""), &output)
	if err != nil {
		t.Fatalf("ProcessLogStream returned error on empty input: %v", err)
	}

	if output.String() != "" {
		t.Errorf("Requirement 6 FAILED: Expected empty output for empty input, got: %s", output.String())
	}
}

func TestReq6_HandlesEmptyLines(t *testing.T) {
	input := "\n\n" + generateLogLine("ERROR", "Test error") + "\n\n\n"

	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output)
	if err != nil {
		t.Fatalf("ProcessLogStream returned error: %v", err)
	}

	expected := "[ERROR] Test error\n"
	if output.String() != expected {
		t.Errorf("Requirement 6 FAILED: Should handle empty lines correctly\nExpected: %q\nGot: %q", expected, output.String())
	}
}

func TestReq6_SkipsMalformedJSON(t *testing.T) {
	input := strings.Join([]string{
		"not valid json",
		generateLogLine("ERROR", "Valid error"),
		"{incomplete json",
		generateLogLine("ERROR", "Another valid error"),
	}, "\n")

	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output)
	if err != nil {
		t.Fatalf("ProcessLogStream returned error: %v", err)
	}

	expected := "[ERROR] Valid error\n[ERROR] Another valid error\n"
	if output.String() != expected {
		t.Errorf("Requirement 6 FAILED: Should skip malformed JSON\nExpected: %q\nGot: %q", expected, output.String())
	}
}

// =============================================================================
// Requirement 7: Must handle lines longer than default buffer
// =============================================================================
func TestReq7_HandlesLongLines(t *testing.T) {
	// Generate a message longer than 64KB (default bufio.Scanner buffer)
	longMsg := strings.Repeat("x", 100000) // 100KB message
	input := generateLogLine("ERROR", longMsg)

	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output)
	if err != nil {
		t.Fatalf("Requirement 7 FAILED: ProcessLogStream failed on long line: %v", err)
	}

	expected := fmt.Sprintf("[ERROR] %s\n", longMsg)
	if output.String() != expected {
		t.Error("Requirement 7 FAILED: Long line was not processed correctly")
	}
}

func TestReq7_HandlesMultipleLongLines(t *testing.T) {
	longMsg1 := strings.Repeat("a", 80000)
	longMsg2 := strings.Repeat("b", 90000)

	input := strings.Join([]string{
		generateLogLine("ERROR", longMsg1),
		generateLogLine("INFO", "short info"),
		generateLogLine("ERROR", longMsg2),
	}, "\n")

	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output)
	if err != nil {
		t.Fatalf("Requirement 7 FAILED: ProcessLogStream failed on multiple long lines: %v", err)
	}

	if !strings.Contains(output.String(), longMsg1) {
		t.Error("Requirement 7 FAILED: First long message not in output")
	}
	if !strings.Contains(output.String(), longMsg2) {
		t.Error("Requirement 7 FAILED: Second long message not in output")
	}
}

// =============================================================================
// Requirement 8: Peak memory must be O(1) regardless of input size
// =============================================================================
func TestReq8_ConstantMemoryUsage(t *testing.T) {
	// Generate inputs of different sizes
	smallInput := generateTestInput(100)    // 100 lines
	largeInput := generateTestInput(10000)  // 10000 lines

	// Measure memory for small input
	runtime.GC()
	var m1 runtime.MemStats
	runtime.ReadMemStats(&m1)

	var output1 bytes.Buffer
	ProcessLogStream(strings.NewReader(smallInput), &output1)

	runtime.GC()
	var m2 runtime.MemStats
	runtime.ReadMemStats(&m2)
	smallAlloc := m2.TotalAlloc - m1.TotalAlloc

	// Measure memory for large input
	runtime.GC()
	var m3 runtime.MemStats
	runtime.ReadMemStats(&m3)

	var output2 bytes.Buffer
	ProcessLogStream(strings.NewReader(largeInput), &output2)

	runtime.GC()
	var m4 runtime.MemStats
	runtime.ReadMemStats(&m4)
	largeAlloc := m4.TotalAlloc - m3.TotalAlloc

	// Large input should not allocate significantly more than small input
	// Allow up to 5x more allocation (to account for output buffer growth)
	// But if using io.ReadAll, it would be 100x more
	ratio := float64(largeAlloc) / float64(smallAlloc)

	if ratio > 20 {
		t.Errorf("Requirement 8 FAILED: Memory usage is not O(1). Small: %d bytes, Large: %d bytes, Ratio: %.2f",
			smallAlloc, largeAlloc, ratio)
	}
}

func generateTestInput(lines int) string {
	var sb strings.Builder
	for i := 0; i < lines; i++ {
		level := "INFO"
		if i%10 == 0 {
			level = "ERROR"
		}
		sb.WriteString(generateLogLine(level, fmt.Sprintf("Message %d with some content", i)))
		sb.WriteString("\n")
	}
	return sb.String()
}

// =============================================================================
// Requirement 9: Must adhere to io.Reader and io.Writer interfaces
// =============================================================================
func TestReq9_AcceptsAnyReader(t *testing.T) {
	// Test with strings.Reader
	input := generateLogLine("ERROR", "Test message")
	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output)
	if err != nil {
		t.Errorf("Requirement 9 FAILED: Should accept strings.Reader: %v", err)
	}

	// Test with bytes.Reader
	var output2 bytes.Buffer
	err = ProcessLogStream(bytes.NewReader([]byte(input)), &output2)
	if err != nil {
		t.Errorf("Requirement 9 FAILED: Should accept bytes.Reader: %v", err)
	}

	// Both should produce same output
	if output.String() != output2.String() {
		t.Error("Requirement 9 FAILED: Different readers should produce same output")
	}
}

func TestReq9_AcceptsAnyWriter(t *testing.T) {
	input := generateLogLine("ERROR", "Test message")

	// Test with bytes.Buffer
	var output1 bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output1)
	if err != nil {
		t.Errorf("Requirement 9 FAILED: Should accept bytes.Buffer: %v", err)
	}

	// Test with strings.Builder
	var output2 strings.Builder
	err = ProcessLogStream(strings.NewReader(input), &output2)
	if err != nil {
		t.Errorf("Requirement 9 FAILED: Should accept strings.Builder: %v", err)
	}

	// Both should produce same output
	if output1.String() != output2.String() {
		t.Error("Requirement 9 FAILED: Different writers should produce same output")
	}
}

// =============================================================================
// Additional Edge Case Tests
// =============================================================================
func TestEdgeCase_SpecialCharactersInMessage(t *testing.T) {
	input := `{"timestamp":"2024-01-01T00:00:00Z","level":"ERROR","msg":"Error with \"quotes\" and \\backslash","service":"test","request_id":"123"}`

	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output)
	if err != nil {
		t.Fatalf("Failed on special characters: %v", err)
	}

	// Should handle escaped characters
	if !strings.Contains(output.String(), "[ERROR]") {
		t.Error("Should process messages with special characters")
	}
}

func TestEdgeCase_UnicodeInMessage(t *testing.T) {
	input := generateLogLine("ERROR", "Unicode: 你好世界 🌍 émojis")

	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output)
	if err != nil {
		t.Fatalf("Failed on unicode: %v", err)
	}

	if !strings.Contains(output.String(), "你好世界") {
		t.Error("Should handle unicode characters")
	}
}

func TestEdgeCase_ManyErrorLogs(t *testing.T) {
	var sb strings.Builder
	for i := 0; i < 1000; i++ {
		sb.WriteString(generateLogLine("ERROR", fmt.Sprintf("Error %d", i)))
		sb.WriteString("\n")
	}

	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(sb.String()), &output)
	if err != nil {
		t.Fatalf("Failed on many error logs: %v", err)
	}

	lines := strings.Split(strings.TrimSpace(output.String()), "\n")
	if len(lines) != 1000 {
		t.Errorf("Expected 1000 output lines, got %d", len(lines))
	}
}
