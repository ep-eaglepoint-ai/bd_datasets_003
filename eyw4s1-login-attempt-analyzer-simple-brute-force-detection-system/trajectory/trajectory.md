# Trajectory: Login Attempt Analyzer – Simple Brute-Force Detection System

---

## 1. Phase 1: AUDIT / REQUIREMENTS ANALYSIS  
**Guiding Question**: *“What exactly needs to be built, and what are the constraints?”*

### Reasoning
The goal is to build an **educational but complete** system that demonstrates how brute-force login attacks can be detected and surfaced. The emphasis is on **clarity, correctness, and traceability**, not production-grade complexity.

The system must:
- Collect login attempt data
- Apply a simple detection rule
- Expose data via APIs
- Visualize the data clearly in a frontend
- Prove correctness through **100% requirement-level test coverage**

### Extracted Requirements (from prompt + requirement list)
- **Backend (Django)**:
  - Store login attempts
  - Fields: username, IP address, timestamp, success/failure
  - Detect suspicious behavior based on repeated failed attempts from same IP within a time window
  - Mark activity as suspicious
  - Expose REST APIs for attempts and flagged alerts

- **Frontend (Vue 3)**:
  - Display login attempts in a table
  - Highlight suspicious IPs/attempts
  - Display summary statistics:
    - total attempts
    - failed attempts
    - flagged IPs

### Constraints Analysis
- **Scope constraint**: Educational, simple, no unnecessary complexity
- **Tech constraint**:
  - Backend: Django (Python)
  - Frontend: Vue 3 (TypeScript)
- **Testing constraint**:
  - Every requirement must be **covered by at least one test**
  - No requirement may exist without validation
- **Structure constraint**:
  - `/repository_after`: implementation only
  - `/tests`: tests only
  - Root: shared config (package.json, Dockerfile, etc.)

---

## 2. Phase 2: QUESTION ASSUMPTIONS (Challenge the Premise)  
**Guiding Question**: *“Are we over-engineering or under-engineering?”*

### Reasoning
A brute-force detection system *could* involve:
- rate limiting
- ML models
- distributed counters
- Redis / streaming pipelines

But **none of that is required** by the prompt.

### Scope Refinement
- **Rejected**:
  - Advanced anomaly detection
  - External auth providers
  - Real-time streaming dashboards
- **Accepted**:
  - Deterministic rule:
    > *N failed attempts from the same IP within T minutes → suspicious*

### Rationale
This keeps:
- Logic easy to reason about
- Tests deterministic
- Behavior explainable to learners

---

## 3. Phase 3: DEFINE SUCCESS CRITERIA  
**Guiding Question**: *“What does ‘done’ mean in measurable terms?”*

### Success Criteria
1. Login attempts are persisted with all required fields
2. Failed attempts from the same IP trigger a suspicious flag when threshold is exceeded
3. Suspicious state is queryable via API
4. Frontend correctly renders:
   - attempts table
   - suspicious highlights
   - summary statistics
5. **Every requirement is enforced by tests**
6. Breaking any requirement causes at least one test to fail

---

## 4. Phase 4: MAP REQUIREMENTS TO VALIDATION (Test Strategy)  
**Guiding Question**: *“How do we prove each requirement is satisfied?”*

### Test Strategy Overview

#### Backend Tests (Django)
- **Model Tests**
  - Verify persistence of username, IP, timestamp, success flag
- **Detection Logic Tests**
  - Repeated failed attempts from same IP → suspicious
  - Below threshold → not suspicious
- **API Tests**
  - Fetch login attempts
  - Fetch flagged/suspicious activity

#### Frontend Tests (Vue 3)
- **Rendering Tests**
  - Table renders rows from API data
- **Highlighting Tests**
  - Suspicious attempts/IPs are visually distinct
- **Statistics Tests**
  - Total attempts
  - Failed attempts
  - Flagged IP count

> No snapshot-only tests. All assertions are behavioral.

---

## 5. Phase 5: SCOPE THE SOLUTION (Minimal Complete System)  
**Guiding Question**: *“What is the smallest implementation that satisfies all requirements?”*

### Backend Components
- **Model**
  - `LoginAttempt`
- **Detection Service**
  - Threshold + time window logic
- **API Views**
  - `/api/login-attempts`
  - `/api/suspicious-activity`

### Frontend Components
- **Dashboard View**
- **Login Attempts Table**
- **Summary Stats Panel**

### File Placement Rules
- `/repository_after/backend`: Django app
- `/repository_after/frontend`: Vue 3 app
- `/tests/backend`: Django tests
- `/tests/frontend`: Vue tests

---

## 6. Phase 6: TRACE DATA & CONTROL FLOW  
**Guiding Question**: *“How does data move through the system?”*

### Login Attempt Flow
Authentication Event  
→ Django records attempt  
→ Detection rule evaluated  
→ Attempt possibly flagged  
→ Stored in database  

### Dashboard Flow
Vue App Load  
→ Fetch login attempts API  
→ Fetch flagged activity API  
→ Render table  
→ Highlight suspicious entries  
→ Compute and display stats  

---

## 7. Phase 7: ANTICIPATE OBJECTIONS  
**Guiding Question**: *“What criticisms might arise?”*

### Objection 1: “Why not real-time detection?”
- **Counter**: Not required. Batch analysis is sufficient and simpler.

### Objection 2: “Why not rate-limit instead?”
- **Counter**: Detection and visualization ≠ prevention. This system is observational.

### Objection 3: “This isn’t production-secure.”
- **Counter**: Correct — it’s intentionally instructional.

---

## 8. Phase 8: VERIFY INVARIANTS / CONSTRAINTS  

### Must Always Hold
- Every login attempt has all required fields
- Suspicious logic is deterministic
- Frontend reflects backend truth
- Tests map 1-to-1 with requirements

### Must Never Happen
- Untested requirement
- UI logic inventing data not provided by API
- Detection logic hidden or implicit

---

## 9. Phase 9: EXECUTE WITH SURGICAL PRECISION  
**Guiding Question**: *“In what order should work be done to minimize risk?”*

1. **Data Model** (low risk)
2. **Detection Rule** (medium risk)
3. **API Endpoints** (medium risk)
4. **Backend Tests** (locks correctness)
5. **Frontend Rendering** (low risk)
6. **Frontend Tests** (verifies contract)
7. **End-to-end sanity check**

---

## 10. Phase 10: MEASURE IMPACT / VERIFY COMPLETION  
**Guiding Question**: *“Did we meet the requirements — and can we prove it?”*

### Requirement Coverage
- **REQ-01**: Backend using Django → ✅ tested
- **REQ-02**: Login attempt fields → ✅ tested
- **REQ-03**: Brute-force detection rule → ✅ tested
- **REQ-04**: REST APIs → ✅ tested
- **REQ-05**: Vue 3 table → ✅ tested
- **REQ-06**: Suspicious highlighting → ✅ tested
- **REQ-07**: Statistics display → ✅ tested

### Quality Metrics
- **Requirement Coverage**: 100%
- **Test Failure Signal**: Any regression breaks tests
- **No Requirement Left Implicit**

---

## 11. Phase 11: DOCUMENT THE DECISION  

**Problem**  
Brute-force attacks often go unnoticed without visibility into failed login patterns.

**Solution**  
A Django + Vue 3 application that records login attempts, applies a simple detection rule, exposes APIs, and visualizes suspicious behavior with full test coverage.

**Trade-offs**
- Simplicity over sophistication
- Deterministic rules over heuristics
- Educational clarity over scalability

**When to Revisit**
- If prevention (rate-limiting) is required
- If detection must scale horizontally
- If alerts need real-time delivery

**Test Coverage**
All stated requirements are explicitly validated through backend and frontend tests. No requirement relies on assumption or manual verification.
