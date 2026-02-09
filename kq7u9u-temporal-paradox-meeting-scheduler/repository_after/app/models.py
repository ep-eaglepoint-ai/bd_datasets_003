from datetime import datetime
from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field, field_validator, field_serializer, ConfigDict
from enum import Enum


class Participant(BaseModel):
    """Represents a meeting participant"""

    id: str
    name: str
    email: str

    model_config = ConfigDict(from_attributes=True)


class TemporalOperator(str, Enum):
    """Temporal operators for rule parsing"""

    AFTER = "after"
    BEFORE = "before"
    BETWEEN = "between"
    AT = "at"
    ON = "on"
    WITHIN = "within"
    UNLESS = "unless"
    PROVIDED = "provided"
    ONLY_IF = "only if"
    EARLIER_OF = "earlier_of"
    LATER_OF = "later_of"


class TimeReference(str, Enum):
    """References to historical events"""

    LAST_CANCELLATION = "last_cancellation"
    LAST_DEPLOYMENT = "last_deployment"
    CRITICAL_INCIDENT = "critical_incident"
    RECURRING_LUNCH = "recurring_lunch"
    PREVIOUS_DAY_WORKLOAD = "previous_day_workload"


class TemporalExpression(BaseModel):
    """Base class for temporal expressions"""

    operator: TemporalOperator
    value: Optional[Union[str, int, float, List["TemporalExpression"]]] = None
    reference: Optional[Union[TimeReference, str]] = None  # Can be TimeReference or string like "TWO_MOST_RECENT_CANCELLATIONS"
    conditions: List["TemporalExpression"] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class ScheduleRequest(BaseModel):
    """Request model for scheduling a meeting"""

    duration_minutes: int = Field(..., ge=1, le=480, description="Meeting duration in minutes")
    participants: List[Participant]
    temporal_rule: str = Field(..., description="Complex temporal rule string")
    requested_at: datetime = Field(default_factory=datetime.now)

    @field_validator("participants")
    @classmethod
    def validate_participants(cls, v):
        if len(v) < 1:
            raise ValueError("At least one participant required")
        return v


class ScheduleResponse(BaseModel):
    """Response model for successful scheduling"""

    start_time: datetime
    end_time: datetime
    duration_minutes: int
    participants: List[Participant]
    rule_evaluation_steps: List[Dict[str, Any]] = Field(default_factory=list)


class ErrorResponse(BaseModel):
    """Error response model"""

    error: str
    details: Optional[str] = None
    paradox_detected: bool = False
    constraint_violations: List[str] = Field(default_factory=list)
    temporal_conflicts: List[Dict[str, Any]] = Field(default_factory=list)


class HistoricalEvent(BaseModel):
    """Model for historical events in the event log"""

    event_type: TimeReference
    timestamp: datetime
    metadata: Dict[str, Any] = Field(default_factory=dict)
    calculated_value: Optional[Any] = None

    @field_serializer("timestamp")
    def serialize_timestamp(self, value: datetime):
        return value.isoformat()


# Update forward references for recursive models
TemporalExpression.model_rebuild()