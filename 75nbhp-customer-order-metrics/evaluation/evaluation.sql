
CREATE TEMP TABLE IF NOT EXISTS test_execution_log (
    test_name TEXT,
    status TEXT,
    duration_ms INTEGER,
    failure_messages TEXT[],
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT clock_timestamp()
);


CREATE OR REPLACE FUNCTION log_test_result(
    p_test_name TEXT,
    p_status TEXT,
    p_duration_ms INTEGER,
    p_failure_messages TEXT[] DEFAULT ARRAY[]::TEXT[]
) RETURNS VOID AS $$
BEGIN
    INSERT INTO test_execution_log (test_name, status, duration_ms, failure_messages)
    VALUES (p_test_name, p_status, p_duration_ms, p_failure_messages);
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION generate_evaluation_report()
RETURNS TEXT AS $$
DECLARE
    run_id TEXT := gen_random_uuid()::TEXT;
    start_time TIMESTAMP WITH TIME ZONE := clock_timestamp();
    end_time TIMESTAMP WITH TIME ZONE;
    duration_seconds INTEGER;
    success BOOLEAN := TRUE;
    exit_code INTEGER := 0;
    total_tests INTEGER := 0;
    passed_tests INTEGER := 0;
    failed_tests INTEGER := 0;
    report_json JSONB;
    tests_array JSONB := '[]'::JSONB;
    test_record RECORD;
BEGIN

    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'passed'),
        COUNT(*) FILTER (WHERE status = 'failed')
    INTO total_tests, passed_tests, failed_tests
    FROM test_execution_log;

    success := (failed_tests = 0);
    exit_code := CASE WHEN success THEN 0 ELSE 1 END;
    

    FOR test_record IN SELECT test_name, status, duration_ms, failure_messages FROM test_execution_log ORDER BY executed_at
    LOOP
        tests_array := tests_array || jsonb_build_object(
            'name', test_record.test_name,
            'status', test_record.status,
            'duration', test_record.duration_ms,
            'failureMessages', test_record.failure_messages
        );
    END LOOP;
    
    end_time := clock_timestamp();
    duration_seconds := EXTRACT(EPOCH FROM (end_time - start_time))::INTEGER;
    

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
                'tests', tests_array,
                'summary', jsonb_build_object(
                    'total', total_tests,
                    'passed', passed_tests,
                    'failed', failed_tests,
                    'xfailed', 0,
                    'errors', 0,
                    'skipped', 0
                )
            ),
            'comparison', jsonb_build_object(
                'after_tests_passed', success,
                'after_total', total_tests,
                'after_passed', passed_tests,
                'after_failed', failed_tests,
                'after_xfailed', 0
            )
        )
    );
    

    RETURN report_json::TEXT;
END;
$$ LANGUAGE plpgsql;


SELECT generate_evaluation_report() AS report_json;
