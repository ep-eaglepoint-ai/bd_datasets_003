import pytest
import threading
import psycopg2
from pathlib import Path

# Load the implementation SQL
REPO_ROOT = Path(__file__).parent.parent
SQL_FILE_PATH = REPO_ROOT / "repository_after" / "concurrent_booking.sql"

def get_clean_booking_sql():
    """Read implementation and strip transaction control for psycopg2 execution."""
    if not SQL_FILE_PATH.exists():
        pytest.fail(f"Implementation file not found: {SQL_FILE_PATH}")
    
    with open(SQL_FILE_PATH, "r") as f:
        sql = f.read()
    
    # Use named parameters for psycopg2 integration
    sql = sql.replace("$1", "%(resource_id)s").replace("$2", "%(user_id)s")
    
    # Remove manual transaction control as psycopg2 handles this
    sql = sql.replace("BEGIN;", "").replace("COMMIT;", "").replace("ROLLBACK;", "")
    
    return sql

BOOKING_SQL = get_clean_booking_sql()

def run_booking_transaction(db_config, resource_id, user_id):
    """Executes the booking transaction and returns the result message."""
    conn = psycopg2.connect(**db_config)
    result = None
    try:
        with conn.cursor() as cur:
            # Execute the entire logic block in one go
            cur.execute(BOOKING_SQL, {"resource_id": resource_id, "user_id": user_id})
            
            # Retrieve the status message from the SELECT CASE statement
            row = cur.fetchone()
            if row:
                result = row[0]
            
            conn.commit()
    except Exception as e:
        result = f"Error: {e}"
        conn.rollback()
    finally:
        conn.close()
    return result

def test_sequential_booking(db_config, clean_bookings):
    """Test 1.1: Sequential bookings on the same resource."""
    # First attempt should succeed
    res1 = run_booking_transaction(db_config, 1, 100)
    assert "SUCCESS" in str(res1)
    
    # Second attempt should fail
    res2 = run_booking_transaction(db_config, 1, 200)
    assert "FAILED" in str(res2)
    
    # Verify DB state
    conn = psycopg2.connect(**db_config)
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM bookings WHERE resource_id = 1")
        assert cur.fetchone()[0] == 1
    conn.close()

def test_concurrent_bookings(db_config, clean_bookings):
    """Test 1.2: Atomic concurrency prevention with multiple threads."""
    resource_id = 99
    num_threads = 10
    results = [None] * num_threads
    
    def worker(idx):
        user_id = 1000 + idx
        results[idx] = run_booking_transaction(db_config, resource_id, user_id)
        
    threads = [threading.Thread(target=worker, args=(i,)) for i in range(num_threads)]
    for t in threads: t.start()
    for t in threads: t.join()
        
    # Validation: Exactly one transaction must succeed
    successes = [r for r in results if r and "SUCCESS" in r]
    failures = [r for r in results if r and "FAILED" in r]
    
    assert len(successes) == 1, f"Expected exactly 1 success, but got {len(successes)}. Results: {results}"
    assert len(failures) == num_threads - 1

    # Final DB check
    conn = psycopg2.connect(**db_config)
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM bookings WHERE resource_id = %s", (resource_id,))
        assert cur.fetchone()[0] == 1
    conn.close()

def test_multi_resource_concurrency(db_config, clean_bookings):
    """Test 2.1: Multiple resources being contested simultaneously."""
    num_resources = 5
    threads_per_resource = 4
    total_threads = num_resources * threads_per_resource
    results = [] # Shared list for thread results
    
    def worker(rid, uid):
        res = run_booking_transaction(db_config, rid, uid)
        results.append((rid, res))
        
    threads = []
    for r in range(1, num_resources + 1):
        for t in range(threads_per_resource):
            # Unique user for every attempt
            uid = 1000 + (r * 10) + t
            thread = threading.Thread(target=worker, args=(r, uid))
            threads.append(thread)
            
    for t in threads: t.start()
    for t in threads: t.join()
    
    # Validation: Every resource should have exactly one success
    for r in range(1, num_resources + 1):
        resource_results = [res for rid, res in results if rid == r]
        successes = [res for res in resource_results if "SUCCESS" in res]
        assert len(successes) == 1, f"Resource {r} should have 1 success, got {len(successes)}"

def test_high_load_stress(db_config, clean_bookings):
    """Test 2.2: A higher volume of unique resources booked sequentially."""
    num_bookings = 100
    for i in range(num_bookings):
        res = run_booking_transaction(db_config, i, 5000 + i)
        assert "SUCCESS" in str(res)
        
    conn = psycopg2.connect(**db_config)
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM bookings")
        assert cur.fetchone()[0] == num_bookings
    conn.close()

@pytest.mark.parametrize("resource_id", [0, -1, 2147483647])
def test_resource_id_boundaries(db_config, clean_bookings, resource_id):
    """Test 2.3: Ensure boundary resource IDs work correctly."""
    res = run_booking_transaction(db_config, resource_id, 888)
    assert "SUCCESS" in str(res)
    
    # Try again to ensure locking/prevention still works on boundaries
    res2 = run_booking_transaction(db_config, resource_id, 999)
    assert "FAILED" in str(res2)

def test_transaction_rollback_release(db_config, clean_bookings):
    """Test 2.4: Ensure lock is released even if transaction fails mid-way."""
    resource_id = 777
    
    # 1. Try a custom broken transaction that gets the lock but errors
    conn = psycopg2.connect(**db_config)
    try:
        with conn.cursor() as cur:
            # Manually get the advisory lock but don't commit
            cur.execute("SELECT pg_advisory_xact_lock(%s)", (resource_id,))
            # Simulate a crash/error
            raise ValueError("Simulated app error")
    except ValueError:
        conn.rollback()
    finally:
        conn.close()
        
    # 2. The resource should still be bookable now because xact_lock releases on rollback
    res = run_booking_transaction(db_config, resource_id, 1)
    assert "SUCCESS" in str(res)
