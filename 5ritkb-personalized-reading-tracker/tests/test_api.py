import pytest, sys, os
from datetime import datetime, timedelta

# Path setup
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
REPO_NAME = os.getenv('REPO_PATH', 'repository_after')
TARGET_PATH = os.path.join(BASE_DIR, REPO_NAME, 'backend')
if TARGET_PATH not in sys.path: sys.path.insert(0, TARGET_PATH)

from app import create_app, db
from app.models import User, UserBook, ReadingLog
from flask_jwt_extended import create_access_token

@pytest.fixture
def app():
    app = create_app()
    app.config.update({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"})
    with app.app_context():
        db.create_all()
        yield app
        db.drop_all()

@pytest.fixture
def client(app): return app.test_client()

@pytest.fixture
def auth_header(app):
    with app.app_context():
        u = User(username="testuser", password_hash="p", yearly_goal=12)
        db.session.add(u)
        db.session.commit()
        token = create_access_token(identity=str(u.id))
        return {"Authorization": f"Bearer {token}"}

def test_book_search_functionality(client, app):
    """Verify that users can search for books by title or author."""
    response = client.get('/api/books/search?q=Gatsby')
    assert response.status_code == 200
    assert any("Gatsby" in b['title'] for b in response.json)

def test_custom_shelf_creation_and_assignment(client, auth_header):
    """Verify users can create personal shelves and assign books to them."""
    # Create shelf
    client.post('/api/shelves', headers=auth_header, json={"name": "Winter Reads"})
    
    # Assign book
    resp = client.post('/api/shelf/add', headers=auth_header, json={
        "id": "123", "title": "The Hobbit", "status": "Winter Reads"
    })
    assert resp.status_code == 201
    assert "Winter Reads" in resp.json['msg']

def test_note_persistence_on_active_books(client, auth_header, app):
    """Ensure notes can be added to books currently being read without finishing them."""
    client.post('/api/shelf/add', headers=auth_header, json={
        "id": "456", "title": "1984", "status": "currently-reading"
    })
    
    with app.app_context():
        bid = UserBook.query.filter_by(title="1984").first().id

    resp = client.post(f'/api/library/{bid}/progress', headers=auth_header, json={
        "notes": "Very interesting world-building."
    })
    assert resp.status_code == 200
    
    with app.app_context():
        # Using the updated Session.get syntax to avoid the legacy warning
        book = db.session.get(UserBook, bid)
        assert book.notes == "Very interesting world-building."
        assert book.status == "currently-reading"

def test_dashboard_metrics_and_pace_logic(client, auth_header, app):
    """Verify calculation of reading streaks, average time, and yearly goal projection."""
    with app.app_context():
        u = User.query.filter_by(username="testuser").first()
        b = UserBook(user_id=u.id, book_id="789", title="Active Book", status="currently-reading")
        db.session.add(b)
        db.session.flush()
        
        # Mock activity log for streak
        yesterday = datetime.utcnow().date() - timedelta(days=1)
        db.session.add(ReadingLog(user_book_id=b.id, date=yesterday, pages_read=5))
        db.session.add(ReadingLog(user_book_id=b.id, date=datetime.utcnow().date(), pages_read=5))
        db.session.commit()

    stats = client.get('/api/user/stats', headers=auth_header).json
    assert stats['streak'] >= 2
    assert "pace_status" in stats
    assert "avg_reading_time" in stats

def test_book_deletion(client, auth_header, app):
    """Verify that books can be successfully removed from the user library"""
    with app.app_context():
        u = User.query.filter_by(username="testuser").first()
        b = UserBook(user_id=u.id, title="Delete Me", book_id="del_1")
        db.session.add(b)
        db.session.commit()
        bid = b.id
    
    client.delete(f'/api/library/{bid}', headers=auth_header)
    
    with app.app_context():
        assert db.session.get(UserBook, bid) is None