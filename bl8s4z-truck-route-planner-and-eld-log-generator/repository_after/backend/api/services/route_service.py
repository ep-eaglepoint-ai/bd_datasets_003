"""
Route calculation service using OpenStreetMap/OSRM.
"""
import requests
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError
from ..exceptions import LocationError


class RouteService:
    """
    Service for calculating routes using OSRM (Open Source Routing Machine).
    Handles geocoding, route calculation, and distance/duration estimation.
    """
    
    OSRM_BASE_URL = "http://router.project-osrm.org/route/v1/driving"
    AVERAGE_SPEED_MPH = 55
    FUEL_STOP_INTERVAL_MILES = 1000
    
    def __init__(self):
        self.geocoder = Nominatim(user_agent="truck_route_planner")
    
    def geocode_location(self, location: str) -> Tuple[float, float]:
        """
        Convert a location string to coordinates.
        
        Args:
            location: Address or place name
            
        Returns:
            Tuple of (latitude, longitude)
            
        Raises:
            LocationError: If location cannot be geocoded
        """
        try:
            result = self.geocoder.geocode(location, timeout=10)
            if result is None:
                raise LocationError(
                    f"Could not find location: {location}",
                    location=location
                )
            return (result.latitude, result.longitude)
        except GeocoderTimedOut:
            raise LocationError(
                f"Location lookup timed out for: {location}",
                location=location
            )
        except GeocoderServiceError as e:
            raise LocationError(
                f"Geocoding service error for {location}: {str(e)}",
                location=location
            )
    
    def get_route(
        self,
        origin: Tuple[float, float],
        destination: Tuple[float, float],
        waypoints: Optional[List[Tuple[float, float]]] = None
    ) -> Dict:
        """
        Calculate route between origin and destination with optional waypoints.
        
        Args:
            origin: (lat, lon) of starting point
            destination: (lat, lon) of ending point
            waypoints: Optional list of (lat, lon) waypoints
            
        Returns:
            Dict containing route geometry, distance, and duration
        """
        coordinates = [origin]
        if waypoints:
            coordinates.extend(waypoints)
        coordinates.append(destination)
        
        coords_str = ";".join(
            f"{lon},{lat}" for lat, lon in coordinates
        )
        
        url = f"{self.OSRM_BASE_URL}/{coords_str}"
        params = {
            "overview": "full",
            "geometries": "geojson",
            "steps": "true"
        }
        
        try:
            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            if data.get("code") != "Ok":
                raise LocationError(
                    "Could not calculate route between locations"
                )
            
            route = data["routes"][0]
            return {
                "geometry": route["geometry"],
                "distance_meters": route["distance"],
                "distance_miles": route["distance"] / 1609.344,
                "duration_seconds": route["duration"],
                "duration_hours": route["duration"] / 3600,
                "legs": route.get("legs", [])
            }
        except requests.RequestException as e:
            return self._estimate_route(coordinates)
    
    def _estimate_route(self, coordinates: List[Tuple[float, float]]) -> Dict:
        """
        Estimate route when OSRM is unavailable using haversine distance.
        """
        from math import radians, sin, cos, sqrt, atan2
        
        total_distance = 0
        for i in range(len(coordinates) - 1):
            lat1, lon1 = coordinates[i]
            lat2, lon2 = coordinates[i + 1]
            
            lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
            dlat = lat2 - lat1
            dlon = lon2 - lon1
            
            a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
            c = 2 * atan2(sqrt(a), sqrt(1-a))
            distance = 3956 * c * 1.3
            total_distance += distance
        
        duration_hours = total_distance / self.AVERAGE_SPEED_MPH
        
        return {
            "geometry": {
                "type": "LineString",
                "coordinates": [[lon, lat] for lat, lon in coordinates]
            },
            "distance_meters": total_distance * 1609.344,
            "distance_miles": total_distance,
            "duration_seconds": duration_hours * 3600,
            "duration_hours": duration_hours,
            "legs": []
        }
    
    def calculate_fuel_stops(
        self,
        route: Dict,
        start_coords: Tuple[float, float],
        end_coords: Tuple[float, float]
    ) -> List[Dict]:
        """
        Calculate fuel stop locations based on distance intervals.
        
        Args:
            route: Route data from get_route
            start_coords: Starting coordinates
            end_coords: Ending coordinates
            
        Returns:
            List of fuel stop locations with coordinates
        """
        total_miles = route["distance_miles"]
        fuel_stops = []
        
        num_fuel_stops = int(total_miles // self.FUEL_STOP_INTERVAL_MILES)
        
        if num_fuel_stops > 0 and route.get("geometry", {}).get("coordinates"):
            coords = route["geometry"]["coordinates"]
            if len(coords) > 2:
                step = len(coords) // (num_fuel_stops + 1)
                for i in range(1, num_fuel_stops + 1):
                    idx = min(i * step, len(coords) - 1)
                    coord = coords[idx]
                    fuel_stops.append({
                        "type": "fuel",
                        "longitude": coord[0],
                        "latitude": coord[1],
                        "miles_from_start": (i * self.FUEL_STOP_INTERVAL_MILES)
                    })
        
        return fuel_stops
    
    def get_location_name(self, lat: float, lon: float) -> str:
        """
        Reverse geocode coordinates to get a location name.
        """
        try:
            result = self.geocoder.reverse((lat, lon), timeout=10)
            if result:
                return result.address
            return f"{lat:.4f}, {lon:.4f}"
        except (GeocoderTimedOut, GeocoderServiceError):
            return f"{lat:.4f}, {lon:.4f}"
