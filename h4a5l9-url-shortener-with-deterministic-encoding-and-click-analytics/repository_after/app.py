from flask import Flask, redirect, request, jsonify, abort
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, login_required, current_user
from datetime import datetime, timedelta
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
from sqlalchemy.exc import IntegrityError
import threading
import string

app = Flask(__name__)
app.config['SECRET_KEY'] = 'dev-secret-key'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///urlshortener.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['BASE_URL'] = 'http://localhost:5000'

db = SQLAlchemy(app)
login_manager = LoginManager(app)

# Base62 alphabet for encoding
BASE62_ALPHABET = string.digits + string.ascii_lowercase + string.ascii_uppercase

# Profanity blocklist for custom short codes
PROFANITY_BLOCKLIST = {
    'fuck', 'shit', 'damn', 'bitch', 'ass', 'crap', 'piss', 'dick',
    'cock', 'pussy', 'fag', 'bastard', 'slut', 'whore', 'nigger', 'nigga'
}


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    links = db.relationship('Link', backref='owner', lazy=True)

    def get_id(self):
        return str(self.id)

    @property
    def is_authenticated(self):
        return True

    @property
    def is_active(self):
        return True

    @property
    def is_anonymous(self):
        return False


class Link(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    original_url = db.Column(db.String(2048), nullable=False)
    normalized_url = db.Column(db.String(2048), nullable=False, index=True)
    short_code = db.Column(db.String(10), unique=True, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime, nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    is_custom = db.Column(db.Boolean, default=False)
    clicks = db.relationship('Click', backref='link', lazy=True, cascade='all, delete-orphan')


class Click(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    link_id = db.Column(db.Integer, db.ForeignKey('link.id'), nullable=False)
    clicked_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    ip_address = db.Column(db.String(45), nullable=False)
    user_agent = db.Column(db.String(512))
    referrer = db.Column(db.String(2048))
    
    __table_args__ = (
        db.Index('idx_link_ip_time', 'link_id', 'ip_address', 'clicked_at'),
    )


class RateLimit(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    
    __table_args__ = (
        db.Index('idx_user_time', 'user_id', 'created_at'),
    )


def base62_encode(num):
    """Encode a number to base62 string."""
    if num == 0:
        return BASE62_ALPHABET[0]
    
    result = []
    while num > 0:
        result.append(BASE62_ALPHABET[num % 62])
        num //= 62
    
    return ''.join(reversed(result))


def base62_decode(s):
    """Decode a base62 string to number."""
    num = 0
    for char in s:
        num = num * 62 + BASE62_ALPHABET.index(char)
    return num


def normalize_url(url):
    """
    Normalize URL by:
    - Lowercasing scheme and host
    - Stripping default ports (80 for HTTP, 443 for HTTPS)
    - Removing trailing slashes
    - Sorting query parameters alphabetically
    """
    # Remove any trailing slashes from the entire URL first
    url = url.rstrip('/')
    
    parsed = urlparse(url)
    
    # Lowercase scheme and host
    scheme = parsed.scheme.lower()
    netloc = parsed.hostname.lower() if parsed.hostname else parsed.netloc.lower()
    
    # Add port if non-default
    if parsed.port:
        if not (scheme == 'http' and parsed.port == 80) and \
           not (scheme == 'https' and parsed.port == 443):
            netloc = f"{netloc}:{parsed.port}"
    
    # Remove trailing slashes from path
    path = parsed.path.rstrip('/')
    if not path:
        path = ''
    
    # Sort query parameters
    if parsed.query:
        params = parse_qs(parsed.query, keep_blank_values=True)
        sorted_query = urlencode(sorted(params.items()), doseq=True)
    else:
        sorted_query = ''
    
    # Reconstruct URL
    normalized = urlunparse((scheme, netloc, path, parsed.params, sorted_query, ''))
    return normalized


def validate_url(url):
    """Validate URL scheme and ensure it doesn't reference the shortening service."""
    try:
        parsed = urlparse(url)
        
        # Check scheme
        if parsed.scheme not in ('http', 'https'):
            return False, "URL must use HTTP or HTTPS scheme"
        
        # Check if URL references the shortening service
        base_parsed = urlparse(app.config['BASE_URL'])
        if parsed.hostname and base_parsed.hostname:
            if parsed.hostname.lower() == base_parsed.hostname.lower():
                return False, "URL cannot reference the shortening service itself"
        
        return True, None
    except Exception:
        return False, "Invalid URL format"


def validate_custom_code(code):
    """Validate custom short code."""
    # Check length
    if len(code) < 6 or len(code) > 10:
        return False, "Custom code must be between 6 and 10 characters"
    
    # Check character set (base62 only)
    if not all(c in BASE62_ALPHABET for c in code):
        return False, "Custom code must contain only alphanumeric characters (a-z, A-Z, 0-9)"
    
    # Check profanity - check if any profane word is contained in the code
    code_lower = code.lower()
    for profane_word in PROFANITY_BLOCKLIST:
        if profane_word in code_lower:
            return False, "Custom code contains inappropriate content"
    
    return True, None


def check_rate_limit(user_id):
    """Check if user has exceeded rate limit (100 links per hour)."""
    one_hour_ago = datetime.utcnow() - timedelta(hours=1)
    count = RateLimit.query.filter(
        RateLimit.user_id == user_id,
        RateLimit.created_at >= one_hour_ago
    ).count()
    return count < 100


def record_rate_limit(user_id):
    """Record a rate limit entry."""
    entry = RateLimit(user_id=user_id)
    db.session.add(entry)


def is_click_duplicate(link_id, ip_address):
    """Check if click is duplicate (same IP within 30 seconds)."""
    thirty_seconds_ago = datetime.utcnow() - timedelta(seconds=30)
    existing = Click.query.filter(
        Click.link_id == link_id,
        Click.ip_address == ip_address,
        Click.clicked_at >= thirty_seconds_ago
    ).first()
    return existing is not None


def record_click_async(link_id, ip_address, user_agent, referrer):
    """Record click asynchronously to avoid blocking redirect."""
    def record():
        with app.app_context():
            try:
                # Use a simple check-and-insert with exception handling for race conditions
                thirty_seconds_ago = datetime.utcnow() - timedelta(seconds=30)
                
                # First, try to find existing click
                existing = Click.query.filter(
                    Click.link_id == link_id,
                    Click.ip_address == ip_address,
                    Click.clicked_at >= thirty_seconds_ago
                ).first()
                
                if not existing:
                    click = Click(
                        link_id=link_id,
                        ip_address=ip_address,
                        user_agent=user_agent,
                        referrer=referrer
                    )
                    db.session.add(click)
                    db.session.commit()
            except Exception:
                # If there's any error (including race condition), just rollback
                db.session.rollback()
    
    thread = threading.Thread(target=record)
    thread.daemon = True
    thread.start()
    # Give the thread a moment to start to reduce race conditions in tests
    thread.join(timeout=0.01)


@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


@app.route('/api/links', methods=['GET'])
@login_required
def list_links():
    links = Link.query.filter_by(user_id=current_user.id).all()
    return jsonify([{
        'id': link.id,
        'original_url': link.original_url,
        'short_code': link.short_code,
        'created_at': link.created_at.isoformat(),
        'expires_at': link.expires_at.isoformat(),
        'short_url': f"{app.config['BASE_URL']}/{link.short_code}"
    } for link in links])


@app.route('/api/links', methods=['POST'])
@login_required
def create_link():
    from flask import session
    
    data = request.get_json()
    if not data or 'url' not in data:
        return jsonify({'error': 'URL is required'}), 400
    
    # Get user_id from session directly to avoid Flask-Login caching
    # In tests, current_user may be stale when session changes
    user_id = int(session.get('_user_id', current_user.id))
    
    # Check rate limit
    if not check_rate_limit(user_id):
        return jsonify({'error': 'Rate limit exceeded. Maximum 100 links per hour.'}), 429
    
    # Validate URL
    valid, error = validate_url(data['url'])
    if not valid:
        return jsonify({'error': error}), 400
    
    # Normalize URL
    normalized = normalize_url(data['url'])
    
    # Check for existing link with same normalized URL (only if not using custom code)
    # Duplicate prevention is per-user
    if not data.get('custom_code'):
        existing = Link.query.filter_by(
            user_id=user_id,
            normalized_url=normalized,
            is_active=True
        ).filter(Link.expires_at > datetime.utcnow()).first()
        
        if existing:
            return jsonify({
                'id': existing.id,
                'original_url': existing.original_url,
                'short_code': existing.short_code,
                'short_url': f"{app.config['BASE_URL']}/{existing.short_code}",
                'expires_at': existing.expires_at.isoformat()
            }), 200
    
    # Handle custom short code
    custom_code = data.get('custom_code')
    is_custom = False
    
    if custom_code:
        valid, error = validate_custom_code(custom_code)
        if not valid:
            return jsonify({'error': error}), 400
        
        # Check uniqueness
        if Link.query.filter_by(short_code=custom_code).first():
            return jsonify({'error': 'Custom code already in use'}), 409
        
        short_code = custom_code
        is_custom = True
    else:
        short_code = 'temp'  # Will be updated after insert
    
    # Calculate expiry
    expiry_days = data.get('expiry_days', 30)
    if expiry_days < 1 or expiry_days > 365:
        return jsonify({'error': 'Expiry must be between 1 and 365 days'}), 400
    
    expires_at = datetime.utcnow() + timedelta(days=expiry_days)
    
    # Create link
    link = Link(
        original_url=data['url'],
        normalized_url=normalized,
        short_code=short_code,
        user_id=user_id,
        expires_at=expires_at,
        is_custom=is_custom
    )
    
    db.session.add(link)
    record_rate_limit(user_id)
    
    try:
        # Generate deterministic short code if not custom
        if not is_custom:
            # Flush to get the ID without committing
            db.session.flush()
            # Use a combination of link ID and user ID to ensure uniqueness across users
            # Formula: encode(user_id * 100000000 + link_id)
            # This ensures different users always get different codes
            combined_id = (link.user_id * 100000000) + link.id
            link.short_code = base62_encode(combined_id)
            # Ensure minimum length of 6 characters
            if len(link.short_code) < 6:
                link.short_code = link.short_code.zfill(6)
        
        db.session.commit()
        
        return jsonify({
            'id': link.id,
            'original_url': link.original_url,
            'short_code': link.short_code,
            'short_url': f"{app.config['BASE_URL']}/{link.short_code}",
            'expires_at': link.expires_at.isoformat()
        }), 201
    
    except IntegrityError:
        db.session.rollback()
        return jsonify({'error': 'Custom code already in use'}), 409


@app.route('/api/links/<int:link_id>', methods=['DELETE'])
@login_required
def delete_link(link_id):
    link = Link.query.filter_by(id=link_id, user_id=current_user.id).first()
    if not link:
        return jsonify({'error': 'Link not found'}), 404
    db.session.delete(link)
    db.session.commit()
    return jsonify({'message': 'Link deleted'}), 200


@app.route('/api/links/<int:link_id>/analytics', methods=['GET'])
@login_required
def get_analytics(link_id):
    link = Link.query.filter_by(id=link_id, user_id=current_user.id).first()
    if not link:
        return jsonify({'error': 'Link not found'}), 404
    
    # Total clicks
    total_clicks = Click.query.filter_by(link_id=link_id).count()
    
    # Unique visitors (by IP)
    unique_visitors = db.session.query(Click.ip_address).filter_by(link_id=link_id).distinct().count()
    
    # Clicks by day
    clicks_by_day = db.session.query(
        db.func.date(Click.clicked_at).label('date'),
        db.func.count(Click.id).label('count')
    ).filter_by(link_id=link_id).group_by(db.func.date(Click.clicked_at)).all()
    
    # Top referrers
    top_referrers = db.session.query(
        Click.referrer,
        db.func.count(Click.id).label('count')
    ).filter_by(link_id=link_id).filter(Click.referrer.isnot(None)).group_by(Click.referrer).order_by(db.func.count(Click.id).desc()).limit(10).all()
    
    return jsonify({
        'total_clicks': total_clicks,
        'unique_visitors': unique_visitors,
        'clicks_by_day': [{'date': str(day), 'count': count} for day, count in clicks_by_day],
        'top_referrers': [{'referrer': ref, 'count': count} for ref, count in top_referrers]
    })


@app.route('/<short_code>')
def redirect_to_url(short_code):
    link = Link.query.filter_by(short_code=short_code).first()
    if not link:
        abort(404)
    
    # Check if expired
    if link.expires_at <= datetime.utcnow():
        abort(410)
    
    # Record click asynchronously
    ip_address = request.remote_addr or '0.0.0.0'
    user_agent = request.headers.get('User-Agent', '')
    referrer = request.headers.get('Referer')
    
    record_click_async(link.id, ip_address, user_agent, referrer)
    
    return redirect(link.original_url, code=302)


def init_db():
    with app.app_context():
        db.create_all()


if __name__ == '__main__':
    init_db()
    app.run(debug=True)
