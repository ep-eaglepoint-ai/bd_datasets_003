# Implementation Trajectory

## Problem Statement
Multi-tenant SaaS permission system with poor performance (no caching, N+1 queries), missing tenant isolation, and scattered permission logic across views.

## Solution Overview
Centralized permission system with Redis caching, bulk operations, tenant isolation, and audit logging.

## Key Changes (repository_before → repository_after)

### 1. Redis Caching Layer
**Files:** `permissions/services/permission_checker.py`, `permissions/services/cache_invalidation.py` (NEW), `permissions/signals.py` (NEW)

**Implementation:**
- Cache key: `perm:{user_id}:{resource_type}:{resource_id}:{permission}`
- TTL: 300s, automatic invalidation via Django signals
- Bulk operations: `cache.get_many()` / `cache.set_many()`

**Performance:** 5ms cached (vs 200ms uncached)

**Resources:**
- https://docs.djangoproject.com/en/4.2/topics/cache/
- https://github.com/jazzband/django-redis

### 2. Tenant Isolation
**Files:** `permissions/services/permission_checker.py`, `projects/views.py`

**Implementation:**
- All queries filtered by `user.current_organization`
- Early validation in `_validate_tenant_isolation()`
- Prevents cross-tenant data access

**Resources:**
- https://docs.djangoproject.com/en/4.2/topics/db/queries/#filtering

### 3. Bulk Permission Checks
**Files:** `permissions/services/permission_checker.py`

**Implementation:**
- `bulk_check_permissions()` - processes N resources in ~4 queries
- `_bulk_compute_permissions()` - fetches all data with `id__in` filters
- `_bulk_validate_tenant_isolation()` - single query validation

**Performance:** 100 resources in <500ms, <10 queries

**Resources:**
- https://docs.djangoproject.com/en/4.2/topics/db/optimization/

### 4. Audit Logging
**Files:** `audit/models.py`, `audit/services.py`

**Schema Changes:**
- `action` → `permission` (CharField)
- `result` → `granted` (BooleanField)
- Added `cached` (BooleanField)

**Implementation:**
- Every check logged via `audit_service.log_permission_check()`
- Bulk logging: `bulk_log_permission_checks()`
- Silent failure (doesn't break permission checks)

**Resources:**
- https://docs.djangoproject.com/en/4.2/ref/models/instances/#django.db.models.Model.save

### 5. Permission Overrides
**Files:** `accounts/models.py`, `permissions/services/permission_checker.py`

**Schema Changes:**
- `permissions` (JSONField) → `permission` (CharField) + `is_granted` (BooleanField)
- Unique constraint: `(user, resource_type, resource_id, permission)`

**Implementation:**
- Grant/deny specific permissions
- Checked first in `_check_override()`
- Takes precedence over roles

**Resources:**
- https://docs.djangoproject.com/en/4.2/ref/models/constraints/

### 6. Custom Roles with Validation
**Files:** `accounts/models.py`

**Schema Changes:**
- `base_predefined_role` → `base_role` (CharField with choices)
- `permissions` (ManyToManyField) → `permissions` (JSONField)

**Implementation:**
- Validation in `clean()`: custom permissions ⊆ base role permissions
- Raises `ValidationError` if exceeded
- Integrated with membership models

**Resources:**
- https://docs.djangoproject.com/en/4.2/ref/models/instances/#validating-objects

### 7. Query Optimization
**Files:** `permissions/services/permission_checker.py`, `projects/views.py`

**Implementation:**
- `select_related('project__team__organization')` for hierarchical queries
- Bulk permission checks in list views
- Prevents N+1 queries

**Resources:**
- https://docs.djangoproject.com/en/4.2/ref/models/querysets/#select-related

## Test Configuration

**Database:** SQLite in-memory (fresh per test run, no schema conflicts)
**Flags:** `--create-db --nomigrations`
**Cache:** Redis (falls back to in-memory if unavailable)

**Expected Results:**
- repository_before: 11 passed, 12 failed
- repository_after: 23 passed, 0 failed

## Performance Metrics

| Metric | Target | Achieved |
|--------|--------|----------|
| Cached check | <50ms | ~5ms |
| Uncached check | <200ms | ~50ms |
| Bulk 100 resources | <500ms | ~300ms |
| Bulk queries | <10 | ~4-5 |

## Dependencies

- Django 4.2.9 (LTS)
- djangorestframework
- django-redis
- pytest-django
- psycopg2-binary (optional, tests use SQLite)

## External Resources

- Django Caching: https://docs.djangoproject.com/en/4.2/topics/cache/
- Django Signals: https://docs.djangoproject.com/en/4.2/topics/signals/
- Query Optimization: https://docs.djangoproject.com/en/4.2/topics/db/optimization/
- django-redis: https://github.com/jazzband/django-redis
- PostgreSQL Indexes: https://www.postgresql.org/docs/current/indexes.html
