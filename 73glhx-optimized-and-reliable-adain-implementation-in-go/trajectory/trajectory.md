# Trajectory: Adaptive Instance Normalization (AdaIN) Optimization in Go

## Phase 1: Audit / requirements

The baseline implementation (repository_before) was mathematically correct but structurally inefficient. Root causes: deeply nested loops (4 levels: N→C→H→W) with repeated index calculations at the innermost level via the `I()` method, creating O(N×C×H×W) redundant arithmetic operations. Single-letter naming (`X`, `Z`, `Y`, `R`, `Q`, `I`) made the code unreadable. No validation for 4D shape requirement (only checked `len < 3`). Allocation pattern created multiple intermediate tensors in stat computation. The problem: optimize this implementation to reduce nesting, minimize indexing overhead, improve cache locality, and add proper validation—while preserving exact mathematical behavior within floating-point tolerance.

## Phase 2: Question assumptions

We didn't need to change the public API or tensor representation. The fix was surgical: flatten the spatial dimensions (H×W) into a single loop index, hoist offset calculations out of inner loops, use descriptive names, and add strict 4D validation. The original algorithm (per-channel mean/std over spatial dims, normalization, style application, alpha blending) could stay; we just needed to restructure the loops and memory access pattern. Keeping repository_before unchanged (with its inefficient code) let us run the same test suite against both and demonstrate optimization impact via AST analysis and benchmarks.

## Phase 3: Success criteria

Correctness: compute per-channel, per-sample mean and standard deviation correctly (Req 1); support optional spatial masking for content and style (Req 2); preserve alpha-based blending with original content (Req 3); produce numerically equivalent outputs within floating-point tolerance (Req 4); handle zero-mask and edge cases without NaN or Inf (Req 9); maintain deterministic behavior for identical inputs (Req 10); include proper shape validation and error handling (Req 11). Optimization: avoid deeply nested loops where possible—target max depth 3 (Req 5); minimize repeated indexing and memory accesses (Req 6); reduce unnecessary heap allocations and temporary arrays (Req 7); ensure spatial and temporal cache locality for better performance (Req 8); modular and readable structure with descriptive naming (Req 12).

## Phase 4: Validation

The test suite lives under tests/ with functional_test.go (correctness via golden reference implementation) and optimization_test.go (structural checks via AST parsing and performance benchmarks). Functional tests use a reference implementation (refApplyAdaIN) that mirrors the exact math of repository_before and compares outputs with tolerance. Optimization tests parse Go AST to verify loop nesting depth ≤3, check for absence of Index/I calls in innermost loops, forbid single-letter exported identifiers, and measure allocations and execution time. evaluation/evaluation.go runs tests against both repository_before and repository_after, mapping each test to a requirement, and generates a JSON report. repository_before fails optimization tests (nested loops, poor naming, repeated indexing); repository_after passes all 12 requirements.

## Phase 5: Scope

Changes are in repository_after/adain/adain.go: `NewTensor`, `Index`, `Validate` (strict 4D check), `ComputeMeanStd` (flattened spatial loop with hoisted offset), `ApplyAdaIN` (same pattern, plus final NaN/Inf check). repository_before/adain/adain.go remains strictly untouched to preserve the baseline state. Compatibility is achieved via build-tag adapters in the tests folder: `tests/test_adapter_before.go` maps the legacy API to the test interface, and `tests/test_adapter_after.go` maps the modern API. Tests include functional_test.go (golden reference comparison), optimization_test.go (AST + benchmarks), main_test.go (pytest-style output with pass/fail summary), and runner.go (dynamic workspace switching). evaluation/evaluation.go and timestamped report.json outputs stay in the evaluation/ folder.

## Phase 6: Data / control flow

Before: For mean/std computation, loops N→C→H→W with `f.D[f.I(a, b, i, j)]` at every access (calling I() which computes `((a*S[1]+b)*S[2]+i)*S[3]+j` each time). In ApplyAdaIN normalization, same 4-deep loop structure with index recalculation. After: Compute `spatialSize = H * W` once, then loops N→C→spatialSize with `offset = x.Index(n, c, 0, 0)` hoisted outside the spatial loop. Inner loop uses `x.Data[offset+i]` for direct array access. For masked operations, mask index is computed on-the-fly using division and modulo when necessary, which is still more efficient than the original 4-deep pattern. Circuit is: validate inputs → compute content mean/std → compute style mean/std → normalize content using content stats → apply style stats → alpha blend → final validation.

## Phase 7: Objections

More complex loop indexing (i/H, i%W for mask)? Counter: division/modulo happens only when mask is non-nil and is dominated by the savings from hoisting offset calculation; profiling shows net improvement. AST tests could break on refactors that preserve performance? Counter: the tests check structural properties (loop depth, naming) that are explicit optimization requirements, not implementation details. Another concern: strict 4D validation vs loose check in before. Intentional: the requirement says "proper shape validation," and 4D is the only valid shape for this algorithm in this context.

## Phase 8: Invariants

We had to preserve exact mathematical behavior: same mean, same std (with epsilon), same normalization formula, same style application, same alpha blending. Verified by running the reference implementation (which is a direct port of repository_before logic) and comparing outputs with 1e-5 tolerance. We added stricter validation (4D shape, NaN/Inf checks) which is allowed because strengthening error handling doesn't break valid use cases. The public interface used by tests is unified via the `TestTensor` and `TestApplyAdaIN` definitions in the test adapters.

## Phase 9: Execution order

Implement optimized adain.go first with descriptive types (Tensor vs X) and efficient loops. Create the test adapters (`tests/test_adapter_after.go` with `//go:build after` and `tests/test_adapter_before.go` with `//go:build !after`) to allow the same test code to run against both repositories. Then create tests/functional_test.go with reference implementation comparison and tests/optimization_test.go with AST walkers and benchmarks. Update tests/main_test.go for reporting. Configure runner.go to handle dynamic workspace switching and build tag selection. Finally, update evaluation.go for automated multi-repository testing and reporting.

## Phase 10: Measure

We know it's better because: repository_after passes all 12 requirements (12/12), whereas repository_before fails optimization and naming requirements. Specific failures in before: TestReq5 detects loop depth 4; TestReq6 detects repeated Index calls inside innermost loops; TestReq12 detects single-letter exports (X, Z, Y, R, Q, I); TestReq11 fails on strict 4D validation. Functional tests pass on both, confirming correctness is preserved. Evaluation report confirms 100% satisfaction for the optimized version.

## Phase 11: Document the decision

Problem: the AdaIN implementation was inefficient due to deeply nested loops (4 levels), repeated index calculations at every array access, poor naming, and weak validation. Solution: flatten spatial dimensions into a single loop (reducing nesting from 4 to 3), hoist offset calculations outside inner loops, use descriptive names, and add strict 4D shape validation. A build-tag based adapter strategy in the tests folder allowed for rigorous comparison without modifying the original code. This approach ensures maximal performance gains and code maintainability while keeping the research baseline pristine.

## Phase 12: Infrastructure and Tooling

- **go.work** at project root using Go 1.25.5 and `use (./tests ./evaluation ./repository_after)` for default development.
- **Docker** uses `golang:1.25.5-alpine3.22` as the base image to provide the required Go version for modern builds.
- **runner.go** generates a temporary go.work pointing to the target repository, runs `go test -v -tags <tag> .`, and manages exit codes (exiting 0 for expected failures in before for CI compatibility).
- **evaluation.go** automates the full evaluation by switching workspaces, running tests for both repositories, and generating a timestamped report.json mapping requirements to test outcomes.
- **Test Adapters** utilize Go build tags (`//go:build after`) to transparently switch between modern and legacy Tensor APIs without modifying the source repositories.
- **AST testing** uses `go/ast` and `go/parser` to statically verify structural requirements like loop nesting depth and naming conventions.
- **.gitignore** updated to exclude test artifacts, evaluation reports, and temporary build files.
