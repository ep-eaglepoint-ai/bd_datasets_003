import pytest
import psycopg2
import os
import time

@pytest.fixture(scope="session")
def db_config():
    return {
        "dbname": "testdb",
        "user": "testuser",
        "password": "testpass",
        "host": "db",
        "port": "5432"
    }

@pytest.fixture(scope="function")
def db_conn(db_config):
    """Provide a database connection.
    Retries connection if DB is not ready yet.
    """
    retries = 5
    conn = None
    last_error = None
    
    for _ in range(retries):
        try:
            conn = psycopg2.connect(**db_config)
            conn.autocommit = True
            break
        except psycopg2.OperationalError as e:
            last_error = e
            time.sleep(1)
            
    if conn is None:
        pytest.fail(f"Could not connect to database after {retries} retries: {last_error}")
        
    yield conn
    conn.close()

@pytest.fixture(scope="function")
def clean_bookings(db_conn):
    """Clean bookings table before test."""
    with db_conn.cursor() as cur:
        # Create table if not exists (setup)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS bookings (
                id SERIAL PRIMARY KEY,
                resource_id INT NOT NULL,
                user_id INT NOT NULL,
                booked_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
        """)
        cur.execute("TRUNCATE bookings;")
    return db_conn
