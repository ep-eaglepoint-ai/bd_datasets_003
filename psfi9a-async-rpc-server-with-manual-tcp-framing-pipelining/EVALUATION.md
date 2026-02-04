# Async RPC Server - Evaluation Guide

## Running Tests

### Run tests directly using pytest:
```bash
python3 -m pytest tests/ -v
```

### Run tests via Docker Compose:
```bash
docker compose run --rm test
```

## Running Evaluation

The evaluation script runs all tests and generates a comprehensive `report.json` file.

### Run evaluation via Docker Compose:
```bash
docker compose run --rm evaluate
```

### Report Location

The report is generated in a timestamped directory:
```
evaluation/YYYY-MM-DD/HH-MM-SS/report.json
```

Example:
```
evaluation/2026-02-04/10-41-28/report.json
```

## Report Format

The `report.json` contains:
- **run_id**: Unique identifier for this test run
- **timestamps**: Started/finished times in ISO format
- **duration_seconds**: Total execution time
- **success**: Boolean indicating if all tests passed
- **environment**: System information (Python version, platform, OS, architecture, hostname)
- **results.after.tests**: Array of individual test results with:
  - `name`: Test function name
  - `status`: "passed", "failed", or "skipped"
  - `duration`: Test duration in milliseconds
  - `failureMessages`: Array of error messages if failed
- **results.after.summary**: Test summary (total, passed, failed, xfailed, errors, skipped)
- **comparison**: High-level test results summary

## Current Test Coverage

**18 Tests Total:**

1. `test_parse_header_valid` - Valid header parsing
2. `test_parse_header_wrong_magic_number` - Invalid magic number
3. `test_parse_header_buffer_too_small` - Insufficient buffer
4. `test_parse_header_empty_buffer` - Empty buffer handling
5. `test_parse_header_with_extra_bytes` - Extra bytes after header
6. `test_buffer_fragmentation` - Fragmented header handling
7. `test_buffer_coalescing` - Multiple requests in one read
8. `test_buffer_malformed_header` - Malformed header in buffer
9. `test_process_request_concurrency` - Concurrent processing
10. `test_process_request_basic` - Basic request processing
11. `test_write_response_atomic` - Atomic response writes
12. `test_write_response_no_interleaving` - No interleaving verification
13. `test_handle_client_fragmented_headers` - Fragmented headers integration
14. `test_handle_client_pipelined_requests` - Pipelined requests
15. `test_handle_client_malformed_input` - Malformed input closes connection
16. `test_graceful_client_completion` - Graceful task completion
17. `test_fragmentation_100ms_delay` - 100ms fragmentation delay (Requirement 10)
18. `test_pipelining_10_fast_1_slow` - 10 fast + 1 slow pipelining (Requirement 11)

## Requirements Coverage

All 12 requirements from the prompt are fully covered. See `requirements_verification.md` for detailed mapping.
