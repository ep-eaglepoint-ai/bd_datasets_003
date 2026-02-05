import pytest
import threading
import threading


from app import create_app, db
from models import User, LeaveRequest, UserRole, LeaveType, LeaveStatus

@pytest.fixture
def app():
    test_app = create_app()
    with test_app.app_context():
        db.create_all()
        yield test_app
        db.session.remove()
        db.drop_all()

def test_concurrent_approvals(app):
    with app.app_context():
        # Setup
        emp = User(username="racer", role=UserRole.EMPLOYEE, leave_balance=10)
        mgr1 = User(username="mgr_A", role=UserRole.MANAGER)
        mgr2 = User(username="mgr_B", role=UserRole.MANAGER)
        db.session.add_all([emp, mgr1, mgr2])
        db.session.commit()
        
        # Create request for 5 days
        from services import LeaveService, ServiceError
        req = LeaveService.create_request(emp.id, "2024-01-01", "2024-01-05", LeaveType.VACATION, "Race")
        req_id = req.id
        emp_id = emp.id
        mgr1_id = mgr1.id
        mgr2_id = mgr2.id

    # Define the worker function
    # We must create a NEW app context and NEW session for each thread to simulate real world
    errors = []
    successes = []

    def verify_approval(manager_id):
        try:
            # Create a new app context/session
            with app.app_context():
                LeaveService.approve_request(req_id, manager_id)
                successes.append(manager_id)
        except Exception as e:
            errors.append(str(e))

    # Run concurrently
    threads = [
        threading.Thread(target=verify_approval, args=(mgr1_id,)),
        threading.Thread(target=verify_approval, args=(mgr2_id,))
    ]
    
    for t in threads: t.start()
    for t in threads: t.join()

    # Assessments
    # ONLY ONE should succeed
    with app.app_context():
        final_req = db.session.get(LeaveRequest, req_id)
        final_emp = db.session.get(User, emp_id)
        
        print(f"Successes: {len(successes)}, Errors: {len(errors)}")
        print(f"Final Status: {final_req.status}")
        print(f"Final Balance: {final_emp.leave_balance}")

        assert len(successes) == 1
        assert len(errors) == 1
        assert final_req.status == LeaveStatus.APPROVED
        assert final_emp.leave_balance == 5 # 10 - 5
