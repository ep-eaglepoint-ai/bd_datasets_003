from datetime import datetime, timedelta
import re
from typing import Union
from dateutil import parser as date_parser

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
            reference_time = self._get_reference_time(expression.reference, base_time)
            if expression.value is None:
                return reference_time
            # Handle "exactly X after reference" where operator is AT
            if isinstance(expression.value, str):
                try:
                    offset = self._parse_time_offset(expression.value)
                    return reference_time + offset
                except Exception:
                    return reference_time
            if isinstance(expression.value, (int, float)):
                return reference_time + timedelta(hours=float(expression.value))
            return reference_time
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
        """Evaluate 'between A and B' - returns end time for latest possible scheduling"""
        if not isinstance(expression.value, list) or len(expression.value) < 2:
            raise ValueError("Invalid 'between' expression: needs two time specifications")

        # Get end time (for latest possible scheduling)
        end_expr = expression.value[1]
        if isinstance(end_expr, TemporalExpression):
            return self.evaluate(end_expr, base_time)
        else:
            return self._parse_absolute_time(str(end_expr), base_time)

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

    def _get_reference_time(self, reference: Union[TimeReference, str], base_time: datetime) -> datetime:
        """Get the timestamp of a reference event, handling special cases"""
        from .models import TimeReference
        
        # Handle special string reference "TWO_MOST_RECENT_CANCELLATIONS"
        if reference == "TWO_MOST_RECENT_CANCELLATIONS":
            # Get two most recent cancellations
            events = self.event_log.get_two_most_recent_events(TimeReference.LAST_CANCELLATION)
            if len(events) >= 2:
                # Return the earlier of the two (for "earlier of two most recent cancellations")
                return min(events[0].timestamp, events[1].timestamp)
            elif events:
                # If only one event, return that
                return events[0].timestamp
            else:
                # No events, use default
                return base_time - timedelta(hours=2)
        
        # Handle "successful deployment" with metadata filter
        if reference == "SUCCESSFUL_DEPLOYMENT":
            event = self.event_log.get_latest_event_with_metadata(
                TimeReference.LAST_DEPLOYMENT, 
                {"success": True}
            )
            if event:
                return event.timestamp
            else:
                # If no successful deployment, use any deployment or default
                event = self.event_log.get_latest_event(TimeReference.LAST_DEPLOYMENT)
                return event.timestamp if event else base_time - timedelta(hours=1)
        
        # Handle normal TimeReference enum
        if isinstance(reference, TimeReference):
            event = self.event_log.get_latest_event(reference)
            if not event:
                # If no event exists, use a default relative to base_time
                if reference == TimeReference.LAST_CANCELLATION:
                    return base_time - timedelta(hours=2)
                if reference == TimeReference.LAST_DEPLOYMENT:
                    return base_time - timedelta(hours=1)
                if reference == TimeReference.CRITICAL_INCIDENT:
                    return base_time - timedelta(days=3)
                if reference == TimeReference.RECURRING_LUNCH:
                    return self._calculate_next_lunch(base_time)
                if reference == TimeReference.PREVIOUS_DAY_WORKLOAD:
                    return base_time - timedelta(days=1)
                return base_time
            return event.timestamp
        
        raise ValueError(f"Unknown reference type: {reference}")

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
        # Get yesterday's date
        yesterday = base_time - timedelta(days=1)
        yesterday_start = yesterday.replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Try to get workload from event log (looking for events from yesterday)
        workload_events = []
        if hasattr(self.event_log, "get_events_by_type"):
            try:
                workload_events = self.event_log.get_events_by_type(
                    TimeReference.PREVIOUS_DAY_WORKLOAD,
                    since=yesterday_start
                )
            except Exception:
                workload_events = []

        if workload_events and not isinstance(workload_events, (list, tuple)):
            try:
                workload_events = list(workload_events)
            except TypeError:
                workload_events = []
        
        if workload_events:
            # Use the most recent workload event from yesterday
            latest_workload = workload_events[0]
            if latest_workload.calculated_value is not None:
                previous_workload = float(latest_workload.calculated_value)
            elif 'workload' in latest_workload.metadata:
                previous_workload = float(latest_workload.metadata['workload'])
            else:
                previous_workload = 75  # Default
        else:
            # No workload data found, use default
            previous_workload = 75
        
        # Dynamic lunch adjustment based on workload
        # Heavy workload (>80%) -> later lunch at 1:00 PM
        # Medium workload (30-80%) -> normal lunch at 12:00 PM
        # Light workload (<30%) -> early lunch at 11:30 AM
        if previous_workload > 80:
            lunch_hour = 13
            lunch_minute = 0
        elif previous_workload < 30:
            lunch_hour = 11
            lunch_minute = 30
        else:
            lunch_hour = 12
            lunch_minute = 0
        
        # Calculate lunch time for today
        lunch_time = datetime(
            base_time.year, base_time.month, base_time.day,
            lunch_hour, lunch_minute, 0
        )
        
        # If already past today's lunch, schedule for tomorrow
        if base_time > lunch_time:
            lunch_time += timedelta(days=1)
            # Recalculate for tomorrow with same workload logic
            # (workload doesn't change day-to-day unless new data)
        
        return lunch_time