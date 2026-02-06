from repository_after import crud, schemas, models

# Use db_session fixture from conftest.py which uses PostgreSQL

def test_unit_create_document(db_session):
    # Requirement 1: Immutability / Creation
    doc_in = schemas.DocumentCreate(title="Unit Test Doc", content="Initial content", author_id="unit_author")
    revision = crud.create_document(db_session, doc_in)
    
    assert revision.version_number == 1
    assert revision.content == "Initial content"
    assert revision.author_id == "unit_author"
    
    doc = crud.get_document(db_session, revision.document_id)
    assert doc.title == "Unit Test Doc"
    assert doc.latest_revision_id == revision.id

def test_unit_update_document(db_session):
    # Requirement 1: Immutability / Update
    doc_in = schemas.DocumentCreate(title="Update Test", content="v1", author_id="auth1")
    rev1 = crud.create_document(db_session, doc_in)
    
    update_in = schemas.DocumentUpdate(content="v2", author_id="auth2")
    rev2 = crud.update_document(db_session, rev1.document_id, update_in)
    
    assert rev2.version_number == 2
    assert rev2.content == "v2"
    assert rev2.author_id == "auth2"
    
    # Verify both exist (Immutability)
    all_revs = db_session.query(models.Revision).filter(models.Revision.document_id == rev1.document_id).all()
    assert len(all_revs) == 2

def test_unit_get_document_history(db_session):
    # Requirement 5: Efficient History Provider
    doc_in = schemas.DocumentCreate(title="History Test", content="v1", author_id="auth1")
    rev1 = crud.create_document(db_session, doc_in)
    crud.update_document(db_session, rev1.document_id, schemas.DocumentUpdate(content="v2", author_id="auth2"))
    
    history = crud.get_document_history(db_session, rev1.document_id)
    assert len(history) == 2
    # Metadata check (History provider should return metadata, not full content)
    # Note: get_document_history returns Row objects with specific fields
    assert history[0].version_number == 2
    assert history[1].version_number == 1
    assert hasattr(history[0], 'author_id')
    assert hasattr(history[0], 'timestamp')
    # Content should not be in the metadata
    assert not hasattr(history[0], 'content')

def test_unit_rollback_document(db_session):
    # Requirement 4: Rollback functionality
    doc_in = schemas.DocumentCreate(title="Rollback Test", content="v1", author_id="auth1")
    rev1 = crud.create_document(db_session, doc_in)
    rev2 = crud.update_document(db_session, rev1.document_id, schemas.DocumentUpdate(content="v2", author_id="auth2"))
    
    # Rollback to v1
    rev3 = crud.rollback_document(db_session, rev1.document_id, rev1.id, "rollbacker")
    
    assert rev3.version_number == 3
    assert rev3.content == "v1"
    assert rev3.author_id == "rollbacker"
    
    # Verify linear chain
    history = crud.get_document_history(db_session, rev1.document_id)
    assert [h.version_number for h in history] == [3, 2, 1]

def test_unit_get_latest_revision_optimized(db_session):
    # Requirement 8: O(1) performance logic check
    doc_in = schemas.DocumentCreate(title="Performance Test", content="v1", author_id="auth1")
    rev1 = crud.create_document(db_session, doc_in)
    
    for i in range(2, 6):
        rev = crud.update_document(db_session, rev1.document_id, schemas.DocumentUpdate(content=f"v{i}", author_id="auth1"))
        latest_id = rev.id
        
    latest = crud.get_latest_revision(db_session, rev1.document_id)
    assert latest.id == latest_id
    assert latest.version_number == 5
