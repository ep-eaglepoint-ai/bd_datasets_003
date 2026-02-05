from datetime import datetime

from database import db
from models import LeaveRequest, User, AuditLog, LeaveStatus, UserRole

class ServiceError(Exception):
    pass

class LeaveService:
    @staticmethod
    def create_request(employee_id: int, start_date: str, end_date: str, leave_type: str, reason: str):
        # Allow any string format that matches YYYY-MM-DD
        try:
            s_date = datetime.strptime(start_date, "%Y-%m-%d").date()
            e_date = datetime.strptime(end_date, "%Y-%m-%d").date()
        except ValueError:
            raise ServiceError("Invalid date format. Use YYYY-MM-DD.")
        
        if e_date < s_date:
            raise ServiceError("End date cannot be before start date.")

        req = LeaveRequest(
            employee_id=employee_id,
            start_date=s_date,
            end_date=e_date,
            leave_type=leave_type,
            reason=reason,
            status=LeaveStatus.PENDING
        )
        db.session.add(req)
        db.session.commit()
        
        # Initial Audit Log
        audit = AuditLog(
            leave_request_id=req.id,
            previous_status=None,
            new_status=LeaveStatus.PENDING,
            acting_user_id=employee_id
        )
        db.session.add(audit)
        db.session.commit()
        return req

    @staticmethod
    def _calculate_days(start, end):
        return (end - start).days + 1

    @staticmethod
    def approve_request(request_id: int, manager_id: int):
        # Transaction start
        try:
            # Lock the request row
            req = db.session.query(LeaveRequest).with_for_update().filter_by(id=request_id).first()
            if not req:
                raise ServiceError("Request not found.")
            
            manager = db.session.query(User).filter_by(id=manager_id).first()
            if not manager or manager.role != UserRole.MANAGER:
                raise ServiceError("Unauthorized. Only managers can approve.")
            
            if req.employee_id == manager_id:
                raise ServiceError("Managers cannot approve their own requests.")

            if req.status != LeaveStatus.PENDING:
                raise ServiceError(f"Cannot approve. Request is {req.status.value}.")

            # Check Balance
            employee = db.session.query(User).with_for_update().filter_by(id=req.employee_id).first()
            days_requested = LeaveService._calculate_days(req.start_date, req.end_date)
            
            if employee.leave_balance < days_requested:
                raise ServiceError("Insufficient leave balance.")

            # Update State
            old_status = req.status
            req.status = LeaveStatus.APPROVED
            employee.leave_balance -= days_requested
            
            # Audit Log
            audit = AuditLog(
                leave_request_id=req.id,
                previous_status=old_status,
                new_status=LeaveStatus.APPROVED,
                acting_user_id=manager_id
            )
            db.session.add(audit)
            
            db.session.commit()
            return req
        except Exception as e:
            db.session.rollback()
            raise e

    @staticmethod
    def reject_request(request_id: int, manager_id: int):
        try:
            # Lock the request row
            req = db.session.query(LeaveRequest).with_for_update().filter_by(id=request_id).first()
            if not req:
                raise ServiceError("Request not found.")

            manager = db.session.query(User).filter_by(id=manager_id).first()
            if not manager or manager.role != UserRole.MANAGER:
                raise ServiceError("Unauthorized. Only managers can reject.")

            if req.employee_id == manager_id:
                raise ServiceError("Managers cannot reject their own requests.")

            if req.status != LeaveStatus.PENDING:
                raise ServiceError(f"Cannot reject. Request is {req.status.value}.")

            # Update State
            old_status = req.status
            req.status = LeaveStatus.REJECTED
            
            # Audit Log
            audit = AuditLog(
                leave_request_id=req.id,
                previous_status=old_status,
                new_status=LeaveStatus.REJECTED,
                acting_user_id=manager_id
            )
            db.session.add(audit)
            
            db.session.commit()
            return req
        except Exception as e:
            db.session.rollback()
            raise e
