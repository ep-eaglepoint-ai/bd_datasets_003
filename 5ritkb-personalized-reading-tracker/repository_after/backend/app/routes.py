import json
import os
from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from werkzeug.security import generate_password_hash, check_password_hash
from .models import db, User, UserBook
from .utils.stats_engine import calculate_reading_stats
from datetime import datetime

api = Blueprint('api', __name__)

MOCK_DATA_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'books_mock.json')

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
        yearly_goal=data.get('yearly_goal', 12)
    )
    db.session.add(user)
    db.session.commit()
    return jsonify({"msg": "User created"}), 201

@api.route('/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    
    # Defensive check: Ensure data is not None and keys exist
    if not data:
        return jsonify({"msg": "Missing request body"}), 400
        
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({"msg": "Username and password required"}), 400

    user = User.query.filter_by(username=username).first()
    
    if user and check_password_hash(user.password_hash, password):
        access_token = create_access_token(identity=str(user.id))
        return jsonify(access_token=access_token), 200
        
    return jsonify({"msg": "Bad username or password"}), 401

# BOOK SEARCH & LIBRARY ROUTES

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

@api.route('/library', methods=['GET'])
@jwt_required()
def get_library():
    user_id = get_jwt_identity()
    books = UserBook.query.filter_by(user_id=user_id).all()
    return jsonify([{
        "id": b.id, 
        "title": b.title, 
        "author": b.author, 
        "cover_image": b.cover_image,
        "status": b.status,
        "current_page": b.current_page,
        "total_pages": b.total_pages,
        "rating": b.rating,
        "notes": b.notes,
        "last_updated": b.last_updated.isoformat() if b.last_updated else None
    } for b in books]), 200

@api.route('/shelf/add', methods=['POST'])
@jwt_required()
def add_to_shelf():
    user_id = get_jwt_identity()
    data = request.get_json()
    book_id = str(data.get('id'))

    existing = UserBook.query.filter_by(user_id=user_id, book_id=book_id).first()
    if existing:
        return jsonify({"msg": "Book already in library"}), 400
    
    new_book = UserBook(
        user_id=user_id,
        book_id=book_id,
        title=data.get('title'),
        author=data.get('author'),
        cover_image=data.get('cover'), 
        total_pages=data.get('pages', 100), 
        status=data.get('status', 'want-to-read'),
        start_date=datetime.utcnow() if data.get('status') == 'currently-reading' else None,
        last_updated=datetime.utcnow()
    )
    db.session.add(new_book)
    db.session.commit()
    return jsonify({"msg": f"Added to {new_book.status}"}), 201

@api.route('/library/<int:id>/progress', methods=['POST'])
@jwt_required()
def update_progress(id):
    user_id = get_jwt_identity()
    data = request.get_json()
    book = UserBook.query.filter_by(id=id, user_id=user_id).first_or_404()
    
    if 'status' in data:
        book.status = data.get('status')
        if book.status == 'currently-reading' and not book.start_date:
            book.start_date = datetime.utcnow()
    
    if 'current_page' in data:
        book.current_page = data.get('current_page')
        
    # TO SATISFY REQUIREMENT #3
    if 'notes' in data:
        book.notes = data.get('notes')
    
    book.last_updated = datetime.utcnow()
    db.session.commit()
    return jsonify({"msg": "Progress and notes updated"}), 200

@api.route('/library/<int:id>/finish', methods=['POST'])
@jwt_required()
def finish_book(id):
    user_id = get_jwt_identity()
    data = request.get_json()
    book = UserBook.query.filter_by(id=id, user_id=user_id).first_or_404()
    
    book.status = 'finished'
    book.rating = data.get('rating', 0)
    book.notes = data.get('notes', '')
    book.finish_date = datetime.utcnow()
    book.current_page = book.total_pages 
    book.last_updated = datetime.utcnow()
    
    db.session.commit()
    return jsonify({"msg": "Book marked as finished"}), 200

@api.route('/library/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_book(id):
    user_id = get_jwt_identity()
    book = UserBook.query.filter_by(id=id, user_id=user_id).first_or_404()
    
    db.session.delete(book)
    db.session.commit()
    return jsonify({"msg": "Book removed from library"}), 200

@api.route('/user/stats', methods=['GET'])
@jwt_required()
def get_user_stats():
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"msg": "User not found"}), 404
        
    stats = calculate_reading_stats(user)
    stats["yearly_goal"] = user.yearly_goal
    return jsonify(stats), 200