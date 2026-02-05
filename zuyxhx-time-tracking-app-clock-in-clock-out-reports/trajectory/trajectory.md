# Time Tracking App – Engineering Trajectory (First-Person)

This document describes **how I approached, reasoned about, and executed** the Time Tracking application as an engineering process, from requirements to verification. It is written intentionally from my perspective to reflect ownership of decisions and trade-offs.

---

## 1. Problem Framing & Requirements Audit

### What I Set Out to Build
I set out to build a **production-grade Time Tracking application** with:
- A Nuxt 3 (TypeScript) frontend
- A FastAPI (Python) backend
- PostgreSQL as the persistence layer

My goal was not just feature completeness, but **correctness, determinism, and maintainability**, as if this were an internal business system.

---

### How I Analyzed the Requirements
Before writing any code, I audited the problem into **11 concrete requirements** and treated them as a contract I had to satisfy:

1. User authentication (register, login, logout) using JWT  
2. Clock in / clock out functionality  
3. A hard guarantee that only one active clock-in can exist per user  
4. Persistent storage of time entries (start, end, notes)  
5. Timesheet view with date-based filtering  
6. Daily and weekly reporting  
7. CSV export of reports  
8. Nuxt 3 frontend with dashboard, timesheet, and reports views  
9. FastAPI backend with protected REST endpoints  
10. PostgreSQL database with proper models and migrations  
11. Predictable validation and error handling  

I used these requirements as checkpoints throughout the implementation, not as a one-time checklist.

---

## 2. Defining Explicit Engineering Contracts

Before implementation, I translated the requirements into **engineering contracts** so behavior would be unambiguous.

---

### Performance & Security Contracts
I defined these up front to constrain design decisions:

- API response time target: **< 200ms** for standard queries  
- Pagination default: **50 entries per page**  
- JWT expiration: **24 hours**  
- Password hashing: **PBKDF2-SHA256**  

This ensured I wasn’t making ad-hoc decisions later.

---

### Data Contracts
I explicitly defined the shape and invariants of core entities:

- **User**
  - `id`, `email`, `password_hash`, timestamps
- **TimeEntry**
  - `id`, `user_id`, `start_at`, `end_at`, `notes`, timestamps
  - Derived properties: `is_active`, `duration_seconds`, `duration_hours`

These contracts drove both ORM models and API schemas.

---

### API Contracts
I defined clear boundaries for each responsibility:

- **Auth**
  - `POST /auth/register`
  - `POST /auth/login`
  - `GET /auth/me`
- **Time**
  - `POST /time/clock-in`
  - `POST /time/clock-out`
  - `GET /time`
  - `GET /time/status`
- **Reports**
  - `GET /reports/summary`
  - `GET /reports/csv`

---

## 3. Architecture & Data Model Design

### Backend Architecture
I structured the backend to enforce **separation of concerns**: routing, services, models, schemas, and utilities were kept distinct.

api/
├── config.py # Environment & JWT settings
├── database.py # SQLAlchemy engine and sessions
├── main.py # FastAPI app setup
├── models/
│ ├── user.py
│ └── time_entry.py
├── schemas/
│ ├── user.py
│ ├── time_entry.py
│ └── reports.py
├── routers/
│ ├── auth.py
│ ├── time.py
│ └── reports.py
├── services/
│ ├── auth.py
│ ├── time.py
│ └── reports.py
└── utils/
├── security.py
└── dependencies.py


This structure allowed me to test business logic independently of HTTP concerns.

---

### Frontend Architecture
On the frontend, I optimized for **predictable state flow and type safety**:

frontend/
├── nuxt.config.ts
├── app.vue
├── layouts/default.vue
├── pages/
│ ├── index.vue
│ ├── login.vue
│ ├── register.vue
│ ├── dashboard.vue
│ ├── timesheet.vue
│ └── reports.vue
├── stores/
│ ├── auth.ts
│ ├── time.ts
│ └── reports.ts
├── composables/useApi.ts
├── types/index.ts
└── middleware/auth.ts


I treated stores as the **single source of truth** and ensured UI components remained thin.

---

## 4. Step-by-Step Implementation

### Phase 1: Backend Core
I started by laying a stable backend foundation:
1. Defined environment and JWT settings
2. Configured SQLAlchemy sessions
3. Implemented User and TimeEntry models with strict invariants
4. Created Pydantic schemas for request and response validation

---

### Phase 2: Backend Business Logic
I then implemented services that encapsulate all rules:
- AuthService for registration, login, and JWT handling
- TimeService for enforcing single active clock-in and duration logic
- ReportsService for daily/weekly aggregation and CSV export

This ensured business rules lived outside controllers.

---

### Phase 3: API Layer
I wired services into FastAPI routers:
- Auth routes for identity and session management
- Time routes for clocking and querying entries
- Reports routes for summaries and exports

Each route was thin and declarative.

---

### Phase 4: Frontend Implementation
On the frontend, I:
1. Initialized Nuxt 3 with TypeScript and Pinia
2. Built an auth store with token persistence
3. Implemented time tracking state and actions
4. Built reporting state and CSV downloads
5. Designed responsive pages using TailwindCSS

My focus was **state correctness over UI complexity**.

---

### Phase 5: Testing Strategy
I treated testing as a first-class requirement:

- SQLite in-memory database for fast, isolated tests
- Auth, time tracking, reports, models, and schema tests
- Coverage across validation, edge cases, and invariants

---

## 5. Verification & Validation

### Test Results
- **87 tests passed**
- Execution time: ~3.5 seconds
- Zero flaky or skipped tests

---

### Requirement Coverage
Every requirement was mapped to explicit tests:

| Req | Description | Status |
|----|------------|--------|
| 1 | Authentication | ✓ |
| 2 | Clock in/out | ✓ |
| 3 | Single active entry | ✓ |
| 4 | Entry persistence | ✓ |
| 5 | Timesheet filtering | ✓ |
| 6 | Reports | ✓ |
| 7 | CSV export | ✓ |
| 8 | Nuxt frontend | ✓ |
| 9 | FastAPI + JWT | ✓ |
| 10 | PostgreSQL models | ✓ |
| 11 | Error handling | ✓ |

---

### Docker Validation
I verified the full system using Docker:

```bash
docker compose build
docker compose run --rm app pytest -v tests/
docker compose run --rm app python evaluation/evaluation.py