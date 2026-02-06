from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
import os

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///tasks.db')
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET', 'dev-secret-key')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=1)

db = SQLAlchemy(app)
jwt = JWTManager(app)


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    tasks = db.relationship('Task', backref='owner', lazy=True, foreign_keys='Task.owner_id')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)


class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(20), default='todo')
    priority = db.Column(db.String(20), default='medium')
    due_date = db.Column(db.DateTime, nullable=True)
    owner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    assignee_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    VALID_STATUSES = ['todo', 'in_progress', 'done']
    VALID_PRIORITIES = ['low', 'medium', 'high']
    VALID_TRANSITIONS = {
        'todo': ['in_progress'],
        'in_progress': ['done', 'todo'],
        'done': []
    }


@app.route('/auth/register', methods=['POST'])
def register():
    data = request.get_json()
    if not data or not data.get('username') or not data.get('email') or not data.get('password'):
        return jsonify({'error': 'Missing required fields'}), 400

    if User.query.filter_by(username=data['username']).first():
        return jsonify({'error': 'Username already exists'}), 409

    if User.query.filter_by(email=data['email']).first():
        return jsonify({'error': 'Email already exists'}), 409

    if len(data['password']) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400

    user = User(username=data['username'], email=data['email'])
    user.set_password(data['password'])
    db.session.add(user)
    db.session.commit()

    return jsonify({'id': user.id, 'username': user.username, 'email': user.email}), 201


@app.route('/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'error': 'Missing credentials'}), 400

    user = User.query.filter_by(username=data['username']).first()
    if not user or not user.check_password(data['password']):
        return jsonify({'error': 'Invalid credentials'}), 401

    token = create_access_token(identity=user.id)
    return jsonify({'access_token': token, 'user_id': user.id}), 200


@app.route('/tasks', methods=['GET'])
@jwt_required()
def list_tasks():
    user_id = get_jwt_identity()
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)
    status_filter = request.args.get('status')
    priority_filter = request.args.get('priority')
    search = request.args.get('search')

    query = Task.query.filter_by(owner_id=user_id)

    if status_filter:
        query = query.filter_by(status=status_filter)
    if priority_filter:
        query = query.filter_by(priority=priority_filter)
    if search:
        query = query.filter(Task.title.ilike(f'%{search}%'))

    pagination = query.order_by(Task.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )

    tasks = [{
        'id': t.id, 'title': t.title, 'description': t.description,
        'status': t.status, 'priority': t.priority,
        'due_date': t.due_date.isoformat() if t.due_date else None,
        'owner_id': t.owner_id, 'assignee_id': t.assignee_id,
        'created_at': t.created_at.isoformat(),
        'updated_at': t.updated_at.isoformat()
    } for t in pagination.items]

    return jsonify({
        'tasks': tasks,
        'total': pagination.total,
        'page': pagination.page,
        'pages': pagination.pages,
        'per_page': pagination.per_page
    }), 200


@app.route('/tasks', methods=['POST'])
@jwt_required()
def create_task():
    user_id = get_jwt_identity()
    data = request.get_json()

    if not data or not data.get('title'):
        return jsonify({'error': 'Title is required'}), 400

    if data.get('status') and data['status'] not in Task.VALID_STATUSES:
        return jsonify({'error': f'Invalid status. Must be one of: {Task.VALID_STATUSES}'}), 400

    if data.get('priority') and data['priority'] not in Task.VALID_PRIORITIES:
        return jsonify({'error': f'Invalid priority. Must be one of: {Task.VALID_PRIORITIES}'}), 400

    due_date = None
    if data.get('due_date'):
        try:
            due_date = datetime.fromisoformat(data['due_date'])
            if due_date < datetime.utcnow():
                return jsonify({'error': 'Due date cannot be in the past'}), 400
        except ValueError:
            return jsonify({'error': 'Invalid date format'}), 400

    task = Task(
        title=data['title'],
        description=data.get('description'),
        status=data.get('status', 'todo'),
        priority=data.get('priority', 'medium'),
        due_date=due_date,
        owner_id=user_id
    )
    db.session.add(task)
    db.session.commit()

    return jsonify({
        'id': task.id, 'title': task.title, 'description': task.description,
        'status': task.status, 'priority': task.priority,
        'due_date': task.due_date.isoformat() if task.due_date else None,
        'owner_id': task.owner_id, 'assignee_id': task.assignee_id,
        'created_at': task.created_at.isoformat(),
        'updated_at': task.updated_at.isoformat()
    }), 201


@app.route('/tasks/<int:task_id>', methods=['GET'])
@jwt_required()
def get_task(task_id):
    user_id = get_jwt_identity()
    task = Task.query.get(task_id)
    if not task:
        return jsonify({'error': 'Task not found'}), 404
    if task.owner_id != user_id:
        return jsonify({'error': 'Forbidden'}), 403
    return jsonify({
        'id': task.id, 'title': task.title, 'description': task.description,
        'status': task.status, 'priority': task.priority,
        'due_date': task.due_date.isoformat() if task.due_date else None,
        'owner_id': task.owner_id, 'assignee_id': task.assignee_id,
        'created_at': task.created_at.isoformat(),
        'updated_at': task.updated_at.isoformat()
    }), 200


@app.route('/tasks/<int:task_id>', methods=['PUT'])
@jwt_required()
def update_task(task_id):
    user_id = get_jwt_identity()
    task = Task.query.get(task_id)
    if not task:
        return jsonify({'error': 'Task not found'}), 404
    if task.owner_id != user_id:
        return jsonify({'error': 'Forbidden'}), 403

    data = request.get_json()
    if data.get('title'):
        task.title = data['title']
    if data.get('description') is not None:
        task.description = data['description']
    if data.get('priority'):
        if data['priority'] not in Task.VALID_PRIORITIES:
            return jsonify({'error': f'Invalid priority. Must be one of: {Task.VALID_PRIORITIES}'}), 400
        task.priority = data['priority']
    if data.get('due_date'):
        try:
            due_date = datetime.fromisoformat(data['due_date'])
            if due_date < datetime.utcnow():
                return jsonify({'error': 'Due date cannot be in the past'}), 400
            task.due_date = due_date
        except ValueError:
            return jsonify({'error': 'Invalid date format'}), 400
    if data.get('status'):
        if data['status'] not in Task.VALID_STATUSES:
            return jsonify({'error': f'Invalid status. Must be one of: {Task.VALID_STATUSES}'}), 400
        if data['status'] not in Task.VALID_TRANSITIONS.get(task.status, []):
            return jsonify({'error': f'Cannot transition from {task.status} to {data["status"]}'}), 400
        task.status = data['status']
    if 'assignee_id' in data:
        if data['assignee_id'] is not None:
            assignee = User.query.get(data['assignee_id'])
            if not assignee:
                return jsonify({'error': 'Assignee not found'}), 404
        task.assignee_id = data['assignee_id']

    db.session.commit()

    return jsonify({
        'id': task.id, 'title': task.title, 'description': task.description,
        'status': task.status, 'priority': task.priority,
        'due_date': task.due_date.isoformat() if task.due_date else None,
        'owner_id': task.owner_id, 'assignee_id': task.assignee_id,
        'created_at': task.created_at.isoformat(),
        'updated_at': task.updated_at.isoformat()
    }), 200


@app.route('/tasks/<int:task_id>', methods=['DELETE'])
@jwt_required()
def delete_task(task_id):
    user_id = get_jwt_identity()
    task = Task.query.get(task_id)
    if not task:
        return jsonify({'error': 'Task not found'}), 404
    if task.owner_id != user_id:
        return jsonify({'error': 'Forbidden'}), 403
    db.session.delete(task)
    db.session.commit()
    return '', 204


@app.route('/tasks/<int:task_id>/assign', methods=['POST'])
@jwt_required()
def assign_task(task_id):
    user_id = get_jwt_identity()
    task = Task.query.get(task_id)
    if not task:
        return jsonify({'error': 'Task not found'}), 404
    if task.owner_id != user_id:
        return jsonify({'error': 'Forbidden'}), 403
    data = request.get_json()
    assignee_id = data.get('assignee_id')
    if assignee_id is not None:
        assignee = User.query.get(assignee_id)
        if not assignee:
            return jsonify({'error': 'Assignee not found'}), 404
    task.assignee_id = assignee_id
    db.session.commit()
    return jsonify({
        'id': task.id, 'title': task.title, 'assignee_id': task.assignee_id
    }), 200


with app.app_context():
    db.create_all()

if __name__ == '__main__':
    app.run(debug=True)
