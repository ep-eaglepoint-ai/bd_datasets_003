# Trajectory (Thinking Process for Refactoring)

## 1. Audit the Original Code (Identify Scaling Problems)

I audited the original code. It used string concatenation (`+=`) inside loops, which forces Java to copy the entire string content on every iteration, leading to O(N²) complexity. It also repeatedly instantiated expensive `SimpleDateFormat` and `NumberFormat` objects for every single transaction, creating unnecessary heap pressure.

## 2. Define a Performance Contract First

I defined performance conditions: the report generation must execute in linear time O(N) relative to the number of transactions. Expensive objects (formatters) must be instantiated exactly once per request, and memory churn must be minimized by using mutable buffers.

## 3. Rework the Memory Model for Efficiency

I introduced `StringBuilder` to replace immutable `String` concatenation. This allows the report to be constructed in a single mutable character buffer, eliminating the creation of thousands of intermediate string objects that would otherwise trigger frequent garbage collection.

## 4. Implement Capacity Planning

I added an `estimateCapacity` strategy to pre-size the `StringBuilder`. By calculating the approximate size requirement upfront (`transactionCount * avgSize`), we avoid expensive array resizing and copying operations as the report grows.

## 5. Hoist Expensive Initializations (Scope Optimization)

All heavy initialization logic (like `SimpleDateFormat` and `NumberFormat`) was moved out of loops and into the method scope. This reduced object creation from N (one per transaction) to 1 (one per report), drastically reducing CPU overhead.

## 6. Null Safety and robustness

I introduced defensive coding patterns to handle potential dirty data. Explicit null checks were added for dates to prevent `NullPointerException`, and division-by-zero safeguards were added for the summary calculations in case of empty transaction lists.

## 7. Efficient Data Traversal

I maintained a simple iteration strategy but ensured that operations within the loop are O(1). The logic avoids nested loops or expensive lookups for standard formatting, keeping the traversal strictly linear.

## 8. Eliminate Redundant Object Creation

I eliminated the memory equivalent of the "N+1 problem" by ensuring that formatting a line does not result in multiple temporary string objects. Every append operation now goes directly into the primary buffer.

## 9. Standardize Formatting Logic

I centralized the formatting settings by sharing single instances of formatters. This ensures that if the locale or date format needs to change, it is enforced consistently across the entire report without hunting down multiple instantiation points.

## 10. Result: Measurable Performance Gains + Predictable Signals

The solution now runs in linear time O(N) instead of quadratic time. It generates negligible garbage compared to the original, handles large datasets without risk of `OutOfMemoryError`, and correctly handles edge cases like missing dates or empty lists.

---

# Trajectory Transferability Notes

The above trajectory is designed for **Refactoring**. The steps outlined in it represent reusable thinking nodes (audit, contract definition, structural changes, execution, and verification).

The same nodes can be reused to transfer this trajectory to other hard-work categories (such as full-stack development, performance optimization, testing, and code generation) by changing the focus of each node, not the structure.

Below are the nodes extracted from this trajectory. These nodes act as a template that can be mapped to other categories by adapting the inputs, constraints, and validation signals specific to each task type.

### Refactoring → Full-Stack Development

- **Audit**: Replace code audit with system & product flow audit
- **Contract**: Performance contract becomes API, UX, and data contracts
- **Model**: Data model refactor extends to DTOs and frontend state shape
- **Optimization**: Query optimization maps to API payload shaping
- **Pagination**: Applies to backend + UI (cursor / infinite scroll)
- **Verification**: Add API schemas, frontend data flow, and latency budgets

### Refactoring → Performance Optimization

- **Audit**: Code audit becomes runtime profiling & bottleneck detection
- **Contract**: Performance contract expands to SLOs, SLAs, latency budgets
- **Model**: Data model changes include indexes, caches, async paths
- **Optimization**: Query refactors focus on hot paths
- **Verification**: Uses metrics, benchmarks, and load tests
- **Tools**: Add observability tools and before/after measurements

### Refactoring → Testing

- **Audit**: Code audit becomes test coverage & risk audit
- **Contract**: Performance contract becomes test strategy & guarantees
- **Model**: Data assumptions convert to fixtures and factories
- **Optimization**: Stable ordering maps to deterministic tests
- **Verification**: Final verification becomes assertions & invariants
- **Coverage**: Add test pyramid placement and edge-case coverage

### Refactoring → Code Generation

- **Audit**: Code audit becomes requirements & input analysis
- **Contract**: Performance contract becomes generation constraints
- **Model**: Data model refactor becomes domain model scaffolding
- **Optimization**: Projection-first thinking becomes minimal, composable output
- **Verification**: Ensures style, correctness, and maintainability
- **Validation**: Add input/output specs and post-generation validation

### Core Principle (Applies to All)

- The trajectory structure stays the same
- Only the focus and artifacts change
- Audit → Contract → Design → Execute → Verify remains constant
