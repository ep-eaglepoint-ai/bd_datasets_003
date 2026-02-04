# Trajectory: Django ORM Performance Fix – N+1 Queries and Pagination

---

## 1. Phase 1: AUDIT / REQUIREMENTS ANALYSIS
**Guiding Question:** "What exactly needs to be fixed, and what are the constraints?"

**Reasoning:**
The project goal is to eliminate N+1 query problems in Django views (Product List/Detail, Order List/Detail, Admin Dashboard) and implement efficient pagination without breaking existing API contracts. This must also include caching, aggregation optimizations, and database indexing.

### Key Requirements:
* **N+1 Query Fixes:** Use `select_related` and `prefetch_related` strategically.
* **Pagination:** Implement cursor-based pagination for large datasets (Order List).
* **Aggregations:** Compute counts and averages (reviews, orders) at the database level.
* **Caching:** Implement Redis caching with signal-based invalidation.
* **Indexing:** Add database indexes and trigram indexes for search optimization.
* **Data Integrity:** JSON response structures must remain unchanged.

### Constraints Analysis:
* **Forbidden:** Changing API response format, using third-party ORM layers beyond Django ORM.
* **Required:** Maintain backward compatibility with existing front-end/API clients; must use Django ORM and native PostgreSQL features.

---

## 2. Phase 2: QUESTION ASSUMPTIONS
**Guiding Question:** "Is the current ORM usage necessary? Can queries be optimized without breaking functionality?"

**Reasoning:**
Initial N+1 queries come from lazy-loading related fields (ForeignKey, ManyToMany, reverse relationships). Instead of restructuring the entire models, `select_related`, `prefetch_related`, and ORM aggregations provide surgical fixes.

### Scope Refinement:
* **Initial Assumption:** Might need full rewrite of views.
* **Refinement:** Use query optimization + caching to achieve performance gains without full rewrite.
* **Rationale:** Minimal invasive change reduces risk while fixing performance.

---

## 3. Phase 3: DEFINE SUCCESS CRITERIA
**Guiding Question:** "What does success look like?"

* Number of queries per request reduced to minimum expected.
* Cursor-based pagination returns correct subsets of orders.
* Aggregated review/order counts computed via ORM, not Python loops.
* Redis cache returns results correctly and invalidates on updates.
* Response JSON structure remains identical.
* Trigram search and database indexes improve query speed.

---

## 4. Phase 4: MAP REQUIREMENTS TO VALIDATION
**Guiding Question:** "How will correctness be verified?"

### Test Strategy:
* **Structural Tests:** Ensure `select_related` / `prefetch_related` applied correctly.
* **Unit Tests:**
    * Test query counts using Django `assertNumQueries`.
    * Verify cursor pagination logic.
    * Verify aggregation results (average ratings, order totals).
* **Integration Tests:**
    * Validate API responses remain consistent with previous structure.
    * Test caching behavior and signal-based invalidation.
* **Performance Tests:** Measure query time before and after optimization.

---

## 5. Phase 5: SCOPE THE SOLUTION
**Guiding Question:** "What is the minimal implementation that meets requirements?"

### Components to Create:
1.  **View Optimizations:** `ProductListView`, `ProductDetailView`, `OrderListView`, `OrderDetailView`, `AdminDashboardView`.
2.  **ORM Aggregations:** Annotate review counts, order totals, average ratings.
3.  **Pagination:** Cursor-based for orders.
4.  **Database Indexing:** Add indexes to frequently filtered/sorted fields.
5.  **Caching:** Redis with signal-based invalidation for relevant models.

---

## 6. Phase 6: TRACE DATA/CONTROL FLOW
**Guiding Question:** "How will data/control flow after optimization?"

**Flow Example (Product List):**
Request → ORM Query → Prefetch related fields → Aggregate review counts → Defer large JSON fields → Return JSON response → Cache result.



**Flow Example (Order List Pagination):**
Request → ORM Query → Apply cursor filter → Aggregate totals → Serialize → Return JSON → Cache.

---

## 7. Phase 7: ANTICIPATE OBJECTIONS
**Guiding Question:** "What could go wrong?"

| Objection | Counter-Argument |
| :--- | :--- |
| **Memory Usage:** "Will `prefetch_related` increase memory usage?" | Only related objects needed for response are prefetched. Large unnecessary fields are deferred. |
| **Complexity:** "Cursor pagination adds complexity." | Correct cursor implementation prevents slow `OFFSET` queries in large datasets. |
| **Stale Data:** "Caching can serve stale data." | Signal-based invalidation ensures cache consistency on create/update/delete. |

---

## 8. Phase 8: VERIFY INVARIANTS / DEFINE CONSTRAINTS
**Guiding Question:** "What constraints must the system satisfy?"

* **Must Satisfy:** JSON responses unchanged; minimal query counts per request; aggregations accurate; cache invalidation reliable.
* **Must Not Violate:** Backward compatibility; security or data integrity rules.

---

## 9. Phase 9: EXECUTE WITH SURGICAL PRECISION
**Guiding Question:** "What is the order of implementation?"

1.  Apply `select_related` / `prefetch_related` to all views.
2.  Add ORM aggregations for reviews and orders.
3.  Implement cursor-based pagination for orders.
4.  Add database indexes and trigram search.
5.  Implement caching with signal-based invalidation.
6.  Add deferred fields for large JSON columns.
7.  Write tests to validate queries, results, pagination, caching.

---

## 10. Phase 10: MEASURE IMPACT / VERIFY COMPLETION
**Guiding Question:** "How do we know we fixed performance issues?"

* Query count reduced to minimum.
* API response times improved (milliseconds).
* Tests verify correct output, pagination, and cache behavior.
* Aggregation results match expected totals.

---

## 11. Phase 11: DOCUMENT THE DECISION
* **Problem:** Django views are suffering from N+1 queries, slow aggregations, and inefficient pagination.
* **Solution:** Optimized ORM queries, added cursor-based pagination, caching, and database indexing.
* **Trade-offs:** Slightly more complex view logic; prefetching increases memory usage but reduces database hits.
* **When to revisit:** If dataset grows further, may need horizontal sharding or async query patterns; cache invalidation logic may need tuning with more models.
* **Test Coverage:** Verified via `pytest` for query counts, API responses, cursor pagination, caching, and aggregation.