## Trajectory: SwiftDrop Parcel Locker Access Portal (Next.js + Prisma + Jest)


### Action 1: Relational schema for lockers + parcels
**Issue**: The system needs a normalized schema supporting locker occupancy, parcel lifecycle, and time-based expiration.

- **Action Taken**:
  - Implemented Prisma models for `Locker` and `Parcel` with explicit status fields and `expiresAt`.
  - Added indexes for `status`, `expiresAt`, and FK (`lockerId`) to support fast verification/expiration scans.
- **Reference**:
  - [Prisma schema reference](https://www.prisma.io/docs/orm/reference/prisma-schema-reference)

### Action 2: Secure PIN lifecycle (no “leaky PIN”)
**Issue**: PINs must never be stored in plaintext and must not be retrievable via any resident “listing” flow.

- **Action Taken**:
  - Generated **6-digit numeric** PIN server-side during courier check-in.
  - Stored only a **one-way hash** (`pinHash`) in the database.
  - Returned the raw PIN **only once** in the courier check-in response; no endpoint exposes PINs afterward.
- **Reference**:
  - [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

### Action 3: State machine + expiration revalidation
**Issue**: Lockers must transition over time: \(AVAILABLE \rightarrow OCCUPIED \rightarrow (COLLECTED \lor EXPIRED)\), and occupied lockers must become expired after `expiresAt`.

- **Action Taken**:
  - Implemented state manager helpers to:
    - Detect expired parcels (`expiresAt < now` and status `OCCUPIED`)
    - Mark parcels `EXPIRED` and lockers `EXPIRED` in a consistent, repeatable way
  - Provided a revalidation trigger (API hook + lightweight client revalidator) so the UI can reflect expiration without exposing parcel listings.
- **Reference**:
  - [Prisma transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions)

### Action 4: Collision prevention on check-in
**Issue**: Couriers must not check into an `OCCUPIED` locker (or overwrite an active parcel).

- **Action Taken**:
  - The check-in API validates locker availability before creating a parcel.
  - Locker + parcel updates happen in a single atomic workflow so the system cannot end up in partial states.

### Action 5: Resident verification API constraints (no listing)
**Issue**: Residents must not be able to browse all parcels; retrieval must require **recipient email + PIN**.

- **Action Taken**:
  - Implemented resident verification API that requires both `recipient` and `pin`.
  - On success, updates parcel status to `COLLECTED` and releases the locker back to `AVAILABLE`.
  - Ensured no resident list endpoint exists (validated by tests).

### Action 6: UI consistency + error handling
**Issue**: The UX must be clear, consistent, and safe: loading states, errors, and readable inputs (black text).

- **Action Taken**:
  - Built:
    - Courier check-in form (email + locker id; shows PIN once)
    - Resident PIN pad (email + PIN; shows “Invalid PIN” / “PIN Expired” / success)
  - Standardized error states and loading indicators across both flows.
  - Enforced `text-black` for input text color for accessibility/readability.

### Action 7: Deterministic, isolated integration tests
**Issue**: Tests must reliably validate expiration + state transitions without flakiness or cross-test interference.

- **Action Taken**:
  - Moved all tests into root `tests/` and executed them via the root `package.json`.
  - Introduced an isolated SQLite test DB (`test.db`) created fresh per run via a setup script.
  - Forced serial execution (`--runInBand` / `maxWorkers: 1`) to prevent DB cleanup race conditions.
  - Added integration anchors required by the prompt:
    - **Expiration**: create parcel with `expiresAt` 5 seconds in the past → resident verification returns **“PIN Expired”**
    - **State transition**: after `COLLECTED`, the locker returns to **`AVAILABLE`**

### Action 8: Cleanup + consolidation
**Issue**: The repo must be minimal and maintainable (no duplicate test folders, dead code, or unused imports).

- **Action Taken**:
  - Removed redundant/duplicate test configs and dead files.
  - Cleaned unused imports/functions and kept logic DRY between API routes and helpers.

### Verification Action: End-to-end correctness validation
**Action Taken**:
- Ran the full Jest test suite from the root `package.json`.
- Verified **100% pass rate** (12/12 tests passing) for:
  - PIN hashing hygiene
  - Collision prevention
  - Expiration enforcement
  - Locker release on collection
  - No resident listing endpoint

