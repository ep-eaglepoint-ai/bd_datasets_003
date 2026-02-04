# Trajectory: Text Report Generator

---

### 1. Phase 1: AUDIT / REQUIREMENTS ANALYSIS

**Guiding Question**: *“What exactly needs to be built, and what are the constraints?”*

**Reasoning**:
The goal of `text-report-generator` is to take structured input data and deterministically produce a human-readable text report. This is **not** a template engine, **not** a PDF generator, and **not** an AI-based summarizer. It is a **rules-driven transformation system** that converts validated input into a predictable textual output.

This matters because the core value is **reproducibility and correctness**, not creativity.

**Key Requirements**:

* **Input Handling**: Accept structured input (JSON / CLI args / file-based data).
* **Validation**: Inputs must be validated before report generation.
* **Determinism**: Same input → same output, always.
* **Text Output**: Output must be plain text (no HTML, no Markdown rendering assumptions).
* **Extensibility**: Report sections must be composable, not hardcoded monoliths.

**Constraints Analysis**:

* **No AI / NLP**: This is not a language model task.
* **No UI**: CLI / programmatic usage only.
* **No External Reporting Engines**: Logic must live in-project.
* **Focus**: Correctness over aesthetics.

---

### 2. Phase 2: QUESTION ASSUMPTIONS (Challenge the Premise)

**Guiding Question**: *“Are we overengineering this? What can be safely rejected?”*

**Reasoning**:
Initial temptation was to think in terms of:

* templates
* dynamic layouts
* formatting engines

That would immediately increase complexity without increasing correctness.

**Scope Refinement**:

* **Rejected**: Templating languages (Jinja, Mustache-style).
* **Rejected**: Runtime formatting DSLs.
* **Accepted**: Explicit section builders implemented as code.

**Rationale**:
Explicit code paths make validation, testing, and debugging trivial. Templates hide logic; this system **must expose logic**.

---

### 3. Phase 3: DEFINE SUCCESS CRITERIA

**Guiding Question**: *“What does ‘done’ mean in objective terms?”*

**Success Criteria**:

1. Invalid input **never** produces a report.
2. All report sections are generated through isolated functions.
3. Output format is stable and snapshot-testable.
4. Adding a new section does not require modifying existing ones.
5. Execution works in a non-interactive CLI environment.

If any of these fail, the system is incomplete.

---

### 4. Phase 4: MAP REQUIREMENTS TO VALIDATION

**Guiding Question**: *“How do we prove this works?”*

**Test Strategy**:

* **Unit Tests**:

  * Input validation logic (required fields, types, constraints).
  * Individual section generators.
* **Integration Tests**:

  * Full input → full report snapshot comparison.
* **Negative Tests**:

  * Missing fields.
  * Malformed data.
  * Empty inputs.

Tests focus on **output determinism**, not style.

---

### 5. Phase 5: SCOPE THE SOLUTION

**Guiding Question**: *“What is the smallest correct system?”*

**Core Components**:

* **Validator Layer**

  * Enforces schema-level correctness before execution.
* **Section Builders**

  * Pure functions returning strings.
* **Report Composer**

  * Orders sections and joins them deterministically.
* **CLI Entry Point**

  * Reads input, invokes validation, triggers generation.

No shared mutable state. No hidden globals.

---

### 6. Phase 6: TRACE DATA / CONTROL FLOW

**Guiding Question**: *“What happens from execution to output?”*

**Flow**:
CLI Invocation
→ Load Input
→ Validate Input
→ Generate Section A
→ Generate Section B
→ Generate Section N
→ Compose Final Text
→ Write to stdout / file

If validation fails, execution **halts immediately**.

---

### 7. Phase 7: ANTICIPATE OBJECTIONS

**Guiding Question**: *“What would a reviewer push back on?”*

**Objection 1**: “Why not just use templates?”

* **Counter**: Templates obscure logic and weaken testability.

**Objection 2**: “Why not generate Markdown or HTML?”

* **Counter**: Plain text keeps output environment-agnostic and maximally portable.

**Objection 3**: “This feels verbose.”

* **Counter**: Verbosity here equals explicitness, which equals safety.

---

### 8. Phase 8: VERIFY INVARIANTS / DEFINE CONSTRAINTS

**Guiding Question**: *“What must always be true?”*

**Must Satisfy**:

* Validation precedes generation.
* Section functions are side-effect free.
* Output ordering is fixed and documented.

**Must Not Violate**:

* No silent fallbacks.
* No partial reports on failure.
* No dynamic formatting decisions at runtime.

---

### 9. Phase 9: EXECUTE WITH SURGICAL PRECISION

**Guiding Question**: *“What order minimizes risk?”*

1. Define input schema and validation logic.
2. Implement core section generators.
3. Build report composer.
4. Wire CLI entry point.
5. Add snapshot-based integration tests.

Skipping this order increases debugging cost later.

---

### 10. Phase 10: MEASURE IMPACT / VERIFY COMPLETION

**Guiding Question**: *“Can we prove it meets requirements?”*

**Verification**:

* Known inputs produce byte-identical outputs.
* Invalid inputs fail fast with explicit errors.
* New sections added without modifying existing code.

**Quality Metrics**:

* Zero nondeterministic output.
* High unit-test coverage on section logic.
* No runtime configuration magic.

---

### 11. Phase 11: DOCUMENT THE DECISION

**Problem**: Need a deterministic, testable text-report generator.
**Solution**: Explicit validation + pure section generators + deterministic composition.
**Trade-offs**: Less flexible than templating, vastly more predictable.
**When to revisit**: Only if multiple output formats are *proven* necessary.
**Test Coverage**: Validation, section logic, full report snapshots.
