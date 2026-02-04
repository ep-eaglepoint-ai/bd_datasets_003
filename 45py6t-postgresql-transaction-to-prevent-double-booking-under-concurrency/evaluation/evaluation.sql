-- SQL-Only Evaluation Runner

\set QUIET 1
\pset tuples_only on
\pset format unaligned

-- Ensure we see notices (where logs are printed)
SET client_min_messages TO NOTICE;

-- 1. Setup metadata tracking
-- Use a temporary table to store start/end times and run UUID
SET client_min_messages TO WARNING; -- Suppress DROP TABLE notices
DROP TABLE IF EXISTS evaluation_metadata;
DROP TABLE IF EXISTS report_output;
SET client_min_messages TO NOTICE;

CREATE TEMP TABLE evaluation_metadata (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT
);

CREATE TEMP TABLE report_output (
    json_content TEXT
);

-- Generate Run ID and Start Time (using UTC ISO 8601 format with microseconds)
INSERT INTO evaluation_metadata VALUES 
    ('run_id', md5(random()::text || clock_timestamp()::text)::uuid::text),
    ('started_at', clock_timestamp()::text);

\echo '============================================================'
\echo 'RUNNING TESTS FROM tests/test_concurrent_booking.sql'
\echo '============================================================'

-- 2. Execute the included test file
-- Assumes this script is run from the project root directory
-- This file will create the 'bookings' table and populate it
\i tests/test_concurrent_booking.sql

-- 3. Capture completion time
INSERT INTO evaluation_metadata VALUES 
    ('finished_at', clock_timestamp()::text);

-- 4. Generate JSON Report
DO $$
DECLARE
    v_run_id TEXT;
    v_started_at TEXT;
    v_finished_at TEXT;
    v_duration NUMERIC;
    
    v_passed BOOLEAN;
    v_output TEXT;
    v_improvement_summary TEXT;
    
    v_double_booking_count INTEGER;
    v_total_bookings INTEGER;
    v_unique_resources INTEGER;
    v_unique_users INTEGER;
    v_db_version TEXT;
    json_result TEXT;
BEGIN
    -- Fetch metadata
    SELECT value INTO v_run_id FROM evaluation_metadata WHERE key = 'run_id';
    SELECT value INTO v_started_at FROM evaluation_metadata WHERE key = 'started_at';
    SELECT value INTO v_finished_at FROM evaluation_metadata WHERE key = 'finished_at';
    
    -- Calculate duration
    v_duration := EXTRACT(EPOCH FROM (v_finished_at::timestamptz - v_started_at::timestamptz));
    
    -- Verify Logic: Check for double bookings in the 'bookings' table created by tests
    SELECT COUNT(*) INTO v_double_booking_count
    FROM (
        SELECT resource_id
        FROM bookings
        GROUP BY resource_id
        HAVING COUNT(*) > 1
    ) duplicates;
    
    SELECT COUNT(*) INTO v_total_bookings FROM bookings;
    SELECT COUNT(DISTINCT resource_id) INTO v_unique_resources FROM bookings;
    SELECT COUNT(DISTINCT user_id) INTO v_unique_users FROM bookings;

    -- Determine Pass/Fail criteria:
    -- 1. No double bookings
    -- 2. At least some bookings exist (sanity check that tests ran)
    v_passed := (v_double_booking_count = 0) AND (v_total_bookings > 0);
    
    -- Construct Output String (State Summary)
    v_output := '==================================================' || E'\n' ||
                'TEST EXECUTION SUMMARY' || E'\n' ||
                '==================================================' || E'\n' ||
                'Total Bookings Created: ' || v_total_bookings || E'\n' ||
                'Unique Resources Booked: ' || v_unique_resources || E'\n' ||
                'Unique Users: ' || v_unique_users || E'\n' ||
                '--------------------------------------------------' || E'\n' ||
                'Double Booking Check:' || E'\n';
                
    IF v_double_booking_count = 0 THEN
        v_output := v_output || 'PASSED: No double bookings detected.' || E'\n';
    ELSE
        v_output := v_output || 'FAILED: ' || v_double_booking_count || ' resources have double bookings!' || E'\n';
    END IF;

    IF v_passed THEN
        v_improvement_summary := 'Repository after passes all tests.';
        v_output := v_output || 'OVERALL RESULT: SUCCESS';
    ELSE
        v_improvement_summary := 'Repository after failed tests.';
        v_output := v_output || 'OVERALL RESULT: FAILURE';
        IF v_total_bookings = 0 THEN
             v_improvement_summary := v_improvement_summary || ' No bookings found (tests might have failed to run).';
        END IF;
    END IF;

    v_db_version := replace(replace(version(), '"', ''), E'\n', ' ');

    -- Construct JSON
    -- Replaced python_version with postgresql_version
    -- Used to_json(v_output) for safe string escaping in JSON
    json_result := format('{
  "run_id": "%s",
  "started_at": "%s",
  "finished_at": "%s",
  "duration_seconds": %s,
  "environment": {
    "postgresql_version": "%s",
    "platform": "%s"
  },
  "after": {
    "tests": {
      "passed": %s,
      "return_code": %s,
      "output": %s
    },
    "metrics": {}
  },
  "comparison": {
    "passed_gate": %s,
    "improvement_summary": "%s"
  },
  "success": %s,
  "error": null
}', 
        v_run_id, 
        to_char(v_started_at::timestamptz, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 
        to_char(v_finished_at::timestamptz, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 
        CASE WHEN v_duration IS NULL OR v_duration < 0 THEN 0 ELSE round(v_duration, 6) END,
        v_db_version,
        'Docker/Linux',           
        CASE WHEN v_passed THEN 'true' ELSE 'false' END,
        CASE WHEN v_passed THEN 0 ELSE 1 END,
        to_json(v_output),        
        CASE WHEN v_passed THEN 'true' ELSE 'false' END,
        v_improvement_summary,
        CASE WHEN v_passed THEN 'true' ELSE 'false' END
    );

    -- Store in temp table for export
    INSERT INTO report_output (json_content) VALUES (json_result);
END $$;

-- 5. Write to file
-- Redirect standard query output to the file provided via -v output_file=...
\o :output_file
SELECT json_content FROM report_output;
\o

\echo ''
\echo '============================================================'
\echo 'Report generated at:'
\echo :output_file
\echo '============================================================'