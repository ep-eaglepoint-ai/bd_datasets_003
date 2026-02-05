# Trajectory: High-Throughput Log Stream Optimization

## 1. Audit the Original Code (Identify Performance Problems)

Audited `repository_before/main.go`. Found critical performance issues:
- **io.ReadAll**: Loads entire file into memory, causing OOM on large files
- **strings.Split**: Creates massive string slice allocations
- **json.Unmarshal in loop**: Heavy GC pressure from parsing every line
- **Unbuffered writes**: High syscall overhead with fmt.Fprintf

## 2. Define a Performance Contract

Defined optimization requirements:
- O(1) memory usage regardless of input size
- Streaming line-by-line processing with bufio
- Zero-allocation JSON field extraction using bytes primitives
- Buffered output to reduce syscalls
- Handle lines longer than default 64KB buffer
- Maintain identical output format: `[ERROR] Message\n`

## 3. Redesign for Streaming Architecture

Replaced batch processing with streaming pipeline:
- `bufio.Scanner` for line-by-line input (constant memory)
- Custom buffer configuration for large lines (up to 10MB)
- `bufio.Writer` for buffered output
- Pre-allocated byte slices for field keys outside loop

## 4. Replace JSON Parsing with Byte Manipulation

Implemented `extractJSONField()` function:
- Uses `bytes.Index` to locate field keys
- Manual byte traversal to extract values
- Handles escaped characters in strings
- Returns byte slices (no string allocations)

## 5. Optimize Memory Allocations

Eliminated allocations in hot path:
- No `string(byteSlice)` conversions in loop
- No `strings.Split` or similar batch operations
- Pre-allocated key byte slices: `levelKey`, `msgKey`, `errorLevel`
- Direct byte comparison with `bytes.Equal`

## 6. Write Comprehensive Tests

Created tests covering all 9 requirements:
1. No io.ReadAll usage (static analysis)
2. Uses bufio for input (static analysis)
3. Uses bufio.Writer for output (static analysis)
4. No json.Unmarshal in loops (AST analysis)
5. Reduced allocations (AST + strings.Split check)
6. Correct output format (functional tests)
7. Handles long lines >64KB (functional tests)
8. O(1) memory usage (memory profiling)
9. Accepts io.Reader/Writer interfaces (functional tests)

## 7. Verification

Tests fail for `repository_before`:
- Uses io.ReadAll (Req 1)
- No bufio for input (Req 2)
- No bufio.Writer (Req 3)
- json.Unmarshal in loop (Req 4)
- strings.Split allocations (Req 5)
- Fails on long lines (Req 7)
- Non-constant memory (Req 8)

Tests pass for `repository_after`:
- All 9 requirements satisfied
- Identical output format maintained
- Edge cases handled (empty lines, malformed JSON, unicode)

## Core Principle

**Audit → Contract → Design → Execute → Verify**

The streaming architecture transforms O(n) memory to O(1) while maintaining correctness.
