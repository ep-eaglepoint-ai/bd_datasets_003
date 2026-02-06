# Trajectory

## Analysis
The request was to build a Leave Request Management System with strict requirements on concurrency, audit trails, and role-based access.

Key constraints:
- **Concurrency**: Multiple managers approving the same request must not race.
- **Data Integrity**: Balances must not go negative. Audit logs must be immutable.
- **Tech Stack**: Python (Flask), PostgreSQL (preferred over SQLite), proper containerization.

## Strategy
1.  **Database Design**:
    - `User`: Stores role and balance.
    - `LeaveRequest`: Stores the state (`PENDING`, `APPROVED`, etc.).
    - `AuditLog`: Append-only log of changes.
    - Use `SQLAlchemy` for ORM.
    - Use `PostgreSQL` for robust locking (`FOR UPDATE`).

2.  **Concurrency Control**:
    - The critical section is the Approval process.
    - We must check the balance and the request status AT THE SAME TIME as we update them.
    - `db.session.query(LeaveRequest).with_for_update()` locks the request row. We also lock the `User` row to update balance safely.
    - While `SERIALIZABLE` isolation is an option, explicit row locking (`FOR UPDATE`) is often more predictable for this specific "check-then-act" pattern.

3.  **Frontend**:
    - Kept it simple: Vanilla JS + HTML.
    - Single Page Application (SPA) approach using `fetch` to talk to JSON APIs.

4.  **Testing**:
    - Unit tests for business logic.
    - Concurrency tests using threads to spam the approval endpoint/service to verify locking works (only one thread succeeds).

## Execution
- **Step 1**: Setup Docker and `requirements.txt`.
- **Step 2**: Implemented Models.
- **Step 3**: Implemented `LeaveService` with transactional logic.
- **Step 4**: Implemented Flask routes.
- **Step 5**: Built the frontend.
- **Step 6**: Wrote verification tests.
- **Verification**: Verified tests run successfully in Docker environment including concurrency checks.

## Lessons Learned
- Using `sqlite` for local dev is fine, but for concurrency verification, `postgres` is superior.
- Separating `app` logic from `services` logic makes testing easier.

## Resources
- [SQLAlchemy Locking](https://docs.sqlalchemy.org/en/20/orm/queryguide/locking.html)
- [Flask Documentation](https://flask.palletsprojects.com/)
- [PostgreSQL Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
