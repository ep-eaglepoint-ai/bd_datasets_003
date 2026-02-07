# Trajectory: RedwoodJS Appointment Booking System

### 1. Phase 1: Title
**Guiding Question**: "What exactly needs to be built, and what are the constraints?"

**Reasoning**:
The primary goal is to deliver a production‑ready scheduling platform in RedwoodJS where providers define availability (recurring + overrides + blocks + buffers) and customers discover and book slots in real time. The system must enforce policy windows, prevent double bookings, and handle time zones/DST end‑to‑end, while keeping web/API boundaries clean.

**Key Requirements**:
- **Provider Onboarding**: Create provider profiles, services, durations, capacity, and buffers.
- **Availability Rules**: Weekly patterns, custom days, exceptions, and manual blocks.
- **Customer Search**: Filter availability by service, duration, provider, and date range.
- **Bookable Slots**: Real‑time listing must show only slots that will be accepted by booking.
- **Booking Lifecycle**: Book, confirm with reference, reschedule, and cancel under policy windows.
- **Calendar Views**: Provider day/week/month schedule UI.
- **Details Panel**: Booking details with status, customer info, and notes.
- **Time Zones/DST**: Provider TZ + customer TZ handling with DST‑safe slot generation.
- **Concurrency Safety**: Prevent double bookings (transaction logic + DB guard).
- **Cutoffs/Capacity**: Lead‑time cutoffs, max bookings/day, capacity > 1 option.
- **RBAC**: Providers/customers/admin have distinct access rules.

**Constraints Analysis**:
- **Platform**: RedwoodJS (web/api) + Prisma + GraphQL + Cells.
- **Database**: SQLite (requires extra concurrency protection).
- **Correctness**: Server validation must align with slot generation.

### 2. Phase 2: QUESTION ASSUMPTIONS (Challenge the Premise)
**Guiding Question**: "Where could this drift from requirements?"

**Reasoning**:
The highest risk is inconsistency between availability search and booking validation. The second risk is concurrency under SQLite.

**Scope Refinement**:
- **Initial Assumption**: Service‑level capacity checks are sufficient.
- **Refinement**: Provider‑level overlap must be blocked across services.
- **Rationale**: A provider cannot be booked for two services at once, even if services differ.

### 3. Phase 3: DEFINE SUCCESS CRITERIA (Establish Measurable Goals)
**Guiding Question**: "What does 'done' mean in measurable terms?"

**Success Criteria**:
1. **Slots Are Bookable**: A slot shown by `searchAvailability` is always accepted by booking.
2. **Policy Enforcement**: Lead time, cancellation, and reschedule windows enforced server‑side.
3. **Concurrency Safety**: Parallel requests cannot double‑book.
4. **TZ/DST Safety**: Provider rules expand correctly; customer display is correct.
5. **End‑to‑End Flow**: Onboard → publish availability → book → confirm → reschedule/cancel.

### 4. Phase 4: MAP REQUIREMENTS TO VALIDATION (Define Test Strategy)
**Guiding Question**: "How will we prove correctness?"

**Test Strategy**:
- **Onboarding + Services (Integration)**:
  - `tests/provider_onboarding.test.ts`
- **Availability Rules + Overrides**:
  - `tests/availability_recurring.test.ts`
  - `tests/availability_overrides.test.ts`
- **Search + Bookable Slots (Integration + Boundaries)**:
  - `tests/search_availability.test.ts`
  - `tests/realtime_slot_listing.test.tsx`
- **Booking Policies + Capacity**:
  - `tests/booking_creation.test.ts`
  - `tests/booking_cancel_reschedule.test.ts`
  - `tests/booking_policies_capacity.test.ts`
- **Calendar + Details UI**:
  - `tests/calendar_ui.test.tsx`
  - `tests/booking_details_panel.test.tsx`
- **Timezones + DST**:
  - `tests/slot_generation.test.ts`
  - `tests/timezone/dst_edge_cases.test.ts`
  - `tests/timezone/cross_timezone_scenarios.test.ts`
  - `tests/timezone/invalid_timezone_handling.test.ts`
- **Concurrency + DB Guard**:
  - `tests/concurrency.test.ts`
- **End‑to‑End Workflow + RBAC Auth Header**:
  - `tests/integration/end_to_end_workflows.test.ts`
  - `tests/integration/auth_header_rbac.test.ts`

### 5. Phase 5: SCOPE THE SOLUTION
**Guiding Question**: "What is the minimal implementation that satisfies the requirements?"

**Components Implemented**:
- **Availability Engine**:
  - Weekly rules, custom days, exceptions, manual blocks.
  - DST‑safe expansion and merge logic.
  - Custom days add extra availability on top of recurring windows.
  - Slot generation with buffers and lead‑time filtering.
- **Booking Logic**:
  - Lead time, max bookings/day, buffer‑aware overlap checks.
  - Capacity allocation with optimistic locking and DB overlap trigger.
- **Policies**:
  - Cancellation/reschedule windows with penalties.
  - UI and API aligned on boundary conditions.
- **Timezone Validation**:
  - Strict provider TZ validation, customer fallback.
- **UI**:
  - Onboarding, booking flow with confirmation, provider calendar, booking details panel.
- **RBAC**:
  - RequireAuth + ownership checks for availability resources.

### 6. Phase 6: TRACE DATA/CONTROL FLOW (Follow the Path)
**Guiding Question**: "How does data move through the system?"

**Availability Search Flow**:
Recurring rules → custom day overrides → subtract exceptions/blocks → generate slots → filter by lead time, buffers, max‑per‑day, and overlaps.

**Booking Flow**:
Slot selection → server slot validation (cadence + availability + policy) → transaction create booking → publish availability update.

**Reschedule/Cancel Flow**:
Validate ownership → enforce policy windows → validate new slot → update booking (optimistic lock) → publish update.

### 7. Phase 7: ANTICIPATE OBJECTIONS (Play Devil's Advocate)
**Guiding Question**: "What could go wrong?"

**Objection 1**: "Search shows slots that cannot be booked."
- **Counter**: Slot validation enforces cadence and buffers; search enforces the same lead‑time boundary and buffer overlap rules, and custom days only add availability.

**Objection 2**: "SQLite concurrency is unsafe."
- **Counter**: Optimistic locking plus a DB‑level overlap trigger prevents race‑condition double bookings.

**Objection 3**: "Provider timezones cause drift."
- **Counter**: Provider TZ is validated, and custom days/weekly rules are expanded in provider TZ with DST‑safe logic.

### 8. Phase 8: VERIFY INVARIANTS / DEFINE CONSTRAINTS
**Guiding Question**: "What must always be true?"

**Must Satisfy**:
- Slots shown are bookable.
- Policy cutoffs enforced server‑side.
- No cross‑service provider overlap.
- Custom days may extend availability beyond weekly rules.

**Must Not Violate**:
- No booking outside availability windows or inside blocks.
- No access to other providers’ overrides/exceptions.

### 9. Phase 9: EXECUTE WITH SURGICAL PRECISION (Ordered Implementation)
**Guiding Question**: "What order minimizes risk?"

1. Availability engine + DST‑safe slot generation.
2. Booking validation + buffer‑aware overlaps.
3. Concurrency safeguards (optimistic locking + DB trigger).
4. Provider onboarding + calendar + booking details UI.
5. Realtime slot listing and booking confirmation.
6. Tighten RBAC and align search/book boundaries.

### 10. Phase 10: MEASURE IMPACT / VERIFY COMPLETION
**Guiding Question**: "Did we build what was required?"

**Requirements Completion**:
- **REQ‑01**: ✅ Onboarding (profile + services + duration/buffers/capacity).
- **REQ‑02/03/04**: ✅ Recurring rules, custom days, exceptions, manual blocks.
- **REQ‑05/14**: ✅ Buffers + lead time + max bookings/day.
- **REQ‑06/07**: ✅ Search + real‑time bookable slots.
- **REQ‑08**: ✅ Booking confirmation + reference.
- **REQ‑09**: ✅ Reschedule/cancel cutoffs and penalties.
- **REQ‑10/11**: ✅ Provider calendar + booking details panel.
- **REQ‑12**: ✅ End‑to‑end TZ + DST safety.
- **REQ‑13**: ✅ Optimistic locking + DB overlap guard.
- **REQ‑15**: ✅ Capacity (group sessions).

**Quality Metrics**:
- **Test Coverage**: Requirement‑aligned suite + integration tests for onboarding/search.
- **Success**: Latest evaluation is green per `evaluation/2026-02-07/15-46-23/report.json`.

### 11. Phase 11: DOCUMENT THE DECISION (Capture Context for Future)
**Problem**: Build a role‑based booking system with real‑time availability, policy enforcement, TZ safety, and concurrency protection.
**Solution**: Implemented DST‑safe availability logic, server‑side slot validation, optimistic locking + DB trigger, onboarding UI, calendar UI, and requirement‑aligned tests.
**Trade‑offs**: Additional server checks and DB triggers increase complexity but prevent race‑condition bookings and slot drift.
**When to revisit**: If moving beyond SQLite or adding multi‑provider group sessions.
**Test Coverage**: Jest suite covers unit + integration flows tied to each requirement.
