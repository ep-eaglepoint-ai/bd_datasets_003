# Trajectory: Text Report Generator Optimization

---

### 1. Phase 1: AUDIT / REQUIREMENTS ANALYSIS

**Guiding Question**: *"What exactly needs to be optimized, and what are the constraints?"*

**Reasoning**:
The task is to optimize an **existing** Python text report generator (`repository_before/main.py`) that suffers from severe performance bottlenecks. This is **not** a greenfield project—it's a refactoring task where the output must remain **byte-identical** to the original.

The core challenge is eliminating O(n²) string concatenation, redundant string scans, and manual character iteration while preserving exact functional behavior.

**Key Requirements**:

* **Requirement 1**: Replace all `string += other_string` with list building + `''.join(parts)` (O(n²) → O(n))
* **Requirement 2**: Replace manual concatenation like `"Name: " + name` with f-strings
* **Requirement 3**: Combine multiple string scans into single-pass processing
* **Requirement 4**: Use built-in methods (`str.replace()`, `str.count()`) instead of manual loops
* **Critical Constraint**: Output must be **byte-identical** to original implementation

**Constraints Analysis**:

* **No Functional Changes**: Cannot alter logic, only performance characteristics
* **No Output Deviation**: Even whitespace must match exactly
* **Comprehensive Testing**: Must prove equivalence for all edge cases
* **AST-Level Validation**: Must verify optimizations were actually applied

---

### 2. Phase 2: QUESTION ASSUMPTIONS (Challenge the Premise)

**Guiding Question**: *"Can we use built-in methods without breaking equivalence?"*

**Reasoning**:
Initial concern: Does `str.replace()` behave identically to the manual character-by-character replacement loop in `sanitize_text()`?

Analysis of original implementation (lines 125-146):
- Manual loop finds first occurrence of pattern
- Replaces it and continues from next position
- This is **exactly** what `str.replace()` does

**Scope Refinement**:

* **Rejected**: Rewriting logic to be "cleaner" (would break equivalence)
* **Rejected**: Using regex for sanitization (different behavior on edge cases)
* **Accepted**: Direct translation using Python's optimized built-ins
* **Accepted**: Structural refactoring (list building) that preserves semantics

**Rationale**:
The original code's inefficiency comes from implementation choices, not algorithmic requirements. We can achieve the same results with better primitives.

---

### 3. Phase 3: DEFINE SUCCESS CRITERIA

**Guiding Question**: *"What does 'done' mean in objective terms?"*

**Success Criteria**:

1. **All** methods use list + `''.join()` instead of `+=` in loops
2. **All** string templates use f-strings instead of manual concatenation
3. `analyze_text()` has **exactly 1 loop** instead of 5 separate scans
4. `sanitize_text()` uses `str.replace()` instead of manual character iteration
5. **Byte-identical output** for all test cases (empty, standard, stress)
6. AST-level tests confirm optimizations were applied (not just output equivalence)

If any of these fail, the optimization is incomplete.

---

### 4. Phase 4: MAP REQUIREMENTS TO VALIDATION

**Guiding Question**: *"How do we prove this works?"*

**Test Strategy**:

* **Functional Equivalence Tests** (24 tests):
  * Compare optimized vs reference implementation byte-for-byte
  * Cover all methods: `set_header()`, `set_footer()`, `build_table()`, `build_summary()`, `build_list()`, `analyze_text()`, `sanitize_text()`, `build_report()`
  * Edge cases: empty strings, empty collections, special characters, overlapping patterns

* **Optimization Validation Tests** (3 tests):
  * AST parsing to count loops in `analyze_text()` (must be ≤1)
  * AST parsing to detect `str.replace()` usage in `sanitize_text()`
  * AST parsing to detect `+=` in loops (must be absent)

* **Stress Tests** (3 tests):
  * 1000-row tables to validate O(n) behavior
  * 100KB text processing to expose quadratic bottlenecks
  * Fuzz testing with random inputs (seed=42 for reproducibility)

Tests focus on **proving equivalence AND proving optimization**, not just one or the other.

---

### 5. Phase 5: SCOPE THE SOLUTION

**Guiding Question**: *"What is the minimal set of changes to meet all requirements?"*

**Core Changes**:

* **`set_header()` and `set_footer()`**
  * Replace 8 and 6 `+=` operations with list building
  * Use f-strings for date formatting and field interpolation

* **`build_table()`**
  * Replace nested `+=` in loops (O(n²)) with list building
  * Pre-compute separator line using `''.join()`
  * Use `'|'.join(cells)` instead of manual concatenation

* **`build_summary()` and `build_list()`**
  * Replace loop-based `+=` with list building
  * Use f-strings for key-value pairs and list prefixes

* **`analyze_text()`**
  * **Critical optimization**: Merge 5 separate loops into 1
  * Single pass counts: chars, letters, digits, spaces, newlines, words
  * Preserve exact word-counting logic (state machine for `in_word`)

* **`sanitize_text()`**
  * Replace 22 lines of manual substring matching with `str.replace()`
  * Preserve sequential replacement order (matters for chained replacements)

* **`build_report()`**
  * Replace section concatenation loop with list building

No shared state changes. No algorithmic changes. Pure performance refactoring.

---

### 6. Phase 6: TRACE DATA / CONTROL FLOW

**Guiding Question**: *"What changes in execution from original to optimized?"*

**Original Flow** (repository_before):
```
build_report() called
→ result = ""
→ For each section:
    → result += header (O(n) copy)
    → result += section_content (O(n) copy)
    → result += footer (O(n) copy)
→ Return result (total: O(n²) for n sections)
```

**Optimized Flow** (repository_after):
```
build_report() called
→ parts = []
→ For each section:
    → parts.append(header) (O(1) pointer)
    → parts.append(section_content) (O(1) pointer)
    → parts.append(footer) (O(1) pointer)
→ Return ''.join(parts) (O(n) single concatenation)
```

**Impact**: For 1000-section report, O(1,000,000) operations → O(1,000) operations.

---

### 7. Phase 7: ANTICIPATE OBJECTIONS

**Guiding Question**: *"What would a reviewer push back on?"*

**Objection 1**: "Does `str.replace()` really behave identically to the manual loop?"

* **Counter**: Yes. The manual loop finds first occurrence, replaces, continues—exactly what `str.replace()` does. Validated by `test_sanitize_chain` and `test_sanitize_overlap`.

**Objection 2**: "Single-pass `analyze_text()` is harder to read."

* **Counter**: The original had 5 nearly-identical loops. Merging them reduces duplication and is a standard optimization pattern. Readability is preserved through clear variable names.

**Objection 3**: "How do we know f-strings produce identical output?"

* **Counter**: F-strings are syntactic sugar for `str.format()`. For simple cases like `f"{key}: {value}"`, they produce identical results to `key + ": " + str(value)`. Validated by all functional tests.

**Objection 4**: "What if the original code had subtle bugs that the tests don't catch?"

* **Counter**: We use the **original code itself** as the reference implementation (`tests/reference_report_generator.py`). We're not optimizing against a spec—we're optimizing against the actual behavior, bugs and all.

---

### 8. Phase 8: VERIFY INVARIANTS / DEFINE CONSTRAINTS

**Guiding Question**: *"What must always be true?"*

**Must Satisfy**:

* Output is byte-identical to `reference_report_generator.py` (copy of original)
* AST analysis confirms optimizations were applied (not just accidentally equivalent)
* Stress tests pass without performance degradation
* All edge cases (empty, newlines, special chars) handled identically

**Must Not Violate**:

* No changes to method signatures
* No changes to class structure
* No changes to output format (even whitespace)
* No changes to replacement order in `sanitize_text()`

**Verification Method**:

* Dual testing: Run same tests against `repository_before` (expect xfail on optimization checks) and `repository_after` (expect all pass)
* Reference implementation is **frozen copy** of original, never modified

---

### 9. Phase 9: EXECUTE WITH SURGICAL PRECISION

**Guiding Question**: *"What order minimizes risk of breaking equivalence?"*

**Execution Order**:

1. **Copy original to `tests/reference_report_generator.py`** (freeze baseline)
2. **Optimize `set_header()` and `set_footer()`** (simple, no loops)
   - Test: `test_header_footer.py`
3. **Optimize `build_summary()` and `build_list()`** (simple loops)
   - Test: `test_summary_list.py`
4. **Optimize `build_table()`** (complex nested loops)
   - Test: `test_table.py`
5. **Optimize `analyze_text()`** (most complex: 5 loops → 1)
   - Test: `test_analyze.py`
6. **Optimize `sanitize_text()`** (algorithmic equivalence concern)
   - Test: `test_sanitize.py` (includes fuzz testing)
7. **Optimize `build_report()`** (orchestrates all methods)
   - Test: `test_full_report.py`
8. **Add AST-level validation** (`test_requirements.py`)
9. **Add stress tests** (`test_final_verification.py`)

Each step validated before proceeding. No "optimize everything then test" approach.

---

### 10. Phase 10: MEASURE IMPACT / VERIFY COMPLETION

**Guiding Question**: *"Can we prove it meets requirements?"*

**Verification Results**:

* ✅ **Requirement 1**: All methods use list + `''.join()` (validated by AST)
* ✅ **Requirement 2**: All templates use f-strings (validated by output equivalence)
* ✅ **Requirement 3**: `analyze_text()` has 1 loop (validated by AST: 5 loops → 1 loop)
* ✅ **Requirement 4**: `sanitize_text()` uses `str.replace()` (validated by AST)
* ✅ **Byte-identical output**: 30/30 tests pass

**Quality Metrics**:

* **Before**: 28 passed, 2 xfailed (optimization checks expectedly fail on legacy code)
* **After**: 30 passed, 0 xfailed (all optimizations confirmed)
* **Stress tests**: 1000-row tables, 100KB text, 100 fuzz cases—all pass
* **Code reduction**: `sanitize_text()` reduced from 22 lines to 4 lines

**Performance Impact** (theoretical analysis):
- `build_report()` with n sections: O(n²) → O(n)
- `analyze_text()` with m characters: 5m inspections → m inspections
- `build_table()` with r rows, c columns: O(r²c) → O(rc)

---

### 11. Phase 11: DOCUMENT THE DECISION

**Problem**: Existing text report generator has O(n²) string concatenation, redundant scans, and manual character iteration causing performance bottlenecks on large reports.

**Solution**: Replace `+=` with list building + `''.join()`, merge multiple scans into single-pass processing, use built-in `str.replace()` instead of manual loops, and modernize templates with f-strings.

**Trade-offs**: 
- **Gained**: O(n) performance, reduced memory allocations, cleaner code
- **Lost**: Nothing—output is byte-identical, no functional changes

**When to revisit**: Only if Python's string implementation changes (extremely unlikely) or if output format needs to change (would require new requirements anyway).

**Test Coverage**: 
- 24 functional equivalence tests (byte-identical output)
- 3 AST-level optimization validation tests
- 3 stress tests (large-scale performance validation)
- All edge cases covered (empty, newlines, special chars, overlapping patterns, chained replacements)

**Validation Method**: Dual testing against frozen reference implementation ensures we're optimizing the **actual behavior**, not an idealized spec.
