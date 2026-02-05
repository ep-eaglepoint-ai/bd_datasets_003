from . import db
from datetime import datetime

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    yearly_goal = db.Column(db.Integer, default=12)
    
    # this stores custom shelf names defined by the user
    custom_shelves = db.Column(db.JSON, default=list) 
    
    books = db.relationship('UserBook', backref='owner', lazy=True)

class UserBook(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    
    book_id = db.Column(db.String(50), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    author = db.Column(db.String(200))
    cover_image = db.Column(db.String(500))
    
    total_pages = db.Column(db.Integer, nullable=False, default=100)
    current_page = db.Column(db.Integer, default=0)
    
    # this will now hold either currently-reading OR a custom shelf name
    status = db.Column(db.String(50), default='want-to-read')
    
    rating = db.Column(db.Integer) 
    notes = db.Column(db.Text)
    
    start_date = db.Column(db.DateTime)
    finish_date = db.Column(db.DateTime)
    last_updated = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # this tracks every day the user updated their progress
    activity_log = db.relationship('ReadingLog', backref='book', lazy=True)

    @property
    def progress_percentage(self):
        if self.total_pages > 0:
            return round((self.current_page / self.total_pages) * 100, 2)
        return 0

# this model is essential for calculating streaks and average time
class ReadingLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_book_id = db.Column(db.Integer, db.ForeignKey('user_book.id'), nullable=False)
    date = db.Column(db.Date, default=datetime.utcnow().date)
    pages_read = db.Column(db.Integer) # How many pages were read on this specific day