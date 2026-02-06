import pytest
from unittest.mock import MagicMock
from sqlalchemy.orm import Session
from repository_after.api import endpoints
from repository_after import schemas, models
from fastapi import HTTPException

def test_unit_api_create_document():
    # Mock DB
    db = MagicMock(spec=Session)
    doc_in = schemas.DocumentCreate(title="Test", content="Content", author_id="author")
    
    # Mock CRUD return
    mock_revision = models.Revision(id=1, document_id=1, version_number=1, content="Content", author_id="author")
    
    with MagicMock() as mock_crud:
        # We need to monkeypatch crud because it's imported in endpoints
        import repository_after.crud as crud
        original_create = crud.create_document
        crud.create_document = MagicMock(return_value=mock_revision)
        
        response = endpoints.create_document(doc_in, db)
        
        assert response.id == 1
        crud.create_document.assert_called_once_with(db, doc_in)
        
        crud.create_document = original_create

def test_unit_api_get_document_not_found():
    db = MagicMock(spec=Session)
    
    import repository_after.crud as crud
    original_get = crud.get_document
    crud.get_document = MagicMock(return_value=None)
    
    with pytest.raises(HTTPException) as exc:
        endpoints.get_document(999, db)
    
    assert exc.value.status_code == 404
    
    crud.get_document = original_get

def test_unit_api_update_document():
    db = MagicMock(spec=Session)
    update_in = schemas.DocumentUpdate(content="New content", author_id="author2")
    
    mock_revision = models.Revision(id=2, document_id=1, version_number=2, content="New content", author_id="author2")
    
    import repository_after.crud as crud
    original_update = crud.update_document
    crud.update_document = MagicMock(return_value=mock_revision)
    
    response = endpoints.update_document(1, update_in, db)
    
    assert response.version_number == 2
    crud.update_document.assert_called_once_with(db, 1, update_in)
    
    crud.update_document = original_update

def test_unit_api_rollback():
    db = MagicMock(spec=Session)
    
    mock_revision = models.Revision(id=3, document_id=1, version_number=3, content="v1 content", author_id="rollbacker")
    
    import repository_after.crud as crud
    original_rollback = crud.rollback_document
    crud.rollback_document = MagicMock(return_value=mock_revision)
    
    response = endpoints.rollback_document(1, 1, "rollbacker", db)
    
    assert response.version_number == 3
    crud.rollback_document.assert_called_once_with(db, 1, 1, "rollbacker")
    
    crud.rollback_document = original_rollback

def test_unit_api_get_diff():
    db = MagicMock(spec=Session)
    
    rev1 = models.Revision(id=1, version_number=1, content="v1")
    rev2 = models.Revision(id=2, version_number=2, content="v2")
    
    import repository_after.crud as crud
    original_get_rev = crud.get_revision
    crud.get_revision = MagicMock(side_effect=[rev1, rev2])
    
    from repository_after.services.diff_service import DiffService
    original_get_diff = DiffService.get_structured_diff
    original_get_patch = DiffService.get_unified_diff
    
    DiffService.get_structured_diff = MagicMock(return_value=[{"type": "equal", "text": "v"}])
    DiffService.get_unified_diff = MagicMock(return_value="patch data")
    
    response = endpoints.get_diff(1, 2, db)
    
    assert response.old_version_id == 1
    assert response.new_version_id == 2
    assert response.patch == "patch data"
    
    crud.get_revision = original_get_rev
    DiffService.get_structured_diff = original_get_diff
    DiffService.get_unified_diff = original_get_patch

def test_unit_api_get_history():
    db = MagicMock(spec=Session)
    
    mock_history = [
        models.Revision(id=2, version_number=2, author_id="u2"),
        models.Revision(id=1, version_number=1, author_id="u1")
    ]
    
    import repository_after.crud as crud
    original_get_history = crud.get_document_history
    crud.get_document_history = MagicMock(return_value=mock_history)
    
    response = endpoints.get_document_history(1, 0, 10, db)
    
    assert len(response) == 2
    assert response[0].version_number == 2
    crud.get_document_history.assert_called_once_with(db, 1, skip=0, limit=10)
    
    crud.get_document_history = original_get_history
