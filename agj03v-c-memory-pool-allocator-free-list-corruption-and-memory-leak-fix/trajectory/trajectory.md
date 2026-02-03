# Trajectory: C Memory Pool Allocator — Free List Corruption and Memory Leak Fix

**Objective:** Stabilize a fixed-size, real-time memory pool allocator so it remains correct under long uptimes, concurrency, and strict 8‑byte alignment constraints (ARM), while preventing free-list corruption and space “shrink” over time.

---

### 1. First Pass: Understand the Legacy Implementation (repository_after)

I first started by understanding the legacy code that exists inside the folder `repository_after` and comparing it to the failure symptoms reported in production.

Key observations that immediately explained the crashes and leaks:

- **Allocated blocks were never removed from the free list.** The allocator only flipped `is_free = 0` but left the node linked. Under load, the same block could be returned again, producing duplicate ownership and eventual free-list corruption.
- **Splitting was unsafe for small requests.** Without enforcing a minimum allocation size, splitting could produce remainders too small to safely represent a free block, which later breaks coalescing and list operations.
- **Header/payload alignment was not guaranteed on 32-bit ARM.** A 12-byte header can misalign returned payload pointers, leading to bus errors.
- **Coalescing read past the end of the pool.** The “next block” pointer was computed and dereferenced without checking bounds when a block was at the end of the region.
- **Double-free and invalid frees were accepted.** That caused duplicates in the free list and quickly destabilized accounting.

These issues match the real-world symptoms: duplicated addresses returned to callers, free list nodes appearing multiple times, and “leaked” free space due to corrupted accounting and fragmentation.

---

### 2. Define a Correctness Contract (Requirements → Invariants)

Before changing code, I translated each requirement into an invariant that must hold at runtime:

- **Free list contains only free blocks** and is never allowed to contain an allocated block.
- **All payload pointers are 8-byte aligned.**
- **Every block header is valid and within pool bounds** before any dereference.
- **Split only when remainder is usable**: remainder must hold `header + MIN_ALLOC_SIZE`.
- **Coalescing is complete** (merges with both previous and next neighbors when adjacent).
- **Accounting reflects reality**, including reclaiming header space during coalescing.
- **pool_free is defensive**: rejects out-of-range pointers, interior pointers, and double frees.

---

### 3. Implement the Fixes (Data Model + Algorithms)

To make alignment and pointer validation robust across host builds while still targeting 32-bit ARM semantics, I used a **fixed-size 16-byte header** design and **pool-relative offsets** for the free list.

This ensured:

- Header size is stable.
- Payload is naturally aligned.
- The free list is safe from host pointer-size differences.

Then I applied the algorithmic fixes:

- **Allocation:** first-fit search; remove the allocated block from the free list (replace with split remainder if splitting).
- **Splitting:** only if remainder can hold `header + MIN_ALLOC_SIZE`.
- **Free:** validate pointer; detect double-free; insert into free list in address-sorted order.
- **Coalesce:** merge forward, merge with previous, then merge forward again.
- **Accounting:** increment `free_space` by reclaimed header size when blocks are merged.

---

### 4. Prove with Tests (Edge Cases + Concurrency)

I wrote a unit test harness that stresses the specific failure modes described:

- Minimum allocation rounding and 8-byte alignment.
- Split/no-split boundary where the remainder would be unusable.
- Coalescing correctness with both neighbors.
- Header reclaim accounting (`free_space` returns to initial value after free-all).
- Double-free detection and invalid pointer rejection.
- Concurrent allocations verifying **no two threads receive the same address**.
- Stress loops to ensure the pool returns to its initial state repeatedly.

The tests are intentionally structured so `repository_after` passes, while `repository_before` fails early on pointer/alignment/validation expectations.

---

### 5. Evaluation Reporting

Finally, I added a small C evaluator that runs the tests for both `before` and `after`, captures output, and writes a JSON report to `evaluation/report.json` for automated scoring.
