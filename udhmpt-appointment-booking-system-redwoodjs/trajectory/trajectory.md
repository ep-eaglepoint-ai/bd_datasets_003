# Trajectory: Appointment Booking System (RedwoodJS)

---

### 1. Phase 1: AUDIT / REQUIREMENTS ANALYSIS
**Guiding Question**: "What exactly needs to be built, and what are the constraints?"

**Reasoning**:  
Before writing any code, we must map **all functional requirements** of an appointment booking system to concrete RedwoodJS implementation units. This ensures we **cannot skip or misinterpret any requirement**, and allows us to structure the system into testable, incremental chunks. The system must handle **providers, customers, booking slots, recurring and one-off availability, time zones, capacity, booking policies, and calendar views**, all fully testable.

**Key Requirements**:  
- Provider onboarding: profile, services, appointment durations  
- Recurring availability rules (weekly, custom patterns, multiple windows/day)  
- One-off overrides: extra availability and exceptions  
- Manual blocking: vacations, meetings  
- Buffer time between appointments  
- Customers browse availability by service, duration, provider, date range  
- Real-time slot listing  
- Book appointment with confirmation and reference  
- Reschedule/cancel with policy rules (cutoff, cancellation window, penalties)  
- Provider schedule calendar with day/week/month views  
- Booking details panel with status, customer info, notes  
- Time zone support, DST-safe slot generation  
- Prevent double booking (transactions/optimistic locking)  
- Booking cutoffs and max bookings per slot/day  
- Capacity support (1:1 or group sessions)  

**Deliverable**:  
- Requirements mapping table (requirement → Prisma model / GraphQL type / service / UI component)  
- Clear separation of concerns: `/repository_after` for implementation, `/tests` for validation

---

### 2. Phase 2: FOUNDATION & INFRASTRUCTURE
**Guiding Question**: "What base structure is needed for safe, incremental development?"

**Reasoning**:  
All subsequent phases rely on a **robust project foundation**. RedwoodJS conventions, Prisma schema, authentication, and time utilities must be in place before business logic. This avoids **drift, undefined dependencies, and repeated refactoring**.

**Key Requirements**:  
- RedwoodJS project initialization  
- Prisma schema with **User model** and roles (`PROVIDER`, `CUSTOMER`, `ADMIN`)  
- Authentication and authorization scaffolding  
- UTC-normalized time utilities + TZ conversion + DST-safe arithmetic  
- Folder scaffolding:  
  - `/repository_after/services`  
  - `/repository_after/cells`  
  - `/repository_after/components`  
  - `/tests`  

**Tests**:  
- Prisma schema migration passes  
- Auth roles enforced on GraphQL mutations  
- Time utilities handle DST and TZ correctly  

---

### 3. Phase 3: PROVIDER ONBOARDING
**Guiding Question**: "How do providers register, define services, and specify durations?"

**Reasoning**:  
Provider onboarding is the **first functional unit**, forming the backbone for availability and booking. This must be fully implemented and tested before moving to availability.

**Key Requirements**:  
- Provider profile creation (name, contact, bio)  
- Services offered per provider  
- Each service includes: name, duration (minutes), optional capacity (default = 1)  
- Role-based authorization: only PROVIDER can create services  

**Tests**:  
- Provider cannot create service without profile  
- Duration validation (positive integers, realistic bounds)  
- Capacity defaults to 1  
- Customer/Admin forbidden from creating services  

---

### 4. Phase 4: RECURRING AVAILABILITY RULES
**Guiding Question**: "How to let providers define weekly patterns, custom days, and multiple time windows?"

**Reasoning**:  
Recurring availability is critical for slot generation. Must **store UTC-normalized intervals**, support multiple windows/day, and allow custom day overrides.

**Key Requirements**:  
- Weekly patterns (Mon–Sun)  
- Multiple windows/day  
- Custom day overrides  

**Tests**:  
- Recurring rules persist correctly  
- Multiple windows/day applied correctly  
- Custom day rules override weekly defaults  
- DST-safe calculations  

---

### 5. Phase 5: ONE-OFF OVERRIDES & MANUAL BLOCKING
**Guiding Question**: "How do providers add exceptions or manually block time?"

**Reasoning**:  
Overrides and blocks **supersede recurring rules**. Manual blocking ensures real-life unavailability is honored.

**Key Requirements**:  
- One-off availability addition/removal  
- Manual block with metadata (reason)  
- Conflict resolution: block > override > recurring  

**Tests**:  
- Overrides apply correctly  
- Blocks hide availability  
- Overlapping overrides resolve deterministically  

---

### 6. Phase 6: SLOT GENERATION ENGINE
**Guiding Question**: "How to compute bookable slots considering availability, overrides, buffers, and time zones?"

**Reasoning**:  
Slot generation is **pure computation**, no persistence yet. Must respect provider TZ, DST, and buffer times.

**Key Requirements**:  
- Generate slots from availability rules and overrides  
- Apply buffer time before/after appointments  
- Output slots in customer TZ  
- Deterministic and DST-safe  

**Tests**:  
- Buffers remove adjacent slots  
- DST days generate correct slots  
- Cross-TZ conversions correct  
- No overlapping slots  

---

### 7. Phase 7: BOOKING ENGINE
**Guiding Question**: "How to create bookings reliably and prevent conflicts?"

**Reasoning**:  
Booking creation must be **atomic**, respect capacity, prevent double bookings, enforce cutoffs, and generate a booking reference.

**Key Requirements**:  
- Transactional booking  
- Double booking prevention (optimistic locking)  
- Capacity enforcement  
- Booking cutoff rules  
- Unique booking reference  

**Tests**:  
- Parallel bookings trigger transaction conflicts correctly  
- Capacity >1 allows multiple bookings  
- Cutoff rules enforced  
- Reference uniqueness  

---

### 8. Phase 8: RESCHEDULE & CANCELLATION POLICIES
**Guiding Question**: "How can customers safely reschedule or cancel while respecting policies?"

**Reasoning**:  
Rescheduling/cancellation must **respect cutoffs, penalty flags, and policy windows**.

**Key Requirements**:  
- Reschedule allowed within policy window  
- Cancel allowed within policy window  
- Flags for penalties  

**Tests**:  
- Cancel inside window succeeds  
- Cancel outside window fails  
- Reschedule respects same rules  

---

### 9. Phase 9: PROVIDER CALENDAR & BOOKING MANAGEMENT
**Guiding Question**: "How can providers view schedules and booking details?"

**Reasoning**:  
The provider-facing UI must **support day/week/month views** and show booking metadata.

**Key Requirements**:  
- Calendar UI  
- Booking details panel (status, customer info, notes)  
- Multiple views (day/week/month)  

**Tests**:  
- Calendar data fetch correct  
- Status updates reflected  
- Notes persist  

---

### 10. Phase 10: CUSTOMER DISCOVERY FLOW
**Guiding Question**: "How can customers browse availability and book efficiently?"

**Reasoning**:  
Customer-side discovery is essential for adoption. Must filter by **service, duration, provider, date range**, and reflect **real-time bookable slots**.

**Key Requirements**:  
- Filter by service, duration, provider, date range  
- Real-time availability listing  
- Slot selection feeds booking engine  

**Tests**:  
- Filters return correct slots  
- Real-time booking updates  
- Slots respect capacity and buffer  
