# Trajectory – Recipe Finder Application

## Problem Framing
I set out to build a small but well-structured Recipe Finder that answers a concrete user problem: *“Given the ingredients I already have, what can I cook right now?”*  
The focus was not just on functionality, but on making clear engineering trade-offs, keeping the system simple, and validating correctness through tests.

---

## Goals & Constraints
Before writing code, I defined explicit constraints to guide decisions:

- **User goal**: Select ingredients and immediately see matching recipes.
- **Technical goal**: Demonstrate clean React state management, typed data modeling, and deterministic filtering logic.
- **Constraints**:
  - No backend or external APIs.
  - Deterministic, testable behavior.
  - Responsive UI with minimal styling overhead.

Given these constraints, a frontend-only Next.js solution was the most appropriate.

---

## Design Reasoning

### Architecture Decisions
I intentionally chose a **frontend-only architecture**:
- All data is static and lives in TypeScript files.
- No API calls, no async state, no network variability.
- Filtering logic runs entirely in the browser.

This keeps the mental model small and makes correctness easier to reason about and test.

I used **Next.js App Router** to align with modern React patterns and keep the project future-proof.

---

### Data Modeling
I started by modeling the domain explicitly:

- Defined a `Recipe` interface to formalize what a recipe means in this system.
- Used a literal union type for difficulty (`'Easy' | 'Medium' | 'Hard'`) to prevent invalid states at compile time.
- Introduced a `FilterMode` type to make filtering behavior explicit rather than implicit.

This ensured that UI, filtering logic, and tests all shared the same contract.

---

### Component Decomposition
Instead of building one large component, I broke the UI into focused, single-responsibility components:

- **IngredientSelector**  
  Handles selection state via toggleable “pill” buttons.

- **RecipeCard**  
  Responsible only for rendering a recipe and its visual indicators (image, title, difficulty).

- **RecipeGrid**  
  Owns layout concerns and empty-state rendering.

- **FilterModeToggle**  
  Explicitly controls how matching logic behaves (`any` vs `all`).

This separation made state flow predictable and testing straightforward.

---

## Implementation Process

### Step 1: Project Initialization
- Bootstrapped a Next.js project with the App Router.
- Enabled strict TypeScript to catch errors early.
- Configured Tailwind CSS for utility-first, responsive styling.
- Added Jest as the test runner from the start to enforce correctness.

---

### Step 2: Data & Filtering Logic
- Implemented static recipe data with 12 diverse recipes.
- Created a curated list of 15 common ingredients.
- Wrote a pure `filterRecipes` function that:
  - Accepts selected ingredients and filter mode.
  - Supports both **“any ingredient matches”** and **“all ingredients match”** semantics.
  - Is deterministic and side-effect free, making it easy to test.

---

### Step 3: UI Construction
- Built the ingredient selector with clear visual feedback for selected vs unselected states.
- Implemented difficulty badges with semantic color mapping:
  - Green → Easy
  - Yellow → Medium
  - Red → Hard
- Designed the recipe grid to adapt from 1 to 4 columns depending on screen size.

---

### Step 4: State Integration
- Used `useState` to manage:
  - Selected ingredients
  - Active filter mode
- Wired state changes directly into the filtering function to achieve real-time updates.
- Added explicit empty states:
  - No ingredients selected
  - No recipes matched

This made UI behavior predictable and user feedback immediate.

---

### Step 5: Testing Strategy
I treated testing as a first-class engineering concern:

- Wrote a comprehensive test suite covering:
  - File structure and exports
  - Data integrity
  - Filtering correctness
  - Component behavior and edge cases
- Included accessibility-oriented assertions where applicable.
- Ended up with **80+ individual test cases**, ensuring confidence in both logic and structure.

---

### Step 6: Evaluation & Reporting
To make results auditable:
- Built a custom evaluation runner.
- Generated unique run IDs and timestamps.
- Produced structured JSON reports for every execution.
- Stored reports in a timestamped directory hierarchy for traceability.

---

## Validation Flow

### Running Tests
```bash
docker compose run --rm app npx jest --testPathPattern=tests/
