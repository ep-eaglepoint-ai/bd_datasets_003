# Idempotent Exam Grading Engine

## Overview

This system is a **thread-safe grading engine** that safely handles duplicate submissions caused by network issues or repeated clicks.

It guarantees that:

- Each section is graded **only once**
- Scores are never double-counted
- The system is safe under high concurrency

---

## Problems

### Double Grading

Grading normally follows this logic:


If a student submits the same section multiple times at the same time:

- The section may be graded more than once
- The total score becomes incorrect

---

### Go Map Crashes

Go maps are **not safe for concurrent access**.

Concurrent writes to these maps can crash the program:

- `Sessions`
- `GradedSections`

---

## Solution

The system uses:

- Tiered locking  
- Idempotent grading (exactly-once processing)

---

## Tiered Locking

### Global Lock (Sessions)

- A `sync.RWMutex` protects the `Sessions` map  
- Safe session lookup and creation  

### Per-Session Lock

- Each session has its own `sync.Mutex`  
- Different users can be graded at the same time  
- One user cannot block the whole system  

---

## Idempotent Grading

Each session keeps a `GradedSections` ledger.

- First submission → Grade and save result  
- Duplicate submission → Return saved result  
- Section is **never graded twice**

Response status:

- `GRADED`  
- `IDEMPOTENT_SUCCESS`  

---

## Request Flow

1. Client sends submission  
2. Server reads session (global lock)  
3. Server locks session (critical section)  
4. Server checks ledger  
   - New → grade and save  
   - Duplicate → return cached result  
5. Server unlocks session  
6. Client receives result  

---

## Testing

Run with:

```bash
go test -race ./...
