import os
import logging
from flask import Flask, jsonify, request, send_from_directory
from database import db
from models import User, LeaveRequest, UserRole
from services import LeaveService, ServiceError

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def create_app():
    app = Flask(__name__, static_folder='static')
    
    # Configuration
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///local.db')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    db.init_app(app)

    @app.route('/')
    def index():
        return send_from_directory(app.static_folder, 'index.html')

    @app.route('/health')
    def health():
        return jsonify({"status": "ok"}), 200

    @app.route('/api/users', methods=['GET'])
    def list_users():
        users = User.query.all()
        return jsonify([{
            "id": u.id, 
            "username": u.username, 
            "role": u.role.value, 
            "balance": u.leave_balance
        } for u in users])

    @app.route('/api/requests', methods=['POST'])
    def create_request():
        data = request.json
        try:
            req = LeaveService.create_request(
                employee_id=data['employee_id'],
                start_date=data['start_date'],
                end_date=data['end_date'],
                leave_type=data['leave_type'],
                reason=data.get('reason', '')
            )
            return jsonify({"status": "created", "id": req.id}), 201
        except ServiceError as e:
            return jsonify({"error": str(e)}), 400
        except Exception as e:
            logger.error(f"Error creating request: {e}")
            return jsonify({"error": "Internal Server Error"}), 500

    @app.route('/api/requests', methods=['GET'])
    def get_requests():
        user_id = request.args.get('user_id', type=int)
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({"error": "User not found"}), 404

        query = LeaveRequest.query
        if user.role == UserRole.EMPLOYEE:
            query = query.filter_by(employee_id=user.id)
        
        # Managers see all
        requests = query.all()
        return jsonify([{
            "id": r.id,
            "employee_id": r.employee_id,
            "employee_name": r.employee.username,
            "start_date": r.start_date.isoformat(),
            "end_date": r.end_date.isoformat(),
            "type": r.leave_type.value,
            "reason": r.reason,
            "status": r.status.value
        } for r in requests])

    @app.route('/api/requests/<int:req_id>/approve', methods=['POST'])
    def approve_request(req_id):
        data = request.json
        manager_id = data.get('manager_id')
        try:
            LeaveService.approve_request(req_id, manager_id)
            return jsonify({"status": "approved"}), 200
        except ServiceError as e:
            return jsonify({"error": str(e)}), 400
        except Exception as e:
            logger.error(f"Error approving: {e}")
            return jsonify({"error": "Internal Error"}), 500

    @app.route('/api/requests/<int:req_id>/reject', methods=['POST'])
    def reject_request(req_id):
        data = request.json
        manager_id = data.get('manager_id')
        try:
            LeaveService.reject_request(req_id, manager_id)
            return jsonify({"status": "rejected"}), 200
        except ServiceError as e:
            return jsonify({"error": str(e)}), 400
        except Exception as e:
            logger.error(f"Error rejection: {e}")
            return jsonify({"error": "Internal Error"}), 500

    @app.route('/api/reset', methods=['POST'])
    def reset_db():
        """Helper for testing to reset DB state"""
        db.drop_all()
        db.create_all()
        # Seed
        emp = User(username="alice", role=UserRole.EMPLOYEE, leave_balance=20)
        mgr = User(username="bob", role=UserRole.MANAGER, leave_balance=30) # Manager also has balance, technically
        mgr2 = User(username="charlie", role=UserRole.MANAGER, leave_balance=30)
        db.session.add_all([emp, mgr, mgr2])
        db.session.commit()
        return jsonify({"status": "reset complete"}), 200

    return app

if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        # Auto-create tables if they don't exist (for local dev convenience)
        # In production/docker-compose, we might want to do this more explicitly
        db.create_all()
        if not User.query.first():
            emp = User(username="alice", role=UserRole.EMPLOYEE, leave_balance=20)
            mgr = User(username="bob", role=UserRole.MANAGER, leave_balance=30)
            db.session.add_all([emp, mgr])
            db.session.commit()
            print("Database seeded!")
            
    app.run(host='0.0.0.0', port=5000)
