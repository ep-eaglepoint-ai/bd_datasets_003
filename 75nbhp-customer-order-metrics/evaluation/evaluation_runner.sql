-- PostgreSQL Evaluation Script Runner
-- This script runs all tests and generates a comprehensive JSON report
-- Compatible with the existing test files in /tests/

-- Create a temporary table to store test results
CREATE TEMP TABLE IF NOT EXISTS test_results (
    test_name TEXT,
    status TEXT,
    duration_ms INTEGER,
    failure_messages TEXT[]
);

-- Function to generate the final JSON report
CREATE OR REPLACE FUNCTION generate_evaluation_report()
RETURNS TEXT AS $$
DECLARE
    run_id TEXT := gen_random_uuid()::TEXT;
    start_time TIMESTAMP WITH TIME ZONE := clock_timestamp();
    end_time TIMESTAMP WITH TIME ZONE;
    duration_seconds INTEGER;
    success BOOLEAN := TRUE;
    exit_code INTEGER := 0;
    total_tests INTEGER;
    passed_tests INTEGER;
    failed_tests INTEGER;
    report_json JSONB;
    test_results_json JSONB;
BEGIN
    -- Get test statistics
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'passed'),
        COUNT(*) FILTER (WHERE status = 'failed')
    INTO total_tests, passed_tests, failed_tests
    FROM test_results;
    
    -- Set overall success and exit code
    success := (failed_tests = 0);
    exit_code := CASE WHEN success THEN 0 ELSE 1 END;
    
    -- Convert test results to JSON
    SELECT jsonb_agg(
        jsonb_build_object(
            'name', test_name,
            'status', status,
            'duration', duration_ms,
            'failureMessages', failure_messages
        )
    ) INTO test_results_json
    FROM test_results;
    
    end_time := clock_timestamp();
    duration_seconds := EXTRACT(EPOCH FROM (end_time - start_time))::INTEGER;
    
    -- Build the complete JSON report
    report_json := jsonb_build_object(
        'run_id', run_id,
        'started_at', to_char(start_time, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'finished_at', to_char(end_time, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'duration_seconds', duration_seconds,
        'success', success,
        'error', NULL::TEXT,
        'environment', jsonb_build_object(
            'postgres_version', (SELECT version()::TEXT),
            'platform', (SELECT current_setting('server_version_num')::TEXT),
            'os', 'PostgreSQL',
            'architecture', 'x86_64',
            'hostname', (SELECT inet_server_addr()::TEXT)
        ),
        'results', jsonb_build_object(
            'after', jsonb_build_object(
                'success', success,
                'exit_code', exit_code,
                'tests', COALESCE(test_results_json, '[]'::JSONB),
                'summary', jsonb_build_object(
                    'total', COALESCE(total_tests, 0),
                    'passed', COALESCE(passed_tests, 0),
                    'failed', COALESCE(failed_tests, 0),
                    'xfailed', 0,
                    'errors', 0,
                    'skipped', 0
                )
            ),
            'comparison', jsonb_build_object(
                'after_tests_passed', success,
                'after_total', COALESCE(total_tests, 0),
                'after_passed', COALESCE(passed_tests, 0),
                'after_failed', COALESCE(failed_tests, 0),
                'after_xfailed', 0
            )
        )
    );
    
    RETURN report_json::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Main execution block
DO $$
DECLARE
    report_content TEXT;
BEGIN
    -- Clear any previous test results
    DELETE FROM test_results;
    
    -- Note: Actual test execution will be handled by the shell script
    -- This SQL script provides the framework for generating the report
    
    -- Generate the report (will be populated after tests run)
    report_content := generate_evaluation_report();
    
    -- Create a temporary table for the report content
    CREATE TEMP TABLE evaluation_report_output AS 
    SELECT report_content AS report_json;
    
    RAISE NOTICE 'Evaluation framework initialized. Run tests and then call generate_evaluation_report()';
END $$;

-- Helper query to get the current report (for debugging)
-- SELECT report_json FROM evaluation_report_output;
