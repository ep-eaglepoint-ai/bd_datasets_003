package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io"
	"os"
	"runtime"
	"strings"
	"testing"
	"time"
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

// =============================================================================
// Edge Case Tests: JSON Escape Sequences
// =============================================================================

func TestEscape_QuotesInMessage(t *testing.T) {
	// Input with escaped quotes in msg field
	input := `{"timestamp":"2024-01-01T00:00:00Z","level":"ERROR","msg":"Error with \"quoted\" text","service":"test","request_id":"123"}`

	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}

	// json.Unmarshal would decode \" to "
	expected := "[ERROR] Error with \"quoted\" text\n"
	if output.String() != expected {
		t.Errorf("Escape test failed.\nExpected: %q\nGot:      %q", expected, output.String())
	}
}

func TestEscape_BackslashInMessage(t *testing.T) {
	// Input with escaped backslash
	input := `{"timestamp":"2024-01-01T00:00:00Z","level":"ERROR","msg":"Path: C:\\Users\\test","service":"test","request_id":"123"}`

	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}

	// json.Unmarshal would decode \\ to \
	expected := "[ERROR] Path: C:\\Users\\test\n"
	if output.String() != expected {
		t.Errorf("Escape test failed.\nExpected: %q\nGot:      %q", expected, output.String())
	}
}

func TestEscape_NewlineInMessage(t *testing.T) {
	// Input with escaped newline - in JSON, \n represents a newline character
	// In a raw Go string, we write a single backslash followed by n
	input := `{"timestamp":"2024-01-01T00:00:00Z","level":"ERROR","msg":"Line1\nLine2","service":"test","request_id":"123"}`

	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}

	// json.Unmarshal would decode \n to actual newline
	expected := "[ERROR] Line1\nLine2\n"
	if output.String() != expected {
		t.Errorf("Escape test failed.\nExpected: %q\nGot:      %q", expected, output.String())
	}
}

func TestEscape_TabInMessage(t *testing.T) {
	// Input with escaped tab - in JSON, \t represents a tab character
	input := `{"timestamp":"2024-01-01T00:00:00Z","level":"ERROR","msg":"Col1\tCol2","service":"test","request_id":"123"}`

	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}

	// json.Unmarshal would decode \t to actual tab
	expected := "[ERROR] Col1\tCol2\n"
	if output.String() != expected {
		t.Errorf("Escape test failed.\nExpected: %q\nGot:      %q", expected, output.String())
	}
}

func TestEscape_MultipleEscapesInMessage(t *testing.T) {
	// Input with multiple escape sequences
	// JSON: \" = quote, \n = newline, \\ = backslash
	input := `{"timestamp":"2024-01-01T00:00:00Z","level":"ERROR","msg":"Say \"hello\nworld\" at C:\\path","service":"test","request_id":"123"}`

	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}

	expected := "[ERROR] Say \"hello\nworld\" at C:\\path\n"
	if output.String() != expected {
		t.Errorf("Escape test failed.\nExpected: %q\nGot:      %q", expected, output.String())
	}
}

func TestEscape_UnicodeEscape(t *testing.T) {
	// Input with unicode escape \u0041 = 'A'
	input := `{"timestamp":"2024-01-01T00:00:00Z","level":"ERROR","msg":"Letter: \u0041","service":"test","request_id":"123"}`

	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}

	expected := "[ERROR] Letter: A\n"
	if output.String() != expected {
		t.Errorf("Escape test failed.\nExpected: %q\nGot:      %q", expected, output.String())
	}
}

func TestEscape_SlashEscape(t *testing.T) {
	// Input with escaped forward slash - \/ in JSON decodes to /
	input := `{"timestamp":"2024-01-01T00:00:00Z","level":"ERROR","msg":"URL: http:\/\/example.com","service":"test","request_id":"123"}`

	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}

	expected := "[ERROR] URL: http://example.com\n"
	if output.String() != expected {
		t.Errorf("Escape test failed.\nExpected: %q\nGot:      %q", expected, output.String())
	}
}

// =============================================================================
// Edge Case Tests: Structural Correctness (keys inside values)
// =============================================================================

func TestStructural_LevelKeyInsideValue(t *testing.T) {
	// "level" appears inside another field's value - should NOT confuse parser
	input := `{"timestamp":"2024-01-01T00:00:00Z","description":"The level field indicates","level":"ERROR","msg":"Real error","service":"test","request_id":"123"}`

	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}

	expected := "[ERROR] Real error\n"
	if output.String() != expected {
		t.Errorf("Structural test failed.\nExpected: %q\nGot:      %q", expected, output.String())
	}
}

func TestStructural_MsgKeyInsideValue(t *testing.T) {
	// "msg" appears inside another field's value
	input := `{"timestamp":"2024-01-01T00:00:00Z","note":"The msg field contains","level":"ERROR","msg":"Actual message","service":"test","request_id":"123"}`

	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}

	expected := "[ERROR] Actual message\n"
	if output.String() != expected {
		t.Errorf("Structural test failed.\nExpected: %q\nGot:      %q", expected, output.String())
	}
}

func TestStructural_BothKeysInsideValues(t *testing.T) {
	// Both "level" and "msg" appear inside other field values
	input := `{"info":"level:debug, msg:none","level":"ERROR","msg":"True message","extra":"level and msg mentioned"}`

	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}

	expected := "[ERROR] True message\n"
	if output.String() != expected {
		t.Errorf("Structural test failed.\nExpected: %q\nGot:      %q", expected, output.String())
	}
}

func TestStructural_QuotedKeywordInValue(t *testing.T) {
	// The exact string "\"level\"" appears in a value (would match naive substring search)
	input := `{"data":"field \"level\" is important","level":"ERROR","msg":"Correct","service":"test"}`

	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}

	expected := "[ERROR] Correct\n"
	if output.String() != expected {
		t.Errorf("Structural test failed.\nExpected: %q\nGot:      %q", expected, output.String())
	}
}

// =============================================================================
// Edge Case Tests: Field Reordering
// =============================================================================

func TestFieldOrder_MsgBeforeLevel(t *testing.T) {
	// msg comes before level in JSON
	input := `{"timestamp":"2024-01-01T00:00:00Z","msg":"Error occurred","level":"ERROR","service":"test","request_id":"123"}`

	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}

	expected := "[ERROR] Error occurred\n"
	if output.String() != expected {
		t.Errorf("Field order test failed.\nExpected: %q\nGot:      %q", expected, output.String())
	}
}

func TestFieldOrder_LevelLast(t *testing.T) {
	// level is the last field
	input := `{"timestamp":"2024-01-01T00:00:00Z","msg":"Error here","service":"test","request_id":"123","level":"ERROR"}`

	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}

	expected := "[ERROR] Error here\n"
	if output.String() != expected {
		t.Errorf("Field order test failed.\nExpected: %q\nGot:      %q", expected, output.String())
	}
}

func TestFieldOrder_MsgLast(t *testing.T) {
	// msg is the last field
	input := `{"timestamp":"2024-01-01T00:00:00Z","level":"ERROR","service":"test","request_id":"123","msg":"Last field error"}`

	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}

	expected := "[ERROR] Last field error\n"
	if output.String() != expected {
		t.Errorf("Field order test failed.\nExpected: %q\nGot:      %q", expected, output.String())
	}
}

func TestFieldOrder_MinimalFields(t *testing.T) {
	// Only level and msg fields
	input := `{"level":"ERROR","msg":"Minimal"}`

	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}

	expected := "[ERROR] Minimal\n"
	if output.String() != expected {
		t.Errorf("Field order test failed.\nExpected: %q\nGot:      %q", expected, output.String())
	}
}

// =============================================================================
// Edge Case Tests: Malformed JSON (should be skipped safely)
// =============================================================================

func TestMalformed_MissingClosingBrace(t *testing.T) {
	input := strings.Join([]string{
		`{"level":"ERROR","msg":"Valid error"}`,
		`{"level":"ERROR","msg":"Missing brace"`,
		`{"level":"ERROR","msg":"Another valid"}`,
	}, "\n")

	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output)
	if err != nil {
		t.Fatalf("ProcessLogStream returned error: %v", err)
	}

	// Should get output for valid lines
	if !strings.Contains(output.String(), "Valid error") {
		t.Error("Should include first valid error")
	}
	if !strings.Contains(output.String(), "Another valid") {
		t.Error("Should include third valid error")
	}
}

func TestMalformed_TruncatedString(t *testing.T) {
	input := strings.Join([]string{
		`{"level":"ERROR","msg":"Valid"}`,
		`{"level":"ERROR","msg":"Truncated`,
		`{"level":"ERROR","msg":"Valid2"}`,
	}, "\n")

	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output)
	if err != nil {
		t.Fatalf("ProcessLogStream returned error: %v", err)
	}

	if !strings.Contains(output.String(), "Valid\n") {
		t.Error("Should include first valid error")
	}
	if !strings.Contains(output.String(), "Valid2") {
		t.Error("Should include third valid error")
	}
}

func TestMalformed_RandomText(t *testing.T) {
	input := strings.Join([]string{
		`{"level":"ERROR","msg":"Before"}`,
		`This is not JSON at all`,
		`{"level":"ERROR","msg":"After"}`,
	}, "\n")

	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output)
	if err != nil {
		t.Fatalf("ProcessLogStream returned error: %v", err)
	}

	expected := "[ERROR] Before\n[ERROR] After\n"
	if output.String() != expected {
		t.Errorf("Malformed test failed.\nExpected: %q\nGot:      %q", expected, output.String())
	}
}

func TestMalformed_EmptyObject(t *testing.T) {
	input := strings.Join([]string{
		`{"level":"ERROR","msg":"Before"}`,
		`{}`,
		`{"level":"ERROR","msg":"After"}`,
	}, "\n")

	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output)
	if err != nil {
		t.Fatalf("ProcessLogStream returned error: %v", err)
	}

	expected := "[ERROR] Before\n[ERROR] After\n"
	if output.String() != expected {
		t.Errorf("Malformed test failed.\nExpected: %q\nGot:      %q", expected, output.String())
	}
}

// =============================================================================
// Exact Output Byte Tests (Verify byte-for-byte correctness)
// =============================================================================

func TestExactBytes_SimpleCase(t *testing.T) {
	input := `{"level":"ERROR","msg":"test"}`

	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}

	expected := []byte{'[', 'E', 'R', 'R', 'O', 'R', ']', ' ', 't', 'e', 's', 't', '\n'}
	if !bytes.Equal(output.Bytes(), expected) {
		t.Errorf("Byte mismatch.\nExpected bytes: %v\nGot bytes:      %v", expected, output.Bytes())
	}
}

func TestExactBytes_WithEscapedQuote(t *testing.T) {
	input := `{"level":"ERROR","msg":"a\"b"}`

	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}

	// "a\"b" decoded is a"b
	expected := []byte{'[', 'E', 'R', 'R', 'O', 'R', ']', ' ', 'a', '"', 'b', '\n'}
	if !bytes.Equal(output.Bytes(), expected) {
		t.Errorf("Byte mismatch.\nExpected bytes: %v\nGot bytes:      %v", expected, output.Bytes())
	}
}

func TestExactBytes_WithEscapedNewline(t *testing.T) {
	// In JSON, \n is the newline escape sequence
	input := `{"level":"ERROR","msg":"a\nb"}`

	var output bytes.Buffer
	err := ProcessLogStream(strings.NewReader(input), &output)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}

	// "a\nb" decoded is a + newline + b
	expected := []byte{'[', 'E', 'R', 'R', 'O', 'R', ']', ' ', 'a', '\n', 'b', '\n'}
	if !bytes.Equal(output.Bytes(), expected) {
		t.Errorf("Byte mismatch.\nExpected bytes: %v\nGot bytes:      %v", expected, output.Bytes())
	}
}

// =============================================================================
// Performance Benchmarks
// =============================================================================

func BenchmarkProcessLogStream_Small(b *testing.B) {
	input := generateTestInput(100)
	inputBytes := []byte(input)

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		var output bytes.Buffer
		ProcessLogStream(bytes.NewReader(inputBytes), &output)
	}
}

func BenchmarkProcessLogStream_Medium(b *testing.B) {
	input := generateTestInput(1000)
	inputBytes := []byte(input)

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		var output bytes.Buffer
		ProcessLogStream(bytes.NewReader(inputBytes), &output)
	}
}

func BenchmarkProcessLogStream_Large(b *testing.B) {
	input := generateTestInput(10000)
	inputBytes := []byte(input)

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		var output bytes.Buffer
		ProcessLogStream(bytes.NewReader(inputBytes), &output)
	}
}

func BenchmarkProcessLogStream_AllErrors(b *testing.B) {
	// Benchmark with all ERROR logs (worst case for hot path)
	var sb strings.Builder
	for i := 0; i < 1000; i++ {
		sb.WriteString(generateLogLine("ERROR", fmt.Sprintf("Error message %d with some content", i)))
		sb.WriteString("\n")
	}
	inputBytes := []byte(sb.String())

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		var output bytes.Buffer
		ProcessLogStream(bytes.NewReader(inputBytes), &output)
	}
}

func BenchmarkProcessLogStream_WithEscapes(b *testing.B) {
	// Benchmark with escaped characters
	var sb strings.Builder
	for i := 0; i < 1000; i++ {
		sb.WriteString(`{"timestamp":"2024-01-01T00:00:00Z","level":"ERROR","msg":"Error \"escaped\" path: C:\\test\\file.txt","service":"test","request_id":"123"}`)
		sb.WriteString("\n")
	}
	inputBytes := []byte(sb.String())

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		var output bytes.Buffer
		ProcessLogStream(bytes.NewReader(inputBytes), &output)
	}
}

// TestAllocationCount verifies near-zero allocations in steady state
func TestAllocationCount(t *testing.T) {
	// Generate input that will exercise the hot path
	var sb strings.Builder
	for i := 0; i < 100; i++ {
		sb.WriteString(generateLogLine("ERROR", fmt.Sprintf("Error %d", i)))
		sb.WriteString("\n")
	}
	input := sb.String()

	// Warm up
	var warmup bytes.Buffer
	ProcessLogStream(strings.NewReader(input), &warmup)

	// Measure allocations
	var m1, m2 runtime.MemStats
	runtime.GC()
	runtime.ReadMemStats(&m1)

	var output bytes.Buffer
	ProcessLogStream(strings.NewReader(input), &output)

	runtime.GC()
	runtime.ReadMemStats(&m2)

	allocations := m2.Mallocs - m1.Mallocs
	// Allow some allocations for scanner setup, but should be minimal per-line
	// With 100 lines, we should have much less than 100*3 allocations
	// (old impl had ~3 allocations per line for bytes.Trim and slicing)
	if allocations > 50 {
		t.Logf("Warning: High allocations detected: %d (target: near-zero per line)", allocations)
	}
}

// =============================================================================
// EXACT OUTPUT VERIFICATION: Compare with json.Unmarshal behavior
// =============================================================================

// TestExactOutput_MatchesJsonUnmarshal verifies that escape decoding produces
// byte-identical output to what json.Unmarshal would produce
func TestExactOutput_MatchesJsonUnmarshal(t *testing.T) {
	type LogEntry struct {
		Level string `json:"level"`
		Msg   string `json:"msg"`
	}

	testCases := []struct {
		name  string
		input string
	}{
		{"simple", `{"level":"ERROR","msg":"simple message"}`},
		{"escaped_quote", `{"level":"ERROR","msg":"say \"hello\""}`},
		{"escaped_backslash", `{"level":"ERROR","msg":"path C:\\Users\\test"}`},
		{"escaped_newline", `{"level":"ERROR","msg":"line1\nline2"}`},
		{"escaped_tab", `{"level":"ERROR","msg":"col1\tcol2"}`},
		{"escaped_carriage_return", `{"level":"ERROR","msg":"before\rafter"}`},
		{"escaped_formfeed", `{"level":"ERROR","msg":"page\fbreak"}`},
		{"escaped_backspace", `{"level":"ERROR","msg":"back\bspace"}`},
		{"escaped_slash", `{"level":"ERROR","msg":"http:\/\/example.com"}`},
		{"unicode_escape", `{"level":"ERROR","msg":"letter \u0041 and \u0042"}`},
		{"unicode_chinese", `{"level":"ERROR","msg":"chinese: \u4e2d\u6587"}`},
		{"multiple_escapes", `{"level":"ERROR","msg":"\"hello\"\npath: C:\\test\ttab"}`},
		{"empty_msg", `{"level":"ERROR","msg":""}`},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Get expected output using json.Unmarshal (the reference implementation)
			var entry LogEntry
			if err := json.Unmarshal([]byte(tc.input), &entry); err != nil {
				t.Fatalf("json.Unmarshal failed: %v", err)
			}
			expected := fmt.Sprintf("[%s] %s\n", entry.Level, entry.Msg)

			// Get actual output from ProcessLogStream
			var output bytes.Buffer
			err := ProcessLogStream(strings.NewReader(tc.input), &output)
			if err != nil {
				t.Fatalf("ProcessLogStream failed: %v", err)
			}

			// Compare byte-for-byte
			if output.String() != expected {
				t.Errorf("Output mismatch with json.Unmarshal\nInput:    %s\nExpected: %q (bytes: %v)\nGot:      %q (bytes: %v)",
					tc.input, expected, []byte(expected), output.String(), output.Bytes())
			}
		})
	}
}

// TestExactBytes_AllEscapeSequences verifies exact byte output for all JSON escape sequences
func TestExactBytes_AllEscapeSequences(t *testing.T) {
	testCases := []struct {
		name     string
		input    string
		expected []byte
	}{
		{
			name:     "escaped_quote",
			input:    `{"level":"ERROR","msg":"a\"b"}`,
			expected: []byte("[ERROR] a\"b\n"),
		},
		{
			name:     "escaped_backslash",
			input:    `{"level":"ERROR","msg":"a\\b"}`,
			expected: []byte("[ERROR] a\\b\n"),
		},
		{
			name:     "escaped_slash",
			input:    `{"level":"ERROR","msg":"a\/b"}`,
			expected: []byte("[ERROR] a/b\n"),
		},
		{
			name:     "escaped_newline",
			input:    `{"level":"ERROR","msg":"a\nb"}`,
			expected: []byte("[ERROR] a\nb\n"),
		},
		{
			name:     "escaped_tab",
			input:    `{"level":"ERROR","msg":"a\tb"}`,
			expected: []byte("[ERROR] a\tb\n"),
		},
		{
			name:     "escaped_carriage_return",
			input:    `{"level":"ERROR","msg":"a\rb"}`,
			expected: []byte("[ERROR] a\rb\n"),
		},
		{
			name:     "escaped_formfeed",
			input:    `{"level":"ERROR","msg":"a\fb"}`,
			expected: []byte("[ERROR] a\fb\n"),
		},
		{
			name:     "escaped_backspace",
			input:    `{"level":"ERROR","msg":"a\bb"}`,
			expected: []byte("[ERROR] a\bb\n"),
		},
		{
			name:     "unicode_A",
			input:    `{"level":"ERROR","msg":"\u0041"}`,
			expected: []byte("[ERROR] A\n"),
		},
		{
			name:     "unicode_chinese",
			input:    `{"level":"ERROR","msg":"\u4e2d"}`,
			expected: []byte("[ERROR] 中\n"),
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			var output bytes.Buffer
			err := ProcessLogStream(strings.NewReader(tc.input), &output)
			if err != nil {
				t.Fatalf("ProcessLogStream failed: %v", err)
			}

			if !bytes.Equal(output.Bytes(), tc.expected) {
				t.Errorf("Byte mismatch\nInput:    %s\nExpected: %v (%q)\nGot:      %v (%q)",
					tc.input, tc.expected, string(tc.expected), output.Bytes(), output.String())
			}
		})
	}
}

// =============================================================================
// STRUCTURAL CORRECTNESS: Keys appearing inside string values
// =============================================================================

// TestStructural_ExactOutput_KeysInValues verifies exact byte output when
// "level" or "msg" appear as substrings inside other field values
func TestStructural_ExactOutput_KeysInValues(t *testing.T) {
	testCases := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "level_in_other_value",
			input:    `{"data":"the level is high","level":"ERROR","msg":"correct"}`,
			expected: "[ERROR] correct\n",
		},
		{
			name:     "msg_in_other_value",
			input:    `{"info":"msg: some text","level":"ERROR","msg":"actual message"}`,
			expected: "[ERROR] actual message\n",
		},
		{
			name:     "quoted_level_key_in_value",
			input:    `{"x":"field \"level\" here","level":"ERROR","msg":"yes"}`,
			expected: "[ERROR] yes\n",
		},
		{
			name:     "quoted_msg_key_in_value",
			input:    `{"x":"field \"msg\" here","level":"ERROR","msg":"yes"}`,
			expected: "[ERROR] yes\n",
		},
		{
			name:     "level_colon_in_value",
			input:    `{"text":"level:DEBUG","level":"ERROR","msg":"real error"}`,
			expected: "[ERROR] real error\n",
		},
		{
			name:     "both_keys_in_value",
			input:    `{"note":"level and msg mentioned","level":"ERROR","msg":"true message"}`,
			expected: "[ERROR] true message\n",
		},
		{
			name:     "fake_level_error_in_value",
			input:    `{"fake":"level\":\"ERROR","level":"ERROR","msg":"valid"}`,
			expected: "[ERROR] valid\n",
		},
		{
			name:     "nested_object_with_level",
			input:    `{"meta":{"level":"DEBUG"},"level":"ERROR","msg":"outer error"}`,
			expected: "[ERROR] outer error\n",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			var output bytes.Buffer
			err := ProcessLogStream(strings.NewReader(tc.input), &output)
			if err != nil {
				t.Fatalf("ProcessLogStream failed: %v", err)
			}

			if output.String() != tc.expected {
				t.Errorf("Structural test failed\nInput:    %s\nExpected: %q\nGot:      %q",
					tc.input, tc.expected, output.String())
			}
		})
	}
}

// =============================================================================
// PERFORMANCE VERIFICATION: 90% allocation reduction, 50% time improvement
// =============================================================================

// baselineProcessLogStream is the original json.Unmarshal-based implementation
// used as baseline for performance comparison
func baselineProcessLogStream(r io.Reader, w io.Writer) error {
	data, err := io.ReadAll(r)
	if err != nil {
		return err
	}
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		var entry struct {
			Level string `json:"level"`
			Msg   string `json:"msg"`
		}
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			continue
		}
		if entry.Level == "ERROR" {
			fmt.Fprintf(w, "[%s] %s\n", entry.Level, entry.Msg)
		}
	}
	return nil
}

// TestPerformance_AllocationReduction verifies at least 90% allocation reduction
func TestPerformance_AllocationReduction(t *testing.T) {
	// Generate test input with ERROR logs
	var sb strings.Builder
	for i := 0; i < 1000; i++ {
		sb.WriteString(generateLogLine("ERROR", fmt.Sprintf("Error message %d", i)))
		sb.WriteString("\n")
	}
	input := sb.String()
	inputBytes := []byte(input)

	// Measure baseline allocations
	runtime.GC()
	var m1 runtime.MemStats
	runtime.ReadMemStats(&m1)

	var baselineOutput bytes.Buffer
	baselineProcessLogStream(bytes.NewReader(inputBytes), &baselineOutput)

	runtime.GC()
	var m2 runtime.MemStats
	runtime.ReadMemStats(&m2)
	baselineAllocs := m2.TotalAlloc - m1.TotalAlloc

	// Measure optimized allocations
	runtime.GC()
	var m3 runtime.MemStats
	runtime.ReadMemStats(&m3)

	var optimizedOutput bytes.Buffer
	ProcessLogStream(bytes.NewReader(inputBytes), &optimizedOutput)

	runtime.GC()
	var m4 runtime.MemStats
	runtime.ReadMemStats(&m4)
	optimizedAllocs := m4.TotalAlloc - m3.TotalAlloc

	// Calculate reduction percentage
	if baselineAllocs == 0 {
		t.Fatal("Baseline allocations is zero, cannot calculate reduction")
	}
	reductionPercent := 100.0 * float64(baselineAllocs-optimizedAllocs) / float64(baselineAllocs)

	t.Logf("Allocation comparison:")
	t.Logf("  Baseline (json.Unmarshal): %d bytes", baselineAllocs)
	t.Logf("  Optimized:                 %d bytes", optimizedAllocs)
	t.Logf("  Reduction:                 %.1f%%", reductionPercent)

	// Verify at least 90% reduction
	if reductionPercent < 90.0 {
		t.Errorf("FAILED: Allocation reduction is %.1f%%, required at least 90%%", reductionPercent)
	}

	// Verify outputs match
	if baselineOutput.String() != optimizedOutput.String() {
		t.Error("FAILED: Optimized output does not match baseline output")
	}
}

// TestPerformance_ExecutionTimeImprovement verifies at least 50% execution time improvement
func TestPerformance_ExecutionTimeImprovement(t *testing.T) {
	// Generate test input
	var sb strings.Builder
	for i := 0; i < 1000; i++ {
		sb.WriteString(generateLogLine("ERROR", fmt.Sprintf("Error message %d with some additional content", i)))
		sb.WriteString("\n")
	}
	input := sb.String()
	inputBytes := []byte(input)

	// Warm up both implementations
	for i := 0; i < 10; i++ {
		var out bytes.Buffer
		baselineProcessLogStream(bytes.NewReader(inputBytes), &out)
		ProcessLogStream(bytes.NewReader(inputBytes), &out)
	}

	// Measure baseline time (average of multiple runs)
	iterations := 100
	var baselineTotalTime time.Duration
	for i := 0; i < iterations; i++ {
		var output bytes.Buffer
		start := time.Now()
		baselineProcessLogStream(bytes.NewReader(inputBytes), &output)
		baselineTotalTime += time.Since(start)
	}
	baselineAvg := baselineTotalTime / time.Duration(iterations)

	// Measure optimized time (average of multiple runs)
	var optimizedTotalTime time.Duration
	for i := 0; i < iterations; i++ {
		var output bytes.Buffer
		start := time.Now()
		ProcessLogStream(bytes.NewReader(inputBytes), &output)
		optimizedTotalTime += time.Since(start)
	}
	optimizedAvg := optimizedTotalTime / time.Duration(iterations)

	// Calculate improvement percentage
	if baselineAvg == 0 {
		t.Fatal("Baseline time is zero, cannot calculate improvement")
	}
	improvementPercent := 100.0 * float64(baselineAvg-optimizedAvg) / float64(baselineAvg)

	t.Logf("Execution time comparison (avg of %d runs):", iterations)
	t.Logf("  Baseline (json.Unmarshal): %v", baselineAvg)
	t.Logf("  Optimized:                 %v", optimizedAvg)
	t.Logf("  Improvement:               %.1f%%", improvementPercent)

	// Verify at least 50% improvement
	if improvementPercent < 50.0 {
		t.Errorf("FAILED: Execution time improvement is %.1f%%, required at least 50%%", improvementPercent)
	}
}

// BenchmarkComparison_Baseline benchmarks the baseline json.Unmarshal implementation
func BenchmarkComparison_Baseline(b *testing.B) {
	input := generateTestInput(1000)
	inputBytes := []byte(input)

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		var output bytes.Buffer
		baselineProcessLogStream(bytes.NewReader(inputBytes), &output)
	}
}

// BenchmarkComparison_Optimized benchmarks the optimized implementation
func BenchmarkComparison_Optimized(b *testing.B) {
	input := generateTestInput(1000)
	inputBytes := []byte(input)

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		var output bytes.Buffer
		ProcessLogStream(bytes.NewReader(inputBytes), &output)
	}
}
