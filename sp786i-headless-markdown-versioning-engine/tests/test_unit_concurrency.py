import pytest
import threading
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from repository_after import crud, models, schemas
from repository_after.database import Base

from sqlalchemy.pool import StaticPool

# Setup file-based SQLite for concurrency unit test to avoid memory sharing issues
# and better simulate concurrent access.
SQLALCHEMY_DATABASE_URL = "sqlite:///test_concurrency.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, expire_on_commit=False)

import os
if os.path.exists("test_concurrency.db"):
    os.remove("test_concurrency.db")

@pytest.fixture
def db_session_factory():
    Base.metadata.create_all(bind=engine)
    yield TestingSessionLocal
    Base.metadata.drop_all(bind=engine)
    if os.path.exists("test_concurrency.db"):
        try:
            os.remove("test_concurrency.db")
        except:
            pass

def test_unit_crud_concurrency(db_session_factory):
    # Setup initial doc
    db = db_session_factory()
    doc_in = schemas.DocumentCreate(title="Concurrency Unit Test", content="Initial", author_id="system")
    initial_rev = crud.create_document(db, doc_in)
    doc_id = initial_rev.document_id
    db.close()

    def concurrent_update(i):
        # Each thread gets its own session
        session = db_session_factory()
        try:
            update_data = schemas.DocumentUpdate(content=f"Update {i}", author_id=f"user_{i}")
            res = crud.update_document(session, doc_id, update_data)
            return res
        finally:
            session.close()

    num_threads = 5
    with ThreadPoolExecutor(max_workers=num_threads) as executor:
        results = list(executor.map(concurrent_update, range(num_threads)))

    # Verify all threads succeeded (crud.update_document has retry logic)
    assert all(r is not None for r in results)

    # Verify history is sequential
    db = db_session_factory()
    history = crud.get_document_history(db, doc_id)
    assert len(history) == num_threads + 1
    
    versions = sorted([h.version_number for h in history])
    assert versions == list(range(1, num_threads + 2))
    db.close()
