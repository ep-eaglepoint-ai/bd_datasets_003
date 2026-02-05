# Trajectory: Byte-Level BPE Implementation

## Problem Analysis

Standard BPE operates on characters, which creates unknown tokens for rare Unicode. Byte-Level BPE solves this by operating on UTF-8 bytes (0-255), guaranteeing zero unknown tokens since any Unicode string decomposes to bytes.

Critical requirements:
1. UTF-8 byte processing: `list(text.encode('utf-8'))` before any operations
2. Priority-ordered merging: Apply merge rules in exact list order
3. Exhaustive application: Each merge rule applied until no matches remain
4. Lossless reversibility: `decode(encode(text)) == text` for all valid Unicode

## Algorithm Selection

**Encoding**: Iterative merge application with single-pass scanning
- O(N) per merge attempt via left-to-right scan
- Priority order maintained by sequential rule processing
- Exhaustiveness achieved by repeating until no changes

**Decoding**: Recursive token decomposition
- Base case: tokens < 256 are bytes
- Recursive case: decompose using merge_map
- Natural fit for hierarchical token structure

**Data Structures**:
- `merges: list[tuple[int, int]]` - Preserves priority order
- `pair_to_token: dict` - O(1) encoding lookup
- `merge_map: dict` - O(1) decoding lookup

## Implementation Strategy

1. **Initialization**: Validate merge rules, build lookup dictionaries
2. **Encoding**: UTF-8 conversion → priority-ordered merge application
3. **Decoding**: Recursive decomposition → UTF-8 string reconstruction
4. **Error Handling**: Validate inputs, handle invalid UTF-8 gracefully

## Edge Cases

- Empty inputs: `encode("") → []`, `decode([]) → ""`
- Boundary values: Byte 0 and 255 handled correctly
- Invalid UTF-8: Uses replacement character (U+FFFD)
- Consecutive patterns: "AAAA" with merge (65,65) → [256, 256]
- Multi-level merges: Token 257 = (256, 67) where 256 = (65, 66)

## Critical Test Cases

**Emoji Test**: "👋" with merge (240, 159) → [256, 145, 139]
- Validates UTF-8 byte decomposition: [240, 159, 145, 139]
- Breaks character-level implementations

**Overlap Test**: [1, 2, 3] with merges [(1, 2), (2, 3)] → [256, 3]
- Validates priority ordering
- Breaks greedy implementations

## Resources

- Python UTF-8 encoding: https://docs.python.org/3/library/stdtypes.html#str.encode
- Byte Pair Encoding: https://en.wikipedia.org/wiki/Byte_pair_encoding
- UTF-8 specification: https://en.wikipedia.org/wiki/UTF-8

## Validation

Pass All tests:
- Initialization and validation
- UTF-8 byte processing
- Priority-ordered merging
- Round-trip consistency
- Invalid UTF-8 handling
- Performance (20,000 chars < 5s)
- Adversarial cases
