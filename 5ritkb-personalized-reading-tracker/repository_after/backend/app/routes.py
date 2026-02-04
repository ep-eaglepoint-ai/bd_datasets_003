import json
import os
from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from werkzeug.security import generate_password_hash, check_password_hash
from .models import db, User, UserBook, ReadingLog
from .utils.stats_engine import calculate_reading_stats
from datetime import datetime

api = Blueprint('api', __name__)

MOCK_DATA_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'books_mock.json')

# HELPERS

def get_pace_status(user, books_read_count):
    """Requirement: Projecting yearly goal completion based on pace."""
    if not user.yearly_goal or user.yearly_goal == 0:
        return "No goal set"
    
    day_of_year = datetime.utcnow().timetuple().tm_yday
    expected_pace = (user.yearly_goal / 365) * day_of_year
    
    if books_read_count >= expected_pace:
        return "Ahead of Pace" if books_read_count > expected_pace + 1 else "On Track"
    return "Behind Pace"

# AUTH ROUTES

@api.route('/auth/register', methods=['POST'])
def register():
    data = request.get_json()
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({"msg": "Username and password required"}), 400
        
    if User.query.filter_by(username=data['username']).first():
        return jsonify({"msg": "User already exists"}), 400
        
    user = User(
        username=data['username'], 
        password_hash=generate_password_hash(data['password']),
        yearly_goal=data.get('yearly_goal', 12),
        custom_shelves=[] 
    )
    db.session.add(user)
    db.session.commit()
    return jsonify({"msg": "User created"}), 201

@api.route('/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data:
        return jsonify({"msg": "Missing request body"}), 400
        
    user = User.query.filter_by(username=data.get('username')).first()
    if user and check_password_hash(user.password_hash, data.get('password')):
        access_token = create_access_token(identity=str(user.id))
        return jsonify(access_token=access_token), 200
        
    return jsonify({"msg": "Bad username or password"}), 401

# SHELF MANAGEMENT

@api.route('/shelves', methods=['POST'])
@jwt_required()
def create_shelf():
    """Requirement: Creating custom shelves."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    data = request.get_json()
    shelf_name = data.get('name')
    
    if not shelf_name:
        return jsonify({"msg": "Shelf name required"}), 400
    
    current_shelves = list(user.custom_shelves) if user.custom_shelves else []
    if shelf_name not in current_shelves:
        current_shelves.append(shelf_name)
        user.custom_shelves = current_shelves
        db.session.commit()
        
    return jsonify({"msg": f"Shelf '{shelf_name}' created", "shelves": user.custom_shelves}), 201

# BOOK SEARCH & LIBRARY

@api.route('/books/search', methods=['GET'])
def search_books():
    query = request.args.get('q', '').lower()
    if not os.path.exists(MOCK_DATA_PATH):
        return jsonify([]), 200
        
    with open(MOCK_DATA_PATH, 'r') as f:
        books = json.load(f)
        
    if not query:
        return jsonify(books), 200
        
    results = [b for b in books if query in b['title'].lower() or query in b.get('author', '').lower()]
    return jsonify(results), 200

@api.route('/shelf/add', methods=['POST'])
@jwt_required()
def add_to_shelf():
    user_id = get_jwt_identity()
    data = request.get_json()
    book_id = str(data.get('id'))

    existing = UserBook.query.filter_by(user_id=user_id, book_id=book_id).first()
    if existing:
        return jsonify({"msg": "Book already in library"}), 400
    
    status = data.get('status', 'want-to-read')
    
    new_book = UserBook(
        user_id=user_id,
        book_id=book_id,
        title=data.get('title'),
        author=data.get('author'),
        cover_image=data.get('cover'), 
        total_pages=data.get('pages', 100), 
        status=status,
        start_date=datetime.utcnow() if status == 'currently-reading' else None
    )
    db.session.add(new_book)
    db.session.commit()
    return jsonify({"msg": f"Added to {status}"}), 201

@api.route('/library/<int:id>/progress', methods=['POST'])
@jwt_required()
def update_progress(id):
    """Requirement: Update progress, log activity for streaks, and add notes to unfinished books."""
    user_id = get_jwt_identity()
    data = request.get_json()
    book = UserBook.query.filter_by(id=id, user_id=user_id).first_or_404()
    
    # Update Pages and Log Activity (For Reading Streaks)
    if 'current_page' in data:
        diff = data['current_page'] - book.current_page
        book.current_page = data['current_page']
        
        if diff > 0:
            log = ReadingLog(user_book_id=book.id, pages_read=diff)
            db.session.add(log)

    # Update Notes (Supports Requirement: Notes on unfinished books)
    if 'notes' in data:
        book.notes = data.get('notes')

    if 'status' in data:
        book.status = data.get('status')
        if book.status == 'currently-reading' and not book.start_date:
            book.start_date = datetime.utcnow()
    
    db.session.commit()
    return jsonify({"msg": "Progress and notes updated"}), 200

@api.route('/library/<int:id>/finish', methods=['POST'])
@jwt_required()
def finish_book(id):
    """Requirement: Marking a book as finished with final rating/notes."""
    user_id = get_jwt_identity()
    data = request.get_json()
    book = UserBook.query.filter_by(id=id, user_id=user_id).first_or_404()
    
    book.status = 'finished'
    book.finish_date = datetime.utcnow()
    book.current_page = book.total_pages 
    book.rating = data.get('rating', 0)
    book.notes = data.get('notes', book.notes)
    
    db.session.commit()
    return jsonify({"msg": "Book marked as finished"}), 200

@api.route('/user/stats', methods=['GET'])
@jwt_required()
def get_user_stats():
    """Requirement: Calculating streaks, avg time, and yearly pace."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"msg": "User not found"}), 404
        
    stats = calculate_reading_stats(user)
    
    finished_count = UserBook.query.filter_by(user_id=user_id, status='finished').count()
    stats["pace_status"] = get_pace_status(user, finished_count)
    
    return jsonify(stats), 200

@api.route('/library/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_book(id):
    user_id = get_jwt_identity()
    book = UserBook.query.filter_by(id=id, user_id=user_id).first_or_404()
    db.session.delete(book)
    db.session.commit()
    return jsonify({"msg": "Book removed"}), 200