from datetime import datetime, timedelta, time
from typing import Optional, List, Dict, Any, Tuple
import asyncio

from .models import ScheduleRequest, ScheduleResponse, ErrorResponse, TemporalOperator, TemporalExpression, TimeReference
from .parser import TemporalParser, RuleValidator
from .temporal_logic import TemporalEvaluator
from .paradox_detector import TemporalParadoxDetector
from .event_log import EventLog


class MockExternalAPIs:
    """Mock external APIs for testing and development"""
    
    @staticmethod
    async def get_previous_day_workload() -> float:
        """Mock method for WorkloadAPI.get_previous_day_workload()"""
        # Simulate some delay
        await asyncio.sleep(0.01)
        # Return mock workload (0-100%)
        return 75.0  # 75% workload
    
    @staticmethod
    async def get_last_incident_time() -> Optional[datetime]:
        """Mock method for IncidentAPI.get_last_incident_time()"""
        await asyncio.sleep(0.01)
        # Return mock incident time (18 hours ago)
        return datetime.now() - timedelta(hours=18)


class TemporalScheduler:
    """Main scheduler coordinating all components"""
    
    def __init__(self, event_log: EventLog = None):
        self.event_log = event_log or EventLog()
        self.parser = TemporalParser()
        self.evaluator = TemporalEvaluator(self.event_log)
        self.paradox_detector = TemporalParadoxDetector(self.event_log)
        self.external_apis = MockExternalAPIs()
        
    async def schedule_meeting(self, request: ScheduleRequest) -> Tuple[Optional[ScheduleResponse], Optional[ErrorResponse]]:
        """Main scheduling method"""
        try:
            # Basic validation (API and tests expect 400-style errors)
            if request.duration_minutes <= 0:
                return None, ErrorResponse(
                    error="Invalid duration",
                    details="Duration must be positive",
                    paradox_detected=False,
                    constraint_violations=["Duration must be positive"]
                )

            if not request.participants:
                return None, ErrorResponse(
                    error="Invalid participants",
                    details="At least one participant is required",
                    paradox_detected=False,
                    constraint_violations=["At least one participant is required"]
                )

            # Parse the temporal rule
            temporal_expr = self.parser.parse(request.temporal_rule)
            
            # Validate for circular references
            if not RuleValidator.validate_no_circular_references(temporal_expr):
                return None, ErrorResponse(
                    error="Circular dependency detected",
                    details="The temporal rule contains circular references",
                    paradox_detected=True,
                    constraint_violations=["Circular dependency in temporal logic"]
                )
            
            # Detect paradoxes
            paradoxes = self.paradox_detector.detect_paradoxes(
                temporal_expr, 
                request.requested_at
            )
            
            if paradoxes:
                return None, ErrorResponse(
                    error="Temporal paradox detected",
                    details=f"Found {len(paradoxes)} paradox(es)",
                    paradox_detected=True,
                    constraint_violations=[p["description"] for p in paradoxes],
                    temporal_conflicts=paradoxes
                )
            
            # Evaluate the temporal expression
            base_time = request.requested_at
            meeting_time = self.evaluator.evaluate(temporal_expr, base_time)
            
            # Calculate end time
            end_time = meeting_time + timedelta(minutes=request.duration_minutes)
            
            # Check constraints
            constraints = [
                {"type": "business_hours"},  # 9 AM - 5 PM
                {"type": "no_overlap"}  # No overlapping events
            ]
            
            violations = self.paradox_detector.validate_schedule_window(
                meeting_time, end_time, constraints
            )
            
            if violations:
                # If only business-hours violation and rule wasn't an explicit time-of-day, try next slot
                if self._is_business_hours_only(violations) and not self._is_explicit_time_rule(temporal_expr):
                    adjusted_time = self._find_next_business_slot(base_time, request.duration_minutes, constraints)
                    if adjusted_time:
                        meeting_time = adjusted_time
                        end_time = meeting_time + timedelta(minutes=request.duration_minutes)
                        violations = self.paradox_detector.validate_schedule_window(
                            meeting_time, end_time, constraints
                        )

                if violations:
                    return None, ErrorResponse(
                        error="Constraint violation",
                        details="Meeting time violates one or more constraints",
                        paradox_detected=False,
                        constraint_violations=violations
                    )
            
            # Check conditional constraints
            if await self._check_conditional_constraints(temporal_expr, meeting_time):
                # Create successful response
                response = ScheduleResponse(
                    start_time=meeting_time,
                    end_time=end_time,
                    duration_minutes=request.duration_minutes,
                    participants=request.participants,
                    rule_evaluation_steps=self._get_evaluation_steps(temporal_expr, meeting_time)
                )
                
                # Log the scheduled meeting as an event
                from .models import HistoricalEvent, TimeReference
                meeting_event = HistoricalEvent(
                    event_type=TimeReference.LAST_DEPLOYMENT,  # Using deployment as meeting type
                    timestamp=meeting_time,
                    metadata={
                        "duration": request.duration_minutes,
                        "participants": [p.model_dump() for p in request.participants],
                        "rule": request.temporal_rule
                    }
                )
                self.event_log.add_event(meeting_event)
                
                return response, None
            else:
                return None, ErrorResponse(
                    error="Conditional constraint failed",
                    details="Meeting conditions were not satisfied",
                    paradox_detected=False,
                    constraint_violations=["Conditional requirements not met"]
                )
            
        except ValueError as e:
            return None, ErrorResponse(
                error="Invalid temporal rule",
                details=str(e),
                paradox_detected=False,
                constraint_violations=[str(e)]
            )
        except Exception as e:
            return None, ErrorResponse(
                error="Internal scheduling error",
                details=str(e),
                paradox_detected=False,
                constraint_violations=[str(e)]
            )
    
    async def _check_conditional_constraints(self, expression, meeting_time: datetime) -> bool:
        """Check conditional constraints like 'only if', 'unless', 'provided'"""
        
        def _evaluate_condition(cond_expr) -> bool:
            """Evaluate a single condition"""
            if cond_expr.operator in [TemporalOperator.UNLESS, TemporalOperator.ONLY_IF, TemporalOperator.PROVIDED]:
                # For 'unless X', meeting can't be scheduled if X is true
                # For 'only if X' and 'provided X', meeting can only be scheduled if X is true
                
                # Check the actual condition
                condition_result = self._evaluate_specific_condition(cond_expr.conditions[0])
                
                if cond_expr.operator == TemporalOperator.UNLESS:
                    return not condition_result
                else:  # ONLY_IF or PROVIDED
                    return condition_result
            
            return True  # No condition to check
        
        # Check main expression conditions
        for condition in expression.conditions:
            if not _evaluate_condition(condition):
                return False
        
        # Recursively check nested conditions
        if isinstance(expression.value, list):
            for nested_expr in expression.value:
                if isinstance(nested_expr, TemporalExpression):
                    for condition in nested_expr.conditions:
                        if not _evaluate_condition(condition):
                            return False
        
        return True
    
    def _evaluate_specific_condition(self, condition_expr) -> bool:
        """Evaluate specific condition types"""
        if condition_expr.operator == TemporalOperator.WITHIN:
            # 'within X minutes of Y'
            if condition_expr.reference == TimeReference.RECURRING_LUNCH:
                # Check if within lunch window
                lunch_time = self.evaluator._calculate_next_lunch(datetime.now())
                window_minutes = int(str(condition_expr.value).split()[0])  # Extract number
                window = timedelta(minutes=window_minutes)
                
                # This would be checked against the meeting time
                # For now, return True if we're not currently in lunch window
                current_time = datetime.now()
                return not (lunch_time - window <= current_time <= lunch_time + window)
        
        elif condition_expr.reference == TimeReference.CRITICAL_INCIDENT:
            # 'only if no critical incident'
            incident = self.event_log.get_latest_event(TimeReference.CRITICAL_INCIDENT)
            return incident is None  # True if no incident
        
        # Default: condition is satisfied
        return True
    
    def _get_evaluation_steps(self, expression, result_time: datetime) -> List[Dict[str, Any]]:
        """Generate evaluation steps for debugging/transparency"""
        steps = []
        
        def _collect_steps(expr, depth=0):
            step = {
                "depth": depth,
                "operator": expr.operator.value if expr.operator else None,
                "reference": expr.reference.value if expr.reference else None,
                "value": str(expr.value) if expr.value else None,
                "has_conditions": len(expr.conditions) > 0
            }
            steps.append(step)
            
            for condition in expr.conditions:
                _collect_steps(condition, depth + 1)
            
            if isinstance(expr.value, list):
                for nested in expr.value:
                    if isinstance(nested, TemporalExpression):
                        _collect_steps(nested, depth + 1)
        
        _collect_steps(expression)
        
        # Add final result step
        steps.append({
            "depth": 0,
            "operator": "RESULT",
            "reference": None,
            "value": result_time.isoformat(),
            "has_conditions": False
        })
        
        return steps

    def _is_business_hours_only(self, violations: List[str]) -> bool:
        return bool(violations) and all("business hours" in v.lower() for v in violations)

    def _is_explicit_time_rule(self, expression: TemporalExpression) -> bool:
        if expression.operator != TemporalOperator.AT:
            return False
        if expression.reference is not None:
            return False
        if isinstance(expression.value, str):
            text = expression.value.lower()
            return ("am" in text or "pm" in text or ":" in text)
        return False

    def _find_next_business_slot(self, base_time: datetime, duration_minutes: int, constraints: List[Dict[str, Any]]) -> Optional[datetime]:
        day_start = base_time.replace(hour=9, minute=0, second=0, microsecond=0)
        day_end = base_time.replace(hour=17, minute=0, second=0, microsecond=0)

        if base_time <= day_start:
            start_window = day_start
        elif base_time >= day_end:
            start_window = day_start + timedelta(days=1)
            day_end = day_end + timedelta(days=1)
        else:
            start_window = base_time

        slot = self.find_available_slot(duration_minutes, start_window, day_end, constraints)
        if slot:
            return slot

        # Try next day business hours
        next_day_start = day_start + timedelta(days=1)
        next_day_end = day_end + timedelta(days=1)
        return self.find_available_slot(duration_minutes, next_day_start, next_day_end, constraints)
    
    def find_available_slot(self, duration_minutes: int, 
                           start_window: datetime, 
                           end_window: datetime,
                           constraints: List[Dict[str, Any]] = None) -> Optional[datetime]:
        """Find an available time slot within a window"""
        if constraints is None:
            constraints = []
        
        current_time = start_window
        
        while current_time + timedelta(minutes=duration_minutes) <= end_window:
            end_time = current_time + timedelta(minutes=duration_minutes)
            
            # Check constraints
            violations = self.paradox_detector.validate_schedule_window(
                current_time, end_time, constraints
            )
            
            if not violations:
                return current_time
            
            # Move to next slot (30-minute increments)
            current_time += timedelta(minutes=30)
        
        return None