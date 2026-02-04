from . import db
from datetime import datetime

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    yearly_goal = db.Column(db.Integer, default=12)
    # Relation to books owned by the user
    books = db.relationship('UserBook', backref='owner', lazy=True)

class UserBook(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    
    # Book Metadata (Requirement 1)
    book_id = db.Column(db.String(50), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    author = db.Column(db.String(200))
    cover_image = db.Column(db.String(500)) # Stores the URL from JSON
    
    # Progress Tracking (Requirement 2)
    total_pages = db.Column(db.Integer, nullable=False, default=100)
    current_page = db.Column(db.Integer, default=0)
    
    # Organization (Requirement 4)
    status = db.Column(db.String(50), default='want-to-read')
    
    # Reviews & Notes (Requirement 3)
    rating = db.Column(db.Integer) # 1-5 stars
    notes = db.Column(db.Text)
    
    # Time Tracking (Requirement 6)
    start_date = db.Column(db.DateTime)
    finish_date = db.Column(db.DateTime)
    last_updated = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @property
    def progress_percentage(self):
        """Helper to calculate percentage for Requirement 2"""
        if self.total_pages > 0:
            return round((self.current_page / self.total_pages) * 100, 2)
        return 0