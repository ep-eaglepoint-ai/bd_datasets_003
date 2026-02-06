# Journey: Building the Document Review & Approval System

To build this system, I followed a structured, professional software engineering lifecycle, ensuring that every business rule was encoded as a first-class citizen in the system architecture.

## 1. Deep Dive & Requirements Analysis
I started by deeply analyzing the problem statement. The previous email-based process was failing due to state ambiguity and lack of traceability. I identified the **three pillars** of the solution:
- **Strict State Machine**: Documents must move linearly through a defined lifecycle (Pending -> Approved/Rejected).
- **Immutable Audit Trail**: Every change must be logged and impossible to modify.
- **Concurrency Safety**: The system must prevent "double-approvals" when two managers act simultaneously.

## 2. System Design & Architecture
I chose a modern, lightweight, but powerful stack:
- **Backend**: **Python with FastAPI**. I selected FastAPI for its type safety (Pydantic) and performance.
- **Database**: **SQLite with SQLAlchemy**. Perfect for a minimal, single-file relational store that supports transactions.
- **Frontend**: **HTML5, Vanilla JavaScript, and CSS3**. I avoided heavy frameworks to keep the application "minimal and clear" as requested, ensuring zero build-step complexity on the frontend.
- **Security**: I implemented a header-based mock authentication (`X-User-ID`) to simulate roles without adding the overhead of OAuth/JWT for this specific exercise, while keeping the logic interchangeable.

## 3. Database & Model Design
I designed the schema to support the business rules natively:
- **`User`**: Tracks `username` and `role` (EMPLOYEE vs. MANAGER).
- **`Document`**: Includes a `version` integer column. This is the heart of my **Optimistic Concurrency Control** strategy.
- **`AuditLog`**: Designed as an append-only table to record the "who, when, what, and previous state" of every change.

## 4. Backend Implementation & API Development
I implemented the RESTful API with a focus on **Server-Side Validation**:
- **Requirements Fulfillment**: I wrote logic to ensure employees can only see their own docs, and managers are blocked from acting on their own submissions (`REQ 6`).
- **Testing**: Before moving to the frontend, I tested the endpoints using REST clients (like Postman) and documented the behavior for each status code (e.g., `409 Conflict` for race conditions).

## 5. Frontend UI/UX Development
I built a clean, card-based interface:
- **State Management**: The UI dynamically changes based on the logged-in user's role. Employees get a submission form; managers get approval controls.
- **Integration**: I wrote a robust `api()` wrapper in JavaScript to handle headers and error parsing consistently across the app.

## 6. Dockerization
To ensure the project is "runnable locally with no manual setup," I configured:
- **`Dockerfile`**: A multi-stage-style simple build using `python:3.11-slim` to keep the image small.
- **`docker-compose.yml`**: I mapped the volumes so that development state is persisted and ports are correctly exposed to `8000`.

## 7. Quality Assurance & Automated Testing
The most critical part of my journey was writing the tests. I used `pytest` along with `FastAPI's TestClient`.
- **How I wrote the tests**: I created a mock database for every test run to ensure a clean state.
- **Specific Tests**:
    - **Race Condition Test**: I used Python's `threading` library to fire two approval requests to the API at the exact same millisecond. This verified that my `version` column logic correctly blocked the second request with a `409 Conflict`.
    - **Role Test**: I simulated an employee attempting to approve a document and verified the `403 Forbidden` response.
- **Execution**: I ran these tests inside the Docker container using `docker compose run` to prove the environment is stable and production-ready.

## 8. Final Polish & Refactoring
Finally, I refactored the code to eliminate all deprecation warnings from SQLAlchemy 2.0 and Pydantic V2, ensuring the system is built on the latest, most stable standards. I cleaned up the workspace to leave only the necessary source code and configuration files.

**Conclusion**: By following this disciplined approach—starting with the data layer, securing the logic at the API level, and finally building a responsive UI—I created a system that is not just functional, but resilient to concurrent errors and human mistakes.
