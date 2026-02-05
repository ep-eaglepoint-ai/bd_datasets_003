import pytest
import pytest

# Try to import from the path set by evaluation.py or default to repository_after for local dev
from app import create_app, db
from models import User, LeaveRequest, AuditLog, UserRole, LeaveStatus, LeaveType
from services import LeaveService, ServiceError

@pytest.fixture
def app():
    # Use in-memory SQLite for speed/isolation in unit tests unless strictly requiring PG
    # But since we use FOR UPDATE, we really should use the Postgres DB if available.
    # For CI/Docker, DATABASE_URL will be set.
    test_app = create_app()
    if 'sqlite' in test_app.config['SQLALCHEMY_DATABASE_URI']:
        # If falling back to SQLite, beware of locking limitations
        pass
        
    with test_app.app_context():
        db.create_all()
        yield test_app
        db.session.remove()
        db.drop_all()

@pytest.fixture
def client(app):
    return app.test_client()

def test_create_request(app):
    with app.app_context():
        u = User(username="test_emp", role=UserRole.EMPLOYEE, leave_balance=10)
        db.session.add(u)
        db.session.commit()
        
        req = LeaveService.create_request(u.id, "2024-01-01", "2024-01-05", LeaveType.VACATION, "Fun")
        assert req.status == LeaveStatus.PENDING
        assert req.employee_id == u.id

def test_approval_flow(app):
    with app.app_context():
        emp = User(username="emp", role=UserRole.EMPLOYEE, leave_balance=10)
        mgr = User(username="mgr", role=UserRole.MANAGER)
        db.session.add_all([emp, mgr])
        db.session.commit()

        req = LeaveService.create_request(emp.id, "2024-01-01", "2024-01-02", LeaveType.VACATION, "Rest") # 2 days
        
        updated_req = LeaveService.approve_request(req.id, mgr.id)
        
        assert updated_req.status == LeaveStatus.APPROVED
        
        # Check balance
        fresh_emp = db.session.get(User, emp.id)
        assert fresh_emp.leave_balance == 8  # 10 - 2

        # Check Audit
        audit = AuditLog.query.filter_by(leave_request_id=req.id).order_by(AuditLog.id.desc()).first()
        assert audit.new_status == LeaveStatus.APPROVED
        assert audit.acting_user_id == mgr.id

def test_rejection_flow(app):
    with app.app_context():
        emp = User(username="emp2", role=UserRole.EMPLOYEE, leave_balance=10)
        mgr = User(username="mgr2", role=UserRole.MANAGER)
        db.session.add_all([emp, mgr])
        db.session.commit()

        req = LeaveService.create_request(emp.id, "2024-01-01", "2024-01-01", LeaveType.SICK, "Cough")
        
        LeaveService.reject_request(req.id, mgr.id)
        
        fresh_emp = db.session.get(User, emp.id)
        assert fresh_emp.leave_balance == 10 # No change

def test_insufficient_balance(app):
    with app.app_context():
        emp = User(username="poor_emp", role=UserRole.EMPLOYEE, leave_balance=1)
        mgr = User(username="mgr3", role=UserRole.MANAGER)
        db.session.add_all([emp, mgr])
        db.session.commit()

        req = LeaveService.create_request(emp.id, "2024-01-01", "2024-01-05", LeaveType.VACATION, "Long one") # 5 days
        
        with pytest.raises(ServiceError, match="Insufficient leave balance"):
            LeaveService.approve_request(req.id, mgr.id)

def test_self_approval_prevention(app):
    with app.app_context():
        mgr_emp = User(username="bossy", role=UserRole.MANAGER, leave_balance=10)
        db.session.add(mgr_emp)
        db.session.commit()

        req = LeaveService.create_request(mgr_emp.id, "2024-01-01", "2024-01-01", LeaveType.VACATION, ".")
        
        with pytest.raises(ServiceError, match="Managers cannot approve their own requests"):
            LeaveService.approve_request(req.id, mgr_emp.id)

def test_double_action_prevention(app):
    with app.app_context():
        emp = User(username="emp3", role=UserRole.EMPLOYEE, leave_balance=10)
        mgr = User(username="mgr4", role=UserRole.MANAGER)
        db.session.add_all([emp, mgr])
        db.session.commit()

        req = LeaveService.create_request(emp.id, "2024-01-01", "2024-01-01", LeaveType.VACATION, ".")
        
        LeaveService.approve_request(req.id, mgr.id)
        
        with pytest.raises(ServiceError, match="Cannot reject. Request is APPROVED"):
            LeaveService.reject_request(req.id, mgr.id)
