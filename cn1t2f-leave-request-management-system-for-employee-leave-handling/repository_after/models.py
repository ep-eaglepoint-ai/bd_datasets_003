from datetime import datetime, timezone
from enum import Enum
from sqlalchemy import Integer, String, Date, ForeignKey, Enum as SQLEnum, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import db

class UserRole(str, Enum):
    EMPLOYEE = "employee"
    MANAGER = "manager"

class LeaveType(str, Enum):
    VACATION = "VACATION"
    SICK = "SICK"
    UNPAID = "UNPAID"

class LeaveStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"

class User(db.Model):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    role: Mapped[UserRole] = mapped_column(SQLEnum(UserRole), nullable=False)
    leave_balance: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

class LeaveRequest(db.Model):
    __tablename__ = "leave_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    start_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    end_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    leave_type: Mapped[LeaveType] = mapped_column(SQLEnum(LeaveType), nullable=False)
    reason: Mapped[str] = mapped_column(String, nullable=True)
    status: Mapped[LeaveStatus] = mapped_column(SQLEnum(LeaveStatus), default=LeaveStatus.PENDING, nullable=False)

    employee: Mapped["User"] = relationship()

class AuditLog(db.Model):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    leave_request_id: Mapped[int] = mapped_column(ForeignKey("leave_requests.id"), nullable=False)
    previous_status: Mapped[LeaveStatus] = mapped_column(SQLEnum(LeaveStatus), nullable=True)
    new_status: Mapped[LeaveStatus] = mapped_column(SQLEnum(LeaveStatus), nullable=False)
    acting_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
