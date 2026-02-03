# Trajectory: Engineering a Modern Gratitude Journal

## The Problem: Requirement vs. Reality
The goal was to transform a set of 6 specific functional requirements into a production-ready, verified application. The challenge was ensuring that features like "Auto-save" and "Anniversary Logic" weren't just implemented, but were testable and robust.

## The Solution: A Verified Full-Stack Approach
I built the application using **React Router 7** and **Prisma**, focusing on a state-driven architecture. 
1. **Dynamic Journaling**: Built a 3-field input system that syncs with a SQLite database via a custom `upsert` action.
2. **Passwordless Access**: Implemented a token-based authentication flow (Magic Links) that eliminates the need for passwords while maintaining 30-day session persistence.
3. **Data Insights**: Created a centralized statistics engine that calculates streaks with a 1-day grace period and maps word frequencies back to their original entries.

## Implementation Steps
1. **Infrastructure**: Set up Prisma schemas for Users and Entries, including unique constraints for `userId` and `date`.
2. **Auto-Saving**: Used a `useEffect` hook with a **1000ms debounce** timer to trigger `fetcher.submit` calls. This ensures data is saved without overloading the server.
3. **Anniversary Engine**: Wrote server-side loaders specifically filtered to find entries from exactly one year ago (`Year - 1`).
4. **Visual Polish**: Applied a "Sky" themed design using Tailwind CSS, including pulsing glows for the progress bar and glassmorphism for the UI components.

## Why I did it this way (Refinement)
*   **Static to Dynamic**: I initially wrote a hardcoded test script. I refactored this into a **Dynamic Evaluator** that automatically detects and builds any `repository_*` folder in Docker.
*   **Prisma Scaling**: Instead of separate clients, I unified the Prisma generation in the Dockerfile so that any version of the app can be verified instantly.

## Testing & Verification
The integrity of the "Ground Truths" was verified using two layers:
1. **Unit Verification**: A custom script (`tests/journal.test.ts`) that programmatically checks file contents and logic patterns.
2. **Docker Orchestration**: A multi-service `docker-compose.yml` that allows running the App, the Tester, and the Evaluator in isolated environments.

---

### 📚 Recommended Resource

**1. Read: React Router v7 Documentation**
The definitive guide for the framework used to build this application, specifically the sections on Loaders and Actions which power the journaling and authentication logic.
* [React Router - Main Documentation](https://reactrouter.com/home)

