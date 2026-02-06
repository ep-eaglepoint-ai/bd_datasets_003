#!/usr/bin/env bash
set -euo pipefail

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Generate unique run identifier
RUN_ID=$(date +%Y%m%d_%H%M%S)_$(openssl rand -hex 4 2>/dev/null || echo "$$")

# Start timestamp
START_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Get environment metadata
OS_INFO=$(uname -s)
ARCH=$(uname -m)
CPU_COUNT=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo "unknown")

# Get C++ compiler version
CXX_VERSION=$(docker run --rm gcc:13 g++ --version 2>/dev/null | head -n 1 || echo "unknown")

# Helper function to escape JSON strings
json_escape() {
    echo "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/$/\\n/' | tr -d '\n' | sed 's/\\n$//'
}

# Helper function to create JSON string
json_string() {
    local str="$1"
    local escaped=$(json_escape "$str")
    echo "\"$escaped\""
}

# Function to run tests and capture results
run_tests() {
    local repo_dir=$1
    local output_file=$(mktemp)
    local error_file=$(mktemp)
    local start_time=$(date +%s)
    
    echo "Running tests for $repo_dir..." >&2
    
    # Run docker compose and capture output
    local exit_code=0
    local passed=false
    if docker compose run --rm -e REPO_DIR="$repo_dir" app > "$output_file" 2>"$error_file"; then
        exit_code=0
        passed=true
    else
        exit_code=$?
        passed=false
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # Combine stdout and stderr
    local output=$(cat "$output_file" "$error_file" 2>/dev/null || echo "")
    
    # Extract test results from output
    local test_count=0
    local failed_count=0
    local total_tests=0
    
    # Try to extract test counts from Google Test output
    if echo "$output" | grep -q "\[  PASSED  \]"; then
        test_count=$(echo "$output" | grep -oP '\[\s*PASSED\s*\]\s+\K\d+' | tail -1 || echo "0")
    fi
    if echo "$output" | grep -q "\[  FAILED  \]"; then
        failed_count=$(echo "$output" | grep -oP '\[\s*FAILED\s*\]\s+\K\d+' | tail -1 || echo "0")
    fi
    
    # Try to get total test count
    if echo "$output" | grep -q "Running.*tests"; then
        total_tests=$(echo "$output" | grep -oP 'Running\s+\K\d+' | tail -1 || echo "0")
    fi
    if [ "$total_tests" = "0" ] && [ "$test_count" != "0" ]; then
        total_tests=$test_count
    fi
    
    rm -f "$output_file" "$error_file"
    
    # Create JSON output manually (without jq dependency)
    local output_json=$(json_string "$output")
    
    cat <<EOF
{
  "exitCode": $exit_code,
  "passed": $passed,
  "duration": $duration,
  "testCount": $total_tests,
  "passedCount": $test_count,
  "failedCount": $failed_count,
  "output": $output_json
}
EOF
}

# Check if repository_before exists and has source files
BEFORE_EXISTS=false
if [ -d "repository_before/src" ] && [ "$(find repository_before/src -name '*.cpp' -o -name '*.h' 2>/dev/null | wc -l)" -gt 0 ]; then
    BEFORE_EXISTS=true
fi

# Run tests for repository_before
if [ "$BEFORE_EXISTS" = true ]; then
    BEFORE_RESULT=$(run_tests "repository_before")
else
    BEFORE_RESULT=$(cat <<EOF
{
  "exitCode": 0,
  "passed": true,
  "duration": 0,
  "testCount": 0,
  "passedCount": 0,
  "failedCount": 0,
  "output": "repository_before not found or empty"
}
EOF
)
fi

# Run tests for repository_after
AFTER_RESULT=$(run_tests "repository_after")

# End timestamp
END_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Calculate total duration
START_EPOCH=$(date -d "$START_TIME" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$START_TIME" +%s 2>/dev/null || echo "0")
END_EPOCH=$(date -d "$END_TIME" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$END_TIME" +%s 2>/dev/null || echo "0")
TOTAL_DURATION=$((END_EPOCH - START_EPOCH))

# Extract values from JSON results (simple parsing without jq)
extract_json_value() {
    local json="$1"
    local key="$2"
    echo "$json" | grep -oP "\"$key\"\s*:\s*\K[^,}]+" | head -1 | tr -d ' "'
}

BEFORE_PASSED=$(extract_json_value "$BEFORE_RESULT" "passed")
AFTER_PASSED=$(extract_json_value "$AFTER_RESULT" "passed")
BEFORE_TEST_COUNT=$(extract_json_value "$BEFORE_RESULT" "testCount")
AFTER_TEST_COUNT=$(extract_json_value "$AFTER_RESULT" "testCount")
BEFORE_PASSED_COUNT=$(extract_json_value "$BEFORE_RESULT" "passedCount")
AFTER_PASSED_COUNT=$(extract_json_value "$AFTER_RESULT" "passedCount")
BEFORE_FAILED_COUNT=$(extract_json_value "$BEFORE_RESULT" "failedCount")
AFTER_FAILED_COUNT=$(extract_json_value "$AFTER_RESULT" "failedCount")

# Determine final success
FINAL_SUCCESS=false
if [ "$BEFORE_PASSED" = "true" ] && [ "$AFTER_PASSED" = "true" ]; then
    FINAL_SUCCESS=true
fi

# Create comparison summary
COMPARISON_SUMMARY=$(cat <<EOF
{
  "beforePassed": $BEFORE_PASSED,
  "afterPassed": $AFTER_PASSED,
  "beforeTestCount": $BEFORE_TEST_COUNT,
  "afterTestCount": $AFTER_TEST_COUNT,
  "beforePassedCount": $BEFORE_PASSED_COUNT,
  "afterPassedCount": $AFTER_PASSED_COUNT,
  "beforeFailedCount": $BEFORE_FAILED_COUNT,
  "afterFailedCount": $AFTER_FAILED_COUNT
}
EOF
)

# Escape compiler version for JSON
CXX_VERSION_JSON=$(json_string "$CXX_VERSION")

# Generate final JSON report
REPORT=$(cat <<EOF
{
  "runId": "$RUN_ID",
  "startTime": "$START_TIME",
  "endTime": "$END_TIME",
  "duration": $TOTAL_DURATION,
  "environment": {
    "os": "$OS_INFO",
    "architecture": "$ARCH",
    "cpuCount": "$CPU_COUNT",
    "compiler": $CXX_VERSION_JSON
  },
  "before": $BEFORE_RESULT,
  "after": $AFTER_RESULT,
  "comparison": $COMPARISON_SUMMARY,
  "success": $FINAL_SUCCESS,
  "error": null
}
EOF
)

# Write report to JSON file
REPORT_FILE="$PROJECT_ROOT/evaluation/report.json"
echo "$REPORT" > "$REPORT_FILE"

# Pretty print if jq is available, otherwise just show the file location
if command -v jq >/dev/null 2>&1; then
    echo "Evaluation complete. Report written to evaluation/report.json"
    echo "$REPORT" | jq .
else
    echo "Evaluation complete. Report written to evaluation/report.json"
    echo "Install jq for pretty-printed output: $REPORT_FILE"
fi
