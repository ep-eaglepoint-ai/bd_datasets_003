"""
ELD (Electronic Logging Device) log generation service.
Implements HOS (Hours of Service) regulations for property-carrying drivers.
"""
from datetime import datetime, timedelta, date
from typing import Dict, List, Tuple, Optional
from ..exceptions import CycleExceededError


class ELDService:
    """
    Service for generating ELD logs following FMCSA regulations.
    
    Regulations for property-carrying drivers:
    - 11-hour driving limit after 10 consecutive hours off duty
    - 14-hour on-duty window after 10 consecutive hours off duty
    - 30-minute break required after 8 hours of driving
    - 70-hour/8-day limit (rolling 8-day cycle)
    - 34-hour restart option
    """
    
    MAX_DRIVING_HOURS_PER_DAY = 11
    MAX_ON_DUTY_HOURS_PER_DAY = 14
    REQUIRED_OFF_DUTY_HOURS = 10
    BREAK_REQUIRED_AFTER_HOURS = 8
    BREAK_DURATION_HOURS = 0.5
    CYCLE_HOURS_LIMIT = 70
    CYCLE_DAYS = 8
    FUEL_STOP_DURATION_HOURS = 0.5
    PICKUP_DROPOFF_DURATION_HOURS = 1.0
    
    def __init__(self):
        self.current_driving_hours = 0
        self.current_on_duty_hours = 0
        self.hours_since_break = 0
    
    def calculate_trip_schedule(
        self,
        start_time: datetime,
        total_distance_miles: float,
        total_driving_hours: float,
        current_cycle_hours: float,
        fuel_stops: List[Dict],
        pickup_coords: Tuple[float, float],
        dropoff_coords: Tuple[float, float],
        route_geometry: Dict
    ) -> Tuple[List[Dict], List[Dict]]:
        """
        Calculate the complete trip schedule including stops and ELD logs.
        
        Args:
            start_time: Trip start datetime
            total_distance_miles: Total route distance
            total_driving_hours: Estimated driving duration
            current_cycle_hours: Hours already used in current cycle
            fuel_stops: List of fuel stop locations
            pickup_coords: Pickup location coordinates
            dropoff_coords: Drop-off location coordinates
            route_geometry: Route geometry for stop interpolation
            
        Returns:
            Tuple of (stops list, daily logs list)
        """
        remaining_cycle_hours = self.CYCLE_HOURS_LIMIT - current_cycle_hours
        
        total_duty_hours = (
            total_driving_hours +
            self.PICKUP_DROPOFF_DURATION_HOURS * 2 +
            len(fuel_stops) * self.FUEL_STOP_DURATION_HOURS
        )
        
        if total_duty_hours > remaining_cycle_hours:
            reset_hours = max(0, total_duty_hours - remaining_cycle_hours + 34)
        
        stops = []
        daily_logs = []
        
        current_time = start_time
        current_cycle_used = current_cycle_hours
        daily_driving = 0
        daily_on_duty = 0
        hours_since_break = 0
        miles_covered = 0
        day_number = 1
        day_entries = []
        day_miles = 0
        day_start_location = "Starting Location"
        
        day_entries.append({
            "status": "off_duty",
            "start_time": current_time.replace(hour=0, minute=0, second=0),
            "end_time": current_time,
            "duration_hours": current_time.hour + current_time.minute / 60,
            "location": day_start_location,
            "notes": "Pre-trip"
        })
        
        pre_trip_duration = 0.25
        day_entries.append({
            "status": "on_duty_not_driving",
            "start_time": current_time,
            "end_time": current_time + timedelta(hours=pre_trip_duration),
            "duration_hours": pre_trip_duration,
            "location": day_start_location,
            "notes": "Pre-trip inspection"
        })
        current_time += timedelta(hours=pre_trip_duration)
        daily_on_duty += pre_trip_duration
        current_cycle_used += pre_trip_duration
        
        drive_to_pickup_hours = min(2.0, total_driving_hours * 0.1)
        drive_to_pickup_miles = drive_to_pickup_hours * 55
        
        if drive_to_pickup_hours > 0:
            driving_entry, current_time, daily_driving, hours_since_break, current_cycle_used, day_entries = \
                self._add_driving_segment(
                    current_time, drive_to_pickup_hours, drive_to_pickup_miles,
                    daily_driving, hours_since_break, current_cycle_used,
                    day_entries, "Driving to pickup"
                )
            miles_covered += drive_to_pickup_miles
            day_miles += drive_to_pickup_miles
        
        stops.append({
            "type": "pickup",
            "location": "Pickup Location",
            "latitude": pickup_coords[0],
            "longitude": pickup_coords[1],
            "arrival_time": current_time.isoformat(),
            "departure_time": (current_time + timedelta(hours=self.PICKUP_DROPOFF_DURATION_HOURS)).isoformat(),
            "duration_hours": self.PICKUP_DROPOFF_DURATION_HOURS,
            "notes": "Loading cargo",
            "miles_from_start": miles_covered
        })
        
        day_entries.append({
            "status": "on_duty_not_driving",
            "start_time": current_time,
            "end_time": current_time + timedelta(hours=self.PICKUP_DROPOFF_DURATION_HOURS),
            "duration_hours": self.PICKUP_DROPOFF_DURATION_HOURS,
            "location": "Pickup Location",
            "notes": "Loading at pickup"
        })
        current_time += timedelta(hours=self.PICKUP_DROPOFF_DURATION_HOURS)
        daily_on_duty += self.PICKUP_DROPOFF_DURATION_HOURS
        current_cycle_used += self.PICKUP_DROPOFF_DURATION_HOURS
        
        remaining_driving_hours = total_driving_hours - drive_to_pickup_hours
        remaining_miles = total_distance_miles - drive_to_pickup_miles
        
        fuel_stop_index = 0
        
        while remaining_driving_hours > 0:
            if current_cycle_used >= self.CYCLE_HOURS_LIMIT:
                reset_duration = 34
                day_entries.append({
                    "status": "off_duty",
                    "start_time": current_time,
                    "end_time": current_time + timedelta(hours=10),
                    "duration_hours": 10,
                    "location": "Rest Area",
                    "notes": "Starting 34-hour reset"
                })
                
                daily_logs.append(self._create_daily_log(
                    day_entries, day_number, current_time.date(),
                    day_miles, day_start_location, "Rest Area",
                    current_cycle_used
                ))
                
                day_number += 1
                current_time = current_time.replace(hour=0, minute=0, second=0) + timedelta(days=1)
                day_entries = []
                day_miles = 0
                day_start_location = "Rest Area"
                daily_driving = 0
                daily_on_duty = 0
                
                day_entries.append({
                    "status": "sleeper_berth",
                    "start_time": current_time,
                    "end_time": current_time + timedelta(hours=24),
                    "duration_hours": 24,
                    "location": "Rest Area",
                    "notes": "34-hour reset (day 1)"
                })
                
                daily_logs.append(self._create_daily_log(
                    day_entries, day_number, current_time.date(),
                    0, "Rest Area", "Rest Area",
                    current_cycle_used
                ))
                
                day_number += 1
                current_time += timedelta(days=1)
                day_entries = [{
                    "status": "sleeper_berth",
                    "start_time": current_time,
                    "end_time": current_time + timedelta(hours=10),
                    "duration_hours": 10,
                    "location": "Rest Area",
                    "notes": "34-hour reset complete"
                }]
                current_time += timedelta(hours=10)
                current_cycle_used = 0
                hours_since_break = 0
            
            available_driving = min(
                self.MAX_DRIVING_HOURS_PER_DAY - daily_driving,
                remaining_driving_hours
            )
            
            if hours_since_break >= self.BREAK_REQUIRED_AFTER_HOURS:
                day_entries.append({
                    "status": "off_duty",
                    "start_time": current_time,
                    "end_time": current_time + timedelta(hours=self.BREAK_DURATION_HOURS),
                    "duration_hours": self.BREAK_DURATION_HOURS,
                    "location": "Rest Stop",
                    "notes": "30-minute break"
                })
                
                stops.append({
                    "type": "break",
                    "location": "Rest Stop",
                    "latitude": pickup_coords[0] + (dropoff_coords[0] - pickup_coords[0]) * (miles_covered / total_distance_miles),
                    "longitude": pickup_coords[1] + (dropoff_coords[1] - pickup_coords[1]) * (miles_covered / total_distance_miles),
                    "arrival_time": current_time.isoformat(),
                    "departure_time": (current_time + timedelta(hours=self.BREAK_DURATION_HOURS)).isoformat(),
                    "duration_hours": self.BREAK_DURATION_HOURS,
                    "notes": "30-minute break",
                    "miles_from_start": miles_covered
                })
                
                current_time += timedelta(hours=self.BREAK_DURATION_HOURS)
                hours_since_break = 0
            
            if fuel_stop_index < len(fuel_stops):
                next_fuel_stop_miles = fuel_stops[fuel_stop_index].get("miles_from_start", 0)
                if miles_covered < next_fuel_stop_miles <= miles_covered + available_driving * 55:
                    drive_to_fuel = (next_fuel_stop_miles - miles_covered) / 55
                    drive_miles = drive_to_fuel * 55
                    
                    if drive_to_fuel > 0:
                        _, current_time, daily_driving, hours_since_break, current_cycle_used, day_entries = \
                            self._add_driving_segment(
                                current_time, drive_to_fuel, drive_miles,
                                daily_driving, hours_since_break, current_cycle_used,
                                day_entries, "Driving"
                            )
                        miles_covered += drive_miles
                        day_miles += drive_miles
                        remaining_driving_hours -= drive_to_fuel
                        remaining_miles -= drive_miles
                    
                    fuel_stop = fuel_stops[fuel_stop_index]
                    stops.append({
                        "type": "fuel",
                        "location": "Fuel Station",
                        "latitude": fuel_stop.get("latitude", 0),
                        "longitude": fuel_stop.get("longitude", 0),
                        "arrival_time": current_time.isoformat(),
                        "departure_time": (current_time + timedelta(hours=self.FUEL_STOP_DURATION_HOURS)).isoformat(),
                        "duration_hours": self.FUEL_STOP_DURATION_HOURS,
                        "notes": "Fueling",
                        "miles_from_start": miles_covered
                    })
                    
                    day_entries.append({
                        "status": "on_duty_not_driving",
                        "start_time": current_time,
                        "end_time": current_time + timedelta(hours=self.FUEL_STOP_DURATION_HOURS),
                        "duration_hours": self.FUEL_STOP_DURATION_HOURS,
                        "location": "Fuel Station",
                        "notes": "Fueling"
                    })
                    
                    current_time += timedelta(hours=self.FUEL_STOP_DURATION_HOURS)
                    daily_on_duty += self.FUEL_STOP_DURATION_HOURS
                    current_cycle_used += self.FUEL_STOP_DURATION_HOURS
                    fuel_stop_index += 1
                    continue
            
            if available_driving <= 0 or daily_on_duty >= self.MAX_ON_DUTY_HOURS_PER_DAY:
                day_entries.append({
                    "status": "sleeper_berth",
                    "start_time": current_time,
                    "end_time": current_time + timedelta(hours=self.REQUIRED_OFF_DUTY_HOURS),
                    "duration_hours": self.REQUIRED_OFF_DUTY_HOURS,
                    "location": "Rest Area",
                    "notes": "10-hour rest period"
                })
                
                stops.append({
                    "type": "rest",
                    "location": "Rest Area",
                    "latitude": pickup_coords[0] + (dropoff_coords[0] - pickup_coords[0]) * (miles_covered / total_distance_miles),
                    "longitude": pickup_coords[1] + (dropoff_coords[1] - pickup_coords[1]) * (miles_covered / total_distance_miles),
                    "arrival_time": current_time.isoformat(),
                    "departure_time": (current_time + timedelta(hours=self.REQUIRED_OFF_DUTY_HOURS)).isoformat(),
                    "duration_hours": self.REQUIRED_OFF_DUTY_HOURS,
                    "notes": "10-hour rest period",
                    "miles_from_start": miles_covered
                })
                
                remaining_day_hours = 24 - (current_time.hour + current_time.minute / 60)
                if remaining_day_hours < self.REQUIRED_OFF_DUTY_HOURS:
                    day_entries[-1]["end_time"] = current_time.replace(hour=23, minute=59, second=59)
                    day_entries[-1]["duration_hours"] = remaining_day_hours
                    
                    daily_logs.append(self._create_daily_log(
                        day_entries, day_number, current_time.date(),
                        day_miles, day_start_location, "Rest Area",
                        current_cycle_used
                    ))
                    
                    day_number += 1
                    next_day = current_time.date() + timedelta(days=1)
                    current_time = datetime.combine(next_day, datetime.min.time())
                    
                    rest_remaining = self.REQUIRED_OFF_DUTY_HOURS - remaining_day_hours
                    day_entries = [{
                        "status": "sleeper_berth",
                        "start_time": current_time,
                        "end_time": current_time + timedelta(hours=rest_remaining),
                        "duration_hours": rest_remaining,
                        "location": "Rest Area",
                        "notes": "Continuing rest period"
                    }]
                    current_time += timedelta(hours=rest_remaining)
                    day_miles = 0
                    day_start_location = "Rest Area"
                else:
                    current_time += timedelta(hours=self.REQUIRED_OFF_DUTY_HOURS)
                
                daily_driving = 0
                daily_on_duty = 0
                hours_since_break = 0
                continue
            
            drive_segment = min(available_driving, remaining_driving_hours, 3.0)
            drive_miles = drive_segment * 55
            
            _, current_time, daily_driving, hours_since_break, current_cycle_used, day_entries = \
                self._add_driving_segment(
                    current_time, drive_segment, drive_miles,
                    daily_driving, hours_since_break, current_cycle_used,
                    day_entries, "Driving"
                )
            
            miles_covered += drive_miles
            day_miles += drive_miles
            remaining_driving_hours -= drive_segment
            remaining_miles -= drive_miles
            daily_on_duty += drive_segment
        
        stops.append({
            "type": "dropoff",
            "location": "Drop-off Location",
            "latitude": dropoff_coords[0],
            "longitude": dropoff_coords[1],
            "arrival_time": current_time.isoformat(),
            "departure_time": (current_time + timedelta(hours=self.PICKUP_DROPOFF_DURATION_HOURS)).isoformat(),
            "duration_hours": self.PICKUP_DROPOFF_DURATION_HOURS,
            "notes": "Unloading cargo",
            "miles_from_start": miles_covered
        })
        
        day_entries.append({
            "status": "on_duty_not_driving",
            "start_time": current_time,
            "end_time": current_time + timedelta(hours=self.PICKUP_DROPOFF_DURATION_HOURS),
            "duration_hours": self.PICKUP_DROPOFF_DURATION_HOURS,
            "location": "Drop-off Location",
            "notes": "Unloading at destination"
        })
        current_time += timedelta(hours=self.PICKUP_DROPOFF_DURATION_HOURS)
        daily_on_duty += self.PICKUP_DROPOFF_DURATION_HOURS
        current_cycle_used += self.PICKUP_DROPOFF_DURATION_HOURS
        
        post_trip_duration = 0.25
        day_entries.append({
            "status": "on_duty_not_driving",
            "start_time": current_time,
            "end_time": current_time + timedelta(hours=post_trip_duration),
            "duration_hours": post_trip_duration,
            "location": "Drop-off Location",
            "notes": "Post-trip inspection"
        })
        current_time += timedelta(hours=post_trip_duration)
        
        end_of_day = current_time.replace(hour=23, minute=59, second=59)
        if current_time < end_of_day:
            day_entries.append({
                "status": "off_duty",
                "start_time": current_time,
                "end_time": end_of_day,
                "duration_hours": (end_of_day - current_time).total_seconds() / 3600,
                "location": "Drop-off Location",
                "notes": "Off duty"
            })
        
        daily_logs.append(self._create_daily_log(
            day_entries, day_number, current_time.date(),
            day_miles, day_start_location, "Drop-off Location",
            current_cycle_used
        ))
        
        return stops, daily_logs
    
    def _add_driving_segment(
        self,
        current_time: datetime,
        duration_hours: float,
        miles: float,
        daily_driving: float,
        hours_since_break: float,
        current_cycle_used: float,
        day_entries: List[Dict],
        notes: str
    ) -> Tuple[Dict, datetime, float, float, float, List[Dict]]:
        """Add a driving segment to the log."""
        entry = {
            "status": "driving",
            "start_time": current_time,
            "end_time": current_time + timedelta(hours=duration_hours),
            "duration_hours": duration_hours,
            "location": "En Route",
            "notes": notes
        }
        day_entries.append(entry)
        
        return (
            entry,
            current_time + timedelta(hours=duration_hours),
            daily_driving + duration_hours,
            hours_since_break + duration_hours,
            current_cycle_used + duration_hours,
            day_entries
        )
    
    def _create_daily_log(
        self,
        entries: List[Dict],
        day_number: int,
        log_date: date,
        miles_driven: float,
        starting_location: str,
        ending_location: str,
        cycle_hours_used: float
    ) -> Dict:
        """Create a daily log summary."""
        total_driving = sum(
            e["duration_hours"] for e in entries if e["status"] == "driving"
        )
        total_on_duty = sum(
            e["duration_hours"] for e in entries 
            if e["status"] in ["driving", "on_duty_not_driving"]
        )
        total_off_duty = sum(
            e["duration_hours"] for e in entries if e["status"] == "off_duty"
        )
        total_sleeper = sum(
            e["duration_hours"] for e in entries if e["status"] == "sleeper_berth"
        )
        
        formatted_entries = []
        for entry in entries:
            formatted_entry = entry.copy()
            if isinstance(formatted_entry["start_time"], datetime):
                formatted_entry["start_time"] = formatted_entry["start_time"].isoformat()
            if isinstance(formatted_entry["end_time"], datetime):
                formatted_entry["end_time"] = formatted_entry["end_time"].isoformat()
            formatted_entries.append(formatted_entry)
        
        return {
            "date": log_date.isoformat(),
            "day_number": day_number,
            "entries": formatted_entries,
            "total_driving_hours": round(total_driving, 2),
            "total_on_duty_hours": round(total_on_duty, 2),
            "total_off_duty_hours": round(total_off_duty, 2),
            "total_sleeper_hours": round(total_sleeper, 2),
            "miles_driven": round(miles_driven, 1),
            "starting_location": starting_location,
            "ending_location": ending_location,
            "cycle_hours_used": round(min(cycle_hours_used, self.CYCLE_HOURS_LIMIT), 2),
            "cycle_hours_remaining": round(max(0, self.CYCLE_HOURS_LIMIT - cycle_hours_used), 2)
        }
    
    def validate_cycle_hours(self, current_hours: float, trip_hours: float) -> bool:
        """
        Validate if a trip can be completed within cycle limits.
        
        Returns True if trip can be completed (possibly with resets).
        """
        return current_hours < self.CYCLE_HOURS_LIMIT or trip_hours <= 70
