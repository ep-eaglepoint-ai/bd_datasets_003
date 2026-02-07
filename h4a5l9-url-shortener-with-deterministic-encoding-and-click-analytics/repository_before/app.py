from flask import Flask, redirect, request, jsonify, abort
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, login_required, current_user
from datetime import datetime

app = Flask(__name__)
app.config['SECRET_KEY'] = 'dev-secret-key'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///urlshortener.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['BASE_URL'] = 'http://localhost:5000'

db = SQLAlchemy(app)
login_manager = LoginManager(app)


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
    short_code = db.Column(db.String(10), unique=True, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)


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
        'short_url': f"{app.config['BASE_URL']}/{link.short_code}"
    } for link in links])


@app.route('/api/links', methods=['POST'])
@login_required
def create_link():
    data = request.get_json()
    if not data or 'url' not in data:
        return jsonify({'error': 'URL is required'}), 400

    link = Link(
        original_url=data['url'],
        short_code=data.get('short_code', 'temp'),
        user_id=current_user.id
    )
    db.session.add(link)
    db.session.commit()

    return jsonify({
        'id': link.id,
        'original_url': link.original_url,
        'short_code': link.short_code,
        'short_url': f"{app.config['BASE_URL']}/{link.short_code}"
    }), 201


@app.route('/api/links/<int:link_id>', methods=['DELETE'])
@login_required
def delete_link(link_id):
    link = Link.query.filter_by(id=link_id, user_id=current_user.id).first()
    if not link:
        return jsonify({'error': 'Link not found'}), 404
    db.session.delete(link)
    db.session.commit()
    return jsonify({'message': 'Link deleted'}), 200


@app.route('/<short_code>')
def redirect_to_url(short_code):
    link = Link.query.filter_by(short_code=short_code).first()
    if not link:
        abort(404)
    return redirect(link.original_url, code=302)


def init_db():
    with app.app_context():
        db.create_all()


if __name__ == '__main__':
    init_db()
    app.run(debug=True)
