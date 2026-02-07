# Trajectory: RedwoodJS Appointment Booking System Engineering (Updated for 15 Core Features)

### 1. Phase 1: Problem Definition
**Guiding Question**: "How do we build a robust RedwoodJS scheduling system with SQLite?"

**Reasoning**:
The objective is to build a robust RedwoodJS scheduling system with SQLite and end-to-end booking flows (providers + customers). The emphasis is on correctness across availability, policies, timezones/DST, and concurrency.

**Key Requirements (Ground Truth)**:
- **RedwoodJS Structure**: Separate `api` and `web` sides with GraphQL + Cells.
- **Provider Onboarding**: Profile, services, durations, capacity, buffers, policies.
- **Availability Engine**: Weekly rules → Custom days → Exceptions/blocks.
- **Booking Policies**: Lead-time cutoff, cancellation/reschedule windows, penalties flag.
- **Timezone/DST Safety**: Provider TZ for rules + customer TZ for display.
- **Concurrency Safety**: Optimistic locking + transactional capacity slots.

### 2. Phase 2: Questioning Assumptions
**Issue**: Should a provider be fully blocked by a single booking?
**Decision**: No. Use a capacity-per-service model. This enables group sessions and limited concurrency while still preventing overbooking.

### 3. Phase 3: Success Criteria (Refined)
1. **Behavioral Integrity**: Booking creation, cancellation, reschedule policies, capacity rules.
2. **Timezone/DST Integrity**: Availability generation and display are TZ-aware.
3. **Concurrency Safety**: No double-booking under capacity constraints.

### 4. Phase 4: Strategy & Mapping
**Validation Strategy**:
- **Policies + Capacity**: `tests/booking_policies_capacity.test.ts`.
- **Booking Flow**: `tests/booking_creation.test.ts`, `tests/booking_cancel_reschedule.test.ts`.
- **Availability/DST**: `tests/slot_generation.test.ts`, `tests/timezone/dst_edge_cases.test.ts`.
- **Concurrency**: `tests/concurrency.test.ts`, `tests/integration/concurrency_control.test.ts`.

### 5. Phase 5: Implementation Highlights
- **Auth Model**: RBAC wrapper around `@redwoodjs/graphql-server`’s `context` for ownership enforcement.
- **Availability Logic**: DST-safe slot generation in `availability.ts` (local provider TZ → UTC) and customer TZ rendering.
- **Provider Onboarding**: Profile, services (duration, buffers, capacity), recurring rules, custom days, exceptions.
- **Booking Management**: Reschedule/cancel policies and booking details panels in provider + customer flows.
- **Calendar**: Day/week/month views with provider TZ display.

### 6. Phase 6: Anticipated Objections & Resolutions
- **Objection**: "SQLite isn’t safe for scheduling."
- **Resolution**: Use transactional writes + optimistic locking and a `capacitySlot` unique constraint to prevent double booking.

### 7. Phase 7: Final Completion Summary
**Requirements Fulfillment**:
- **Onboarding**: ✅ Profile, service creation, buffers, capacity, policies, and availability rules.
- **Availability**: ✅ Recurring + custom + exceptions, DST-aware generation.
- **Booking**: ✅ Lead-time cutoff, max-per-day enforcement, reschedule/cancel windows and penalties.
- **Calendar**: ✅ Day/week/month views and booking details panel.
- **Concurrency**: ✅ Capacity slot logic + optimistic locking to prevent double booking.

**Notes**:
- Test scope is focused on functional behavior; execution status depends on the test runner invoked.
