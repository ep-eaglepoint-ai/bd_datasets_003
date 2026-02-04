# Trajectory: Interactive Quiz Application

## 1. Requirements Audit & Architecture Analysis
I started by analyzing the request to build a responsive, interactive quiz application.
**Key Constraints:**
- **Stack:** Next.js (App Router), TypeScript, Tailwind CSS.
- **Data:** Local mock data (no external API).
- **Core Flow:** Start -> Questions (Immediate Feedback) -> Result -> Restart.
- **State Management:** Complex state handling (score, current index, answered state) without persistence.
- **Verification:** strict correctness and "polished" UI.

**Identified Challenges:**
- Providing immediate visual feedback (Red/Green) while preventing answer switching.
- Managing transitions between questions smoothy.
- Ensuring accessibility and responsiveness.

## 2. Design Contracts & Data Model
I defined a clear interface for the data to ensure type safety throughout the app.
```typescript
interface Question {
  id: number;
  questionText: string;
  options: string[];
  correctAnswerIndex: number; // 0-3
}
```
I also defined the high-level state machine for the application:
- `GameState`: 'start' | 'playing' | 'result'
- This eliminates invalid states (e.g., showing results while playing).

## 3. Component Architecture (Projection-First)
Instead of a monolithic page, I broke the UI into distinct phases:
- `StartScreen`: Pure presentation.
- `QuestionScreen`: Encapsulates logic for interaction, feedback timing, and preventing double-answers.
- `ResultScreen`: Displays calculated metrics and handles reset.
- `Page`: Orchestrator that holds the source of truth (Score, Index).

## 4. Execution & Implementation
- **Scaffolding:** Used `create-next-app` to get a production-ready setup.
- **Styling:** Leveraged Tailwind utility classes for rapid, consistent styling (gradients, spacing, responsive grids).
- **Logic:** Implemented a delay mechanism (`setTimeout`) in `QuestionScreen` to allow the user to see feedback before auto-advancing, enhancing the UX.
- **Testing:** Implemented comprehensive integration tests using `jest` and `@testing-library/react`. 
    - Focused on *behavior* (user clicks -> feedback appears) rather than implementation details.
    - Verified the full game loop from Start to Restart.

## 5. Verification & Evaluation
- **Automated Tests:** validatated that scoring logic works (1 correct = 1 point) and that incorrect answers hint the correct one.
- **Evaluation Script:** Built a Python runner to standardize test execution and reporting, ensuring reproducibility.
- **Containerization:** Dockerized the application to ensure the environment is consistent across runs.

**Result:** A robust, type-safe, and visually polished quiz application that meets all functional and non-functional requirements.
