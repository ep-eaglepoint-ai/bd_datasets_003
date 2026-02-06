"""
API Views for truck route planning and ELD log generation.
"""
from datetime import datetime
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from .serializers import TripInputSerializer, TripResultSerializer
from .services import RouteService, ELDService
from .exceptions import LocationError, CycleExceededError


class TripPlannerView(APIView):
    """
    API endpoint for planning truck trips.
    
    POST: Submit trip details and receive route with ELD logs.
    """
    
    def post(self, request):
        """
        Plan a trip and generate ELD logs.
        
        Request body:
        {
            "current_location": "string",
            "pickup_location": "string",
            "dropoff_location": "string",
            "current_cycle_hours": float
        }
        
        Returns:
            Complete trip plan with route, stops, and daily ELD logs.
        """
        serializer = TripInputSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(
                {
                    "error": "Validation failed",
                    "details": serializer.errors,
                    "message": "Please check your input and try again"
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            data = serializer.validated_data
            route_service = RouteService()
            eld_service = ELDService()
            
            try:
                current_coords = route_service.geocode_location(data['current_location'])
            except LocationError as e:
                return Response(
                    {
                        "error": "Invalid location",
                        "field": "current_location",
                        "message": f"Could not find current location: {data['current_location']}"
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            try:
                pickup_coords = route_service.geocode_location(data['pickup_location'])
            except LocationError as e:
                return Response(
                    {
                        "error": "Invalid location",
                        "field": "pickup_location",
                        "message": f"Could not find pickup location: {data['pickup_location']}"
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            try:
                dropoff_coords = route_service.geocode_location(data['dropoff_location'])
            except LocationError as e:
                return Response(
                    {
                        "error": "Invalid location",
                        "field": "dropoff_location",
                        "message": f"Could not find drop-off location: {data['dropoff_location']}"
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            full_route = route_service.get_route(
                current_coords,
                dropoff_coords,
                [pickup_coords]
            )
            
            fuel_stops = route_service.calculate_fuel_stops(
                full_route,
                current_coords,
                dropoff_coords
            )
            
            current_cycle_hours = data['current_cycle_hours']
            total_driving_hours = full_route['duration_hours']
            
            if current_cycle_hours >= 70:
                return Response(
                    {
                        "error": "Cycle limit exceeded",
                        "message": "You have reached the 70-hour/8-day limit. A 34-hour reset is required before starting a new trip.",
                        "cycle_hours_used": current_cycle_hours,
                        "cycle_hours_remaining": 0
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            start_time = datetime.now().replace(second=0, microsecond=0)
            
            stops, daily_logs = eld_service.calculate_trip_schedule(
                start_time=start_time,
                total_distance_miles=full_route['distance_miles'],
                total_driving_hours=total_driving_hours,
                current_cycle_hours=current_cycle_hours,
                fuel_stops=fuel_stops,
                pickup_coords=pickup_coords,
                dropoff_coords=dropoff_coords,
                route_geometry=full_route.get('geometry', {})
            )
            
            num_rest_stops = len([s for s in stops if s['type'] == 'rest'])
            num_fuel_stops = len([s for s in stops if s['type'] == 'fuel'])
            
            if stops:
                arrival_time = stops[-1]['departure_time']
            else:
                arrival_time = start_time.isoformat()
            
            total_trip_driving = sum(log['total_driving_hours'] for log in daily_logs)
            
            result = {
                "route": {
                    "geometry": full_route.get('geometry', {}),
                    "distance_miles": round(full_route['distance_miles'], 1),
                    "estimated_driving_hours": round(total_driving_hours, 2),
                    "waypoints": [
                        {
                            "name": "Current Location",
                            "coordinates": [current_coords[1], current_coords[0]]
                        },
                        {
                            "name": "Pickup",
                            "coordinates": [pickup_coords[1], pickup_coords[0]]
                        },
                        {
                            "name": "Drop-off",
                            "coordinates": [dropoff_coords[1], dropoff_coords[0]]
                        }
                    ]
                },
                "stops": stops,
                "daily_logs": daily_logs,
                "summary": {
                    "total_distance_miles": round(full_route['distance_miles'], 1),
                    "total_driving_hours": round(total_trip_driving, 2),
                    "total_trip_days": len(daily_logs),
                    "rest_stops": num_rest_stops,
                    "fuel_stops": num_fuel_stops,
                    "estimated_arrival": arrival_time,
                    "cycle_hours_at_start": current_cycle_hours,
                    "cycle_hours_at_end": daily_logs[-1]['cycle_hours_used'] if daily_logs else current_cycle_hours,
                    "pickup_duration_hours": 1.0,
                    "dropoff_duration_hours": 1.0
                }
            }
            
            return Response(result, status=status.HTTP_200_OK)
            
        except LocationError as e:
            return Response(
                {
                    "error": "Location error",
                    "message": str(e),
                    "location": getattr(e, 'location', None)
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        except CycleExceededError as e:
            return Response(
                {
                    "error": "Cycle limit exceeded",
                    "message": str(e),
                    "hours_available": getattr(e, 'hours_available', None),
                    "hours_needed": getattr(e, 'hours_needed', None)
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            return Response(
                {
                    "error": "Internal error",
                    "message": "An unexpected error occurred while planning your trip"
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class HealthCheckView(APIView):
    """Health check endpoint."""
    
    def get(self, request):
        return Response({"status": "healthy"}, status=status.HTTP_200_OK)


class TripValidateView(APIView):
    """
    Validate trip inputs without calculating the full route.
    """
    
    def post(self, request):
        """Validate trip inputs."""
        serializer = TripInputSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(
                {
                    "valid": False,
                    "errors": serializer.errors
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        data = serializer.validated_data
        route_service = RouteService()
        
        locations_valid = True
        location_errors = {}
        
        for field, location in [
            ('current_location', data['current_location']),
            ('pickup_location', data['pickup_location']),
            ('dropoff_location', data['dropoff_location'])
        ]:
            try:
                route_service.geocode_location(location)
            except LocationError:
                locations_valid = False
                location_errors[field] = f"Could not find location: {location}"
        
        if not locations_valid:
            return Response(
                {
                    "valid": False,
                    "errors": location_errors
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        cycle_hours = data['current_cycle_hours']
        cycle_warning = None
        if cycle_hours >= 60:
            cycle_warning = f"You have used {cycle_hours} of 70 hours in your cycle. Consider planning for a reset."
        
        return Response(
            {
                "valid": True,
                "warnings": {"cycle_hours": cycle_warning} if cycle_warning else {}
            },
            status=status.HTTP_200_OK
        )
