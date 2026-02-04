import pytest, sys, os
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
REPO_NAME = os.getenv('REPO_PATH', 'repository_after')
TARGET_PATH = os.path.join(BASE_DIR, REPO_NAME, 'backend')
if TARGET_PATH not in sys.path: sys.path.insert(0, TARGET_PATH)

from app import create_app, db
from app.models import User, UserBook
from flask_jwt_extended import create_access_token

@pytest.fixture
def app():
    app = create_app()
    app.config.update({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"})
    with app.app_context():
        db.create_all(); yield app; db.drop_all()

@pytest.fixture
def client(app): return app.test_client()

def test_req_1_search(client, app):
    """Requirement 1: Search books from mock JSON."""
    response = client.get('/api/books/search?q=Gatsby')
    assert response.status_code == 200
    assert any("Gatsby" in b['title'] for b in response.json)

def test_req_2_and_4_add_and_progress(client, app):
    """Requirement 2 & 4: Add to shelf and update progress bar."""
    with app.app_context():
        u = User(username="u", password_hash="p"); db.session.add(u); db.session.commit()
        token = create_access_token(identity=str(u.id))
    
    headers = {"Authorization": f"Bearer {token}"}
    client.post('/api/shelf/add', headers=headers, json={
        "id": "1", "title": "Gatsby", "pages": 200, "status": "currently-reading"
    })
    
    with app.app_context():
        bid = UserBook.query.first().id
    resp = client.post(f'/api/library/{bid}/progress', headers=headers, json={"current_page": 50})
    assert resp.status_code == 200

def test_req_3_and_6_finish_and_stats(client, app):
    """Requirement 3 & 6: Finish book with rating/notes and check dashboard."""
    with app.app_context():
        u = User(username="u", password_hash="p", yearly_goal=10); db.session.add(u); db.session.commit()
        token = create_access_token(identity=str(u.id))
        b = UserBook(user_id=u.id, title="Test", book_id="2", total_pages=100, status="currently-reading")
        db.session.add(b); db.session.commit()
        bid = b.id

    headers = {"Authorization": f"Bearer {token}"}
    client.post(f'/api/library/{bid}/finish', headers=headers, json={"rating": 5, "notes": "Great!"})
    
    stats = client.get('/api/user/stats', headers=headers)
    assert stats.json['books_read'] == 1
    assert stats.json['average_rating'] == 5.0
    assert "monthly_data" in stats.json

def test_deletion(client, app):
    """General cleanup requirement."""
    with app.app_context():
        u = User(username="u", password_hash="p"); db.session.add(u); db.session.commit()
        b = UserBook(user_id=u.id, title="Del", book_id="3")
        db.session.add(b); db.session.commit()
        token = create_access_token(identity=str(u.id))
        bid = b.id
    client.delete(f'/api/library/{bid}', headers={"Authorization": f"Bearer {token}"})
    with app.app_context():
        assert db.session.get(UserBook, bid) is None