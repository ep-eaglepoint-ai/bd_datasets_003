from datetime import datetime, timedelta
import re

from .models import TemporalExpression, TemporalOperator, TimeReference, HistoricalEvent
from .event_log import EventLog


class TemporalEvaluator:
    """Evaluates temporal expressions against the current state"""

    def __init__(self, event_log: EventLog):
        self.event_log = event_log

    def evaluate(self, expression: TemporalExpression, base_time: datetime = None) -> datetime:
        """Evaluate a temporal expression to get a concrete datetime"""
        if base_time is None:
            base_time = datetime.now()

        if expression.operator == TemporalOperator.AFTER:
            return self._evaluate_after(expression, base_time)
        elif expression.operator == TemporalOperator.BEFORE:
            return self._evaluate_before(expression, base_time)
        elif expression.operator == TemporalOperator.AT:
            return self._evaluate_at(expression, base_time)
        elif expression.operator == TemporalOperator.WITHIN:
            return self._evaluate_within(expression, base_time)
        elif expression.operator == TemporalOperator.EARLIER_OF:
            return self._evaluate_earlier_of(expression, base_time)
        elif expression.operator == TemporalOperator.LATER_OF:
            return self._evaluate_later_of(expression, base_time)
        elif expression.operator == TemporalOperator.BETWEEN:
            return self._evaluate_between(expression, base_time)
        elif expression.operator in [TemporalOperator.UNLESS, TemporalOperator.PROVIDED, TemporalOperator.ONLY_IF]:
            return self._evaluate_conditional(expression, base_time)
        else:
            raise ValueError(f"Unknown operator: {expression.operator}")

    def _evaluate_after(self, expression: TemporalExpression, base_time: datetime) -> datetime:
        """Evaluate 'X hours/days after reference'"""
        if not expression.value or not expression.reference:
            raise ValueError("Invalid 'after' expression: missing value or reference")

        # Get the reference event
        reference_time = self._get_reference_time(expression.reference, base_time)

        # Parse the time offset
        if isinstance(expression.value, str):
            offset = self._parse_time_offset(expression.value)
            return reference_time + offset
        elif isinstance(expression.value, (int, float)):
            # Assume hours if no unit specified
            return reference_time + timedelta(hours=float(expression.value))
        else:
            raise ValueError(f"Invalid value for 'after' expression: {expression.value}")

    def _evaluate_before(self, expression: TemporalExpression, base_time: datetime) -> datetime:
        """Evaluate 'X hours/days before reference'"""
        if not expression.value or not expression.reference:
            raise ValueError("Invalid 'before' expression: missing value or reference")

        # Get the reference event
        reference_time = self._get_reference_time(expression.reference, base_time)

        # Parse the time offset
        if isinstance(expression.value, str):
            offset = self._parse_time_offset(expression.value)
            return reference_time - offset
        elif isinstance(expression.value, (int, float)):
            # Assume hours if no unit specified
            return reference_time - timedelta(hours=float(expression.value))
        else:
            raise ValueError(f"Invalid value for 'before' expression: {expression.value}")

    def _evaluate_at(self, expression: TemporalExpression, base_time: datetime) -> datetime:
        """Evaluate 'at time' or 'at reference'"""
        if expression.reference:
            # 'at last deployment' means the time of last deployment
            return self._get_reference_time(expression.reference, base_time)
        elif expression.value:
            # 'at 2 PM' - parse absolute time
            return self._parse_absolute_time(str(expression.value), base_time)
        else:
            raise ValueError("Invalid 'at' expression: missing value or reference")

    def _evaluate_within(self, expression: TemporalExpression, base_time: datetime) -> datetime:
        """Evaluate 'within X of reference'"""
        if not expression.value or not expression.reference:
            raise ValueError("Invalid 'within' expression: missing value or reference")

        reference_time = self._get_reference_time(expression.reference, base_time)

        # For 'within', we return the reference time (it's within the window)
        # The window checking is done by the scheduler
        return reference_time

    def _evaluate_earlier_of(self, expression: TemporalExpression, base_time: datetime) -> datetime:
        """Evaluate 'earlier of A and B'"""
        if not isinstance(expression.value, list) or len(expression.value) < 2:
            raise ValueError("Invalid 'earlier_of' expression: needs two sub-expressions")

        times = []
        for sub_expr in expression.value[:2]:  # Take first two
            if isinstance(sub_expr, TemporalExpression):
                time_val = self.evaluate(sub_expr, base_time)
                times.append(time_val)

        if len(times) < 2:
            raise ValueError("Could not evaluate both sub-expressions for 'earlier_of'")

        return min(times)

    def _evaluate_later_of(self, expression: TemporalExpression, base_time: datetime) -> datetime:
        """Evaluate 'later of A and B'"""
        if not isinstance(expression.value, list) or len(expression.value) < 2:
            raise ValueError("Invalid 'later_of' expression: needs two sub-expressions")

        times = []
        for sub_expr in expression.value[:2]:  # Take first two
            if isinstance(sub_expr, TemporalExpression):
                time_val = self.evaluate(sub_expr, base_time)
                times.append(time_val)

        if len(times) < 2:
            raise ValueError("Could not evaluate both sub-expressions for 'later_of'")

        return max(times)

    def _evaluate_between(self, expression: TemporalExpression, base_time: datetime) -> datetime:
        """Evaluate 'between A and B' - returns midpoint"""
        if not isinstance(expression.value, list) or len(expression.value) < 2:
            raise ValueError("Invalid 'between' expression: needs two time specifications")

        # For now, return the start of the window
        # The actual scheduling within the window is handled by the scheduler
        start_expr = expression.value[0]
        if isinstance(start_expr, TemporalExpression):
            return self.evaluate(start_expr, base_time)
        else:
            return self._parse_absolute_time(str(start_expr), base_time)

    def _evaluate_conditional(self, expression: TemporalExpression, base_time: datetime) -> datetime:
        """Evaluate conditional expressions like 'unless X', 'provided Y'"""
        # For conditionals, we return base_time if condition is met
        # The actual conditional logic is handled by the scheduler
        if expression.conditions:
            # Evaluate the condition
            condition_result = self._evaluate_condition(expression.conditions[0], base_time)

            # For 'unless', if condition is true, we can't schedule
            # For 'provided'/'only if', if condition is false, we can't schedule
            # The scheduler will handle this
            return base_time
        else:
            raise ValueError(f"Conditional expression {expression.operator} has no condition")

    def _evaluate_condition(self, condition: TemporalExpression, base_time: datetime) -> bool:
        """Evaluate a condition to true/false"""
        # Simple implementation: check if reference event exists
        if condition.reference:
            event = self.event_log.get_latest_event(condition.reference)
            return event is not None

        # More complex condition evaluation would go here
        return True

    def _get_reference_time(self, reference: TimeReference, base_time: datetime) -> datetime:
        """Get the timestamp of a reference event"""
        event = self.event_log.get_latest_event(reference)
        if not event:
            # If no event exists, use a default relative to base_time
            defaults = {
                # Use recent defaults to avoid scheduling far in the past when no events exist.
                TimeReference.LAST_CANCELLATION: base_time - timedelta(hours=2),
                TimeReference.LAST_DEPLOYMENT: base_time - timedelta(hours=1),
                TimeReference.CRITICAL_INCIDENT: base_time - timedelta(days=3),
                TimeReference.RECURRING_LUNCH: self._calculate_next_lunch(base_time),
                TimeReference.PREVIOUS_DAY_WORKLOAD: base_time - timedelta(days=1),
            }
            return defaults.get(reference, base_time)

        return event.timestamp

    def _parse_time_offset(self, time_str: str) -> timedelta:
        """Parse time offset strings like '2 hours', '30 minutes'"""
        time_str = time_str.lower()

        if "hour" in time_str:
            match = re.search(r"(\d+\.?\d*)", time_str)
            if match:
                hours = float(match.group(1))
                return timedelta(hours=hours)
        elif "minute" in time_str:
            match = re.search(r"(\d+\.?\d*)", time_str)
            if match:
                minutes = float(match.group(1))
                return timedelta(minutes=minutes)
        elif "day" in time_str:
            match = re.search(r"(\d+\.?\d*)", time_str)
            if match:
                days = float(match.group(1))
                return timedelta(days=days)
        elif "week" in time_str:
            match = re.search(r"(\d+\.?\d*)", time_str)
            if match:
                weeks = float(match.group(1))
                return timedelta(weeks=weeks)

        raise ValueError(f"Could not parse time offset: {time_str}")

    def _parse_absolute_time(self, time_str: str, base_date: datetime) -> datetime:
        """Parse absolute time strings like '2 PM', '14:30'"""
        from dateutil import parser

        try:
            # Parse while using the provided base_date as the default date parts.
            # This ensures '2 PM' resolves to base_date at 14:00 rather than today's date.
            parsed_time = parser.parse(time_str, default=base_date)

            # If parsed_time has date 1900 (i.e., parser didn't fill date but default was used),
            # the use of default=base_date ensures correct date. We still handle day names as fallback.
            # If parsed_time contains date components different from 1900, return as-is.
            if parsed_time.year == base_date.year and parsed_time.month == base_date.month and parsed_time.day == base_date.day:
                # parsed_time is already aligned to base_date
                return parsed_time
            else:
                # If parser returned a different date (e.g., explicit date in input), return it
                return parsed_time
        except Exception:
            # Try to handle day names (e.g., 'Tuesday')
            day_map = {
                "monday": 0,
                "tuesday": 1,
                "wednesday": 2,
                "thursday": 3,
                "friday": 4,
                "saturday": 5,
                "sunday": 6,
            }

            if time_str.lower() in day_map:
                # Find next occurrence of this day
                target_day = day_map[time_str.lower()]
                current_day = base_date.weekday()
                days_ahead = target_day - current_day
                if days_ahead <= 0:
                    days_ahead += 7
                return base_date + timedelta(days=days_ahead)

            raise ValueError(f"Could not parse absolute time: {time_str}")

    def _calculate_next_lunch(self, base_time: datetime) -> datetime:
        """Calculate next lunch time based on previous day's workload"""
        # Default lunch at 12:00 PM
        lunch_hour = 12

        # Try to read previous day's workload from event log if available
        try:
            workload_event = self.event_log.get_latest_event(TimeReference.PREVIOUS_DAY_WORKLOAD)
            if workload_event:
                # prefer calculated_value or metadata key 'workload'
                prev_workload = workload_event.calculated_value if hasattr(workload_event, "calculated_value") and workload_event.calculated_value is not None else workload_event.metadata.get("workload", 75)
            else:
                prev_workload = 75
        except Exception:
            prev_workload = 75

        # Adjust lunch based on workload (example logic)
        if prev_workload > 80:
            lunch_hour = 13  # Late lunch for heavy workload
        elif prev_workload < 30:
            lunch_hour = 11  # Early lunch for light workload

        # Calculate lunch time for today
        lunch_time = datetime(base_time.year, base_time.month, base_time.day, lunch_hour, 0, 0)

        # If already past today's lunch, schedule for tomorrow
        if base_time > lunch_time:
            lunch_time += timedelta(days=1)

        return lunch_time