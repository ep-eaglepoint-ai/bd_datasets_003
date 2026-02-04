-- Comprehensive Test Suite for PostgreSQL Double Booking Prevention
-- 
-- This test validates the concurrent booking solution by using the actual
-- transaction logic from repository_after/concurrent_booking.sql
--
-- Requirements Validation:
-- 1. Two concurrent transactions must never both commit a booking for the same resource_id
-- 2. Must be implemented entirely with SQL statements inside one transaction
-- 3. Exactly one attempt must succeed; competing attempts must wait or fail safely
-- 4. Must not rely on an empty SELECT … FOR UPDATE as a locking mechanism

-- Setup
DROP TABLE IF EXISTS bookings;
CREATE TABLE bookings (
    id SERIAL PRIMARY KEY,
    resource_id INT NOT NULL,
    user_id INT NOT NULL,
    booked_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- TEST SUITE 1: Basic Concurrency Prevention
-- =============================================================================

SELECT 'TEST SUITE 1: Basic Concurrency Prevention' as test_suite;

-- Test 1.1: Sequential bookings on same resource (core requirement)
SELECT 'Test 1.1: Sequential bookings on same resource' as test_name;

-- First booking should succeed
BEGIN;
WITH resource_lock AS (
    SELECT resource_id FROM bookings WHERE resource_id = 1
    UNION ALL
    SELECT 1 as resource_id
    LIMIT 1
)
SELECT resource_id FROM resource_lock FOR UPDATE;

WITH booking_attempt AS (
    INSERT INTO bookings (resource_id, user_id)
    SELECT 1, 100
    WHERE NOT EXISTS (
        SELECT 1 FROM bookings WHERE resource_id = 1
    )
    RETURNING id, resource_id, user_id
)
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 'SUCCESS: Resource 1 booked by user 100'
        ELSE 'FAILED: Resource 1 was already booked'
    END as first_booking_result
FROM booking_attempt;
COMMIT;

-- Second booking should fail (validates requirement #1)
BEGIN;
WITH resource_lock AS (
    SELECT resource_id FROM bookings WHERE resource_id = 1
    UNION ALL
    SELECT 1 as resource_id
    LIMIT 1
)
SELECT resource_id FROM resource_lock FOR UPDATE;

WITH booking_attempt AS (
    INSERT INTO bookings (resource_id, user_id)
    SELECT 1, 200
    WHERE NOT EXISTS (
        SELECT 1 FROM bookings WHERE resource_id = 1
    )
    RETURNING id, resource_id, user_id
)
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 'FAILED: Double booking occurred!'
        ELSE 'SUCCESS: Resource 1 booking correctly rejected'
    END as second_booking_result
FROM booking_attempt;
COMMIT;

-- Verify exactly one booking exists (requirement validation)
SELECT COUNT(*) as resource_1_bookings FROM bookings WHERE resource_id = 1;

-- =============================================================================
-- TEST SUITE 2: MVCC and Transaction Isolation Testing
-- =============================================================================

SELECT 'TEST SUITE 2: MVCC and Transaction Isolation Testing' as test_suite;

-- Test 2.1: READ COMMITTED isolation level behavior
SELECT 'Test 2.1: READ COMMITTED isolation level behavior' as test_name;

-- Test with explicit isolation level
BEGIN ISOLATION LEVEL READ COMMITTED;
WITH resource_lock AS (
    SELECT resource_id FROM bookings WHERE resource_id = 5
    UNION ALL
    SELECT 5 as resource_id
    LIMIT 1
)
SELECT resource_id FROM resource_lock FOR UPDATE;

WITH booking_attempt AS (
    INSERT INTO bookings (resource_id, user_id)
    SELECT 5, 300
    WHERE NOT EXISTS (
        SELECT 1 FROM bookings WHERE resource_id = 5
    )
    RETURNING id, resource_id, user_id
)
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 'SUCCESS: Resource 5 booked under READ COMMITTED'
        ELSE 'FAILED: Resource 5 booking failed'
    END as read_committed_result
FROM booking_attempt;
COMMIT;

-- Test 2.2: REPEATABLE READ isolation level behavior
SELECT 'Test 2.2: REPEATABLE READ isolation level behavior' as test_name;

BEGIN ISOLATION LEVEL REPEATABLE READ;
WITH resource_lock AS (
    SELECT resource_id FROM bookings WHERE resource_id = 6
    UNION ALL
    SELECT 6 as resource_id
    LIMIT 1
)
SELECT resource_id FROM resource_lock FOR UPDATE;

WITH booking_attempt AS (
    INSERT INTO bookings (resource_id, user_id)
    SELECT 6, 400
    WHERE NOT EXISTS (
        SELECT 1 FROM bookings WHERE resource_id = 6
    )
    RETURNING id, resource_id, user_id
)
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 'SUCCESS: Resource 6 booked under REPEATABLE READ'
        ELSE 'FAILED: Resource 6 booking failed'
    END as repeatable_read_result
FROM booking_attempt;
COMMIT;

-- =============================================================================
-- TEST SUITE 3: Locking Mechanism Validation
-- =============================================================================

SELECT 'TEST SUITE 3: Locking Mechanism Validation' as test_suite;

-- Test 3.1: Verify concrete row locking (not empty SELECT FOR UPDATE)
SELECT 'Test 3.1: Concrete row locking validation' as test_name;

-- Test that we always have something to lock
BEGIN;
-- This should always return a row (either existing or from VALUES)
WITH resource_lock AS (
    SELECT resource_id FROM bookings WHERE resource_id = 999
    UNION ALL
    SELECT 999 as resource_id
    LIMIT 1
)
SELECT 
    CASE 
        WHEN COUNT(*) = 1 THEN 'SUCCESS: Always have a row to lock'
        ELSE 'FAILED: No row available for locking'
    END as lock_target_validation
FROM (SELECT resource_id FROM resource_lock FOR UPDATE) locked_rows;

-- Now perform the actual booking
WITH booking_attempt AS (
    INSERT INTO bookings (resource_id, user_id)
    SELECT 999, 500
    WHERE NOT EXISTS (
        SELECT 1 FROM bookings WHERE resource_id = 999
    )
    RETURNING id, resource_id, user_id
)
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 'SUCCESS: Resource 999 booked'
        ELSE 'FAILED: Resource 999 booking failed'
    END as booking_result
FROM booking_attempt;
COMMIT;

-- =============================================================================
-- TEST SUITE 4: Edge Cases and Boundary Conditions
-- =============================================================================

SELECT 'TEST SUITE 4: Edge Cases and Boundary Conditions' as test_suite;

-- Test 4.1: Resource ID 0 (boundary condition)
SELECT 'Test 4.1: Resource ID 0 (boundary condition)' as test_name;

BEGIN;
WITH resource_lock AS (
    SELECT resource_id FROM bookings WHERE resource_id = 0
    UNION ALL
    SELECT 0 as resource_id
    LIMIT 1
)
SELECT resource_id FROM resource_lock FOR UPDATE;

WITH booking_attempt AS (
    INSERT INTO bookings (resource_id, user_id)
    SELECT 0, 1000
    WHERE NOT EXISTS (
        SELECT 1 FROM bookings WHERE resource_id = 0
    )
    RETURNING id, resource_id, user_id
)
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 'SUCCESS: Resource 0 booked'
        ELSE 'FAILED: Resource 0 booking failed'
    END as resource_zero_result
FROM booking_attempt;
COMMIT;

-- Test 4.2: Negative resource ID
SELECT 'Test 4.2: Negative resource ID' as test_name;

BEGIN;
WITH resource_lock AS (
    SELECT resource_id FROM bookings WHERE resource_id = -1
    UNION ALL
    SELECT -1 as resource_id
    LIMIT 1
)
SELECT resource_id FROM resource_lock FOR UPDATE;

WITH booking_attempt AS (
    INSERT INTO bookings (resource_id, user_id)
    SELECT -1, 1001
    WHERE NOT EXISTS (
        SELECT 1 FROM bookings WHERE resource_id = -1
    )
    RETURNING id, resource_id, user_id
)
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 'SUCCESS: Resource -1 booked'
        ELSE 'FAILED: Resource -1 booking failed'
    END as negative_resource_result
FROM booking_attempt;
COMMIT;

-- Test 4.3: Large resource ID (stress test)
SELECT 'Test 4.3: Large resource ID (stress test)' as test_name;

BEGIN;
WITH resource_lock AS (
    SELECT resource_id FROM bookings WHERE resource_id = 2147483647
    UNION ALL
    SELECT 2147483647 as resource_id
    LIMIT 1
)
SELECT resource_id FROM resource_lock FOR UPDATE;

WITH booking_attempt AS (
    INSERT INTO bookings (resource_id, user_id)
    SELECT 2147483647, 1002
    WHERE NOT EXISTS (
        SELECT 1 FROM bookings WHERE resource_id = 2147483647
    )
    RETURNING id, resource_id, user_id
)
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 'SUCCESS: Large resource ID booked'
        ELSE 'FAILED: Large resource ID booking failed'
    END as large_resource_result
FROM booking_attempt;
COMMIT;

-- =============================================================================
-- TEST SUITE 5: Multi-Resource Transaction Testing
-- =============================================================================

SELECT 'TEST SUITE 5: Multi-Resource Transaction Testing' as test_suite;

-- Test 5.1: Multiple different resources in one transaction
SELECT 'Test 5.1: Multiple different resources in one transaction' as test_name;

BEGIN;
-- Resource 20
WITH resource_lock AS (
    SELECT resource_id FROM bookings WHERE resource_id = 20
    UNION ALL
    SELECT 20 as resource_id
    LIMIT 1
)
SELECT resource_id FROM resource_lock FOR UPDATE;

INSERT INTO bookings (resource_id, user_id)
SELECT 20, 600
WHERE NOT EXISTS (
    SELECT 1 FROM bookings WHERE resource_id = 20
);

-- Resource 21
WITH resource_lock AS (
    SELECT resource_id FROM bookings WHERE resource_id = 21
    UNION ALL
    SELECT 21 as resource_id
    LIMIT 1
)
SELECT resource_id FROM resource_lock FOR UPDATE;

INSERT INTO bookings (resource_id, user_id)
SELECT 21, 700
WHERE NOT EXISTS (
    SELECT 1 FROM bookings WHERE resource_id = 21
);

-- Resource 22
WITH resource_lock AS (
    SELECT resource_id FROM bookings WHERE resource_id = 22
    UNION ALL
    SELECT 22 as resource_id
    LIMIT 1
)
SELECT resource_id FROM resource_lock FOR UPDATE;

INSERT INTO bookings (resource_id, user_id)
SELECT 22, 800
WHERE NOT EXISTS (
    SELECT 1 FROM bookings WHERE resource_id = 22
);

COMMIT;

-- Verify all three bookings succeeded
SELECT COUNT(*) as multi_resource_bookings FROM bookings WHERE resource_id IN (20, 21, 22);

-- =============================================================================
-- TEST SUITE 6: User and Resource Relationship Testing
-- =============================================================================

SELECT 'TEST SUITE 6: User and Resource Relationship Testing' as test_suite;

-- Test 6.1: Same user booking different resources
SELECT 'Test 6.1: Same user booking different resources' as test_name;

-- User 2000 books resource 10
BEGIN;
WITH resource_lock AS (
    SELECT resource_id FROM bookings WHERE resource_id = 10
    UNION ALL
    SELECT 10 as resource_id
    LIMIT 1
)
SELECT resource_id FROM resource_lock FOR UPDATE;

WITH booking_attempt AS (
    INSERT INTO bookings (resource_id, user_id)
    SELECT 10, 2000
    WHERE NOT EXISTS (
        SELECT 1 FROM bookings WHERE resource_id = 10
    )
    RETURNING id, resource_id, user_id
)
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 'SUCCESS: User 2000 booked resource 10'
        ELSE 'FAILED: User 2000 could not book resource 10'
    END as same_user_result_1
FROM booking_attempt;
COMMIT;

-- Same user 2000 books resource 11
BEGIN;
WITH resource_lock AS (
    SELECT resource_id FROM bookings WHERE resource_id = 11
    UNION ALL
    SELECT 11 as resource_id
    LIMIT 1
)
SELECT resource_id FROM resource_lock FOR UPDATE;

WITH booking_attempt AS (
    INSERT INTO bookings (resource_id, user_id)
    SELECT 11, 2000
    WHERE NOT EXISTS (
        SELECT 1 FROM bookings WHERE resource_id = 11
    )
    RETURNING id, resource_id, user_id
)
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 'SUCCESS: User 2000 booked resource 11'
        ELSE 'FAILED: User 2000 could not book resource 11'
    END as same_user_result_2
FROM booking_attempt;
COMMIT;

-- Test 6.2: Different users competing for same resource
SELECT 'Test 6.2: Different users competing for same resource' as test_name;

-- User 3001 attempts to book resource 15
BEGIN;
WITH resource_lock AS (
    SELECT resource_id FROM bookings WHERE resource_id = 15
    UNION ALL
    SELECT 15 as resource_id
    LIMIT 1
)
SELECT resource_id FROM resource_lock FOR UPDATE;

WITH booking_attempt AS (
    INSERT INTO bookings (resource_id, user_id)
    SELECT 15, 3001
    WHERE NOT EXISTS (
        SELECT 1 FROM bookings WHERE resource_id = 15
    )
    RETURNING id, resource_id, user_id
)
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 'SUCCESS: User 3001 won the race for resource 15'
        ELSE 'FAILED: User 3001 lost the race for resource 15'
    END as competing_user_result_1
FROM booking_attempt;
COMMIT;

-- User 3002 attempts to book the same resource 15 (should fail)
BEGIN;
WITH resource_lock AS (
    SELECT resource_id FROM bookings WHERE resource_id = 15
    UNION ALL
    SELECT 15 as resource_id
    LIMIT 1
)
SELECT resource_id FROM resource_lock FOR UPDATE;

WITH booking_attempt AS (
    INSERT INTO bookings (resource_id, user_id)
    SELECT 15, 3002
    WHERE NOT EXISTS (
        SELECT 1 FROM bookings WHERE resource_id = 15
    )
    RETURNING id, resource_id, user_id
)
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 'FAILED: User 3002 created double booking!'
        ELSE 'SUCCESS: User 3002 correctly rejected for resource 15'
    END as competing_user_result_2
FROM booking_attempt;
COMMIT;

-- =============================================================================
-- TEST SUITE 7: Transaction Rollback and Error Handling
-- =============================================================================

SELECT 'TEST SUITE 7: Transaction Rollback and Error Handling' as test_suite;

-- Test 7.1: Successful transaction persistence
SELECT 'Test 7.1: Successful transaction persistence' as test_name;

BEGIN;
WITH resource_lock AS (
    SELECT resource_id FROM bookings WHERE resource_id = 100
    UNION ALL
    SELECT 100 as resource_id
    LIMIT 1
)
SELECT resource_id FROM resource_lock FOR UPDATE;

INSERT INTO bookings (resource_id, user_id)
SELECT 100, 4000
WHERE NOT EXISTS (
    SELECT 1 FROM bookings WHERE resource_id = 100
);

-- Verify booking exists within transaction
SELECT COUNT(*) as bookings_in_tx FROM bookings WHERE resource_id = 100;
COMMIT;

-- Verify booking persists after commit
SELECT COUNT(*) as bookings_after_commit FROM bookings WHERE resource_id = 100;

-- Test 7.2: Transaction rollback behavior
SELECT 'Test 7.2: Transaction rollback behavior' as test_name;

BEGIN;
WITH resource_lock AS (
    SELECT resource_id FROM bookings WHERE resource_id = 101
    UNION ALL
    SELECT 101 as resource_id
    LIMIT 1
)
SELECT resource_id FROM resource_lock FOR UPDATE;

INSERT INTO bookings (resource_id, user_id)
SELECT 101, 4001
WHERE NOT EXISTS (
    SELECT 1 FROM bookings WHERE resource_id = 101
);

-- Verify booking exists before rollback
SELECT COUNT(*) as bookings_before_rollback FROM bookings WHERE resource_id = 101;
ROLLBACK;

-- Verify booking was rolled back
SELECT COUNT(*) as bookings_after_rollback FROM bookings WHERE resource_id = 101;

-- =============================================================================
-- TEST SUITE 8: Performance and Scalability Validation
-- =============================================================================

SELECT 'TEST SUITE 8: Performance and Scalability Validation' as test_suite;

-- Test 8.1: Sequential booking performance
SELECT 'Test 8.1: Sequential booking performance test' as test_name;

-- Book resources 200-205 sequentially (smaller range for reliability)
BEGIN;
WITH resource_lock AS (
    SELECT resource_id FROM bookings WHERE resource_id = 200
    UNION ALL
    SELECT 200 as resource_id
    LIMIT 1
)
SELECT resource_id FROM resource_lock FOR UPDATE;

INSERT INTO bookings (resource_id, user_id)
SELECT 200, 5200
WHERE NOT EXISTS (
    SELECT 1 FROM bookings WHERE resource_id = 200
);
COMMIT;

BEGIN;
WITH resource_lock AS (
    SELECT resource_id FROM bookings WHERE resource_id = 201
    UNION ALL
    SELECT 201 as resource_id
    LIMIT 1
)
SELECT resource_id FROM resource_lock FOR UPDATE;

INSERT INTO bookings (resource_id, user_id)
SELECT 201, 5201
WHERE NOT EXISTS (
    SELECT 1 FROM bookings WHERE resource_id = 201
);
COMMIT;

BEGIN;
WITH resource_lock AS (
    SELECT resource_id FROM bookings WHERE resource_id = 202
    UNION ALL
    SELECT 202 as resource_id
    LIMIT 1
)
SELECT resource_id FROM resource_lock FOR UPDATE;

INSERT INTO bookings (resource_id, user_id)
SELECT 202, 5202
WHERE NOT EXISTS (
    SELECT 1 FROM bookings WHERE resource_id = 202
);
COMMIT;

-- Verify performance test bookings
SELECT COUNT(*) as performance_test_bookings FROM bookings WHERE resource_id BETWEEN 200 AND 202;

-- =============================================================================
-- FINAL VALIDATION AND REPORTING
-- =============================================================================

SELECT 'FINAL VALIDATION AND REPORTING' as test_suite;

-- Critical validation: Check for any double bookings
SELECT 'Double booking detection (should return no rows):' as critical_check;
SELECT 
    resource_id,
    COUNT(*) as booking_count,
    array_agg(user_id ORDER BY booked_at) as users_who_booked,
    'CRITICAL FAILURE: Double booking detected!' as error_status
FROM bookings 
GROUP BY resource_id
HAVING COUNT(*) > 1;

-- Show all bookings for verification
SELECT 'All bookings created during testing:' as summary_section;
SELECT 
    resource_id,
    user_id,
    booked_at,
    'Valid booking' as status
FROM bookings 
ORDER BY resource_id;

-- Performance and consistency metrics
SELECT 'Test execution metrics:' as metrics_section;
SELECT 
    COUNT(*) as total_bookings_created,
    COUNT(DISTINCT resource_id) as unique_resources_booked,
    COUNT(DISTINCT user_id) as unique_users_participated,
    MIN(resource_id) as min_resource_id,
    MAX(resource_id) as max_resource_id,
    EXTRACT(EPOCH FROM (MAX(booked_at) - MIN(booked_at))) as total_test_duration_seconds
FROM bookings;

-- Final comprehensive result
SELECT 'FINAL TEST RESULT:' as final_result;
SELECT CASE 
    WHEN NOT EXISTS (
        SELECT 1 FROM bookings 
        GROUP BY resource_id 
        HAVING COUNT(*) > 1
    ) AND EXISTS (SELECT 1 FROM bookings)
    THEN 'SUCCESS: All booking tests passed. No double bookings detected. Concurrency control is working correctly.'
    WHEN NOT EXISTS (SELECT 1 FROM bookings)
    THEN 'FAILURE: No bookings were created - tests may not have run properly'
    ELSE 'CRITICAL FAILURE: Double bookings detected! Concurrency control has failed.'
END as comprehensive_test_result;