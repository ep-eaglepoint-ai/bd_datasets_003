import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'

const createIcon = (color, emoji) => {
    return L.divIcon({
        className: 'custom-marker',
        html: `<div style="
      width: 36px;
      height: 36px;
      background: ${color};
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      border: 3px solid white;
    ">${emoji}</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -20]
    })
}

const icons = {
    current: createIcon('#6366f1', '📍'),
    pickup: createIcon('#10b981', '📦'),
    dropoff: createIcon('#ef4444', '🏁'),
    rest: createIcon('#3b82f6', '🛏️'),
    fuel: createIcon('#f59e0b', '⛽'),
    break: createIcon('#8b5cf6', '☕')
}

function MapUpdater({ route, stops }) {
    const map = useMap()

    useEffect(() => {
        if (route?.waypoints && route.waypoints.length > 0) {
            const bounds = L.latLngBounds(
                route.waypoints.map(wp => [wp.coordinates[1], wp.coordinates[0]])
            )
            if (stops && stops.length > 0) {
                stops.forEach(stop => {
                    if (stop.latitude && stop.longitude) {
                        bounds.extend([stop.latitude, stop.longitude])
                    }
                })
            }
            map.fitBounds(bounds, { padding: [50, 50] })
        }
    }, [route, stops, map])

    return null
}

function RouteMap({ route, stops }) {
    const defaultCenter = [39.8283, -98.5795]
    const defaultZoom = 4

    const routeCoordinates = route?.geometry?.coordinates?.map(
        coord => [coord[1], coord[0]]
    ) || []

    return (
        <MapContainer
            center={defaultCenter}
            zoom={defaultZoom}
            style={{ width: '100%', height: '100%', minHeight: '500px' }}
            scrollWheelZoom={true}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {route && <MapUpdater route={route} stops={stops} />}

            {routeCoordinates.length > 0 && (
                <Polyline
                    positions={routeCoordinates}
                    pathOptions={{
                        color: '#6366f1',
                        weight: 5,
                        opacity: 0.8
                    }}
                />
            )}

            {route?.waypoints?.map((waypoint, index) => (
                <Marker
                    key={`waypoint-${index}`}
                    position={[waypoint.coordinates[1], waypoint.coordinates[0]]}
                    icon={icons[waypoint.name.toLowerCase()] || icons.current}
                >
                    <Popup>
                        <strong>{waypoint.name}</strong>
                    </Popup>
                </Marker>
            ))}

            {stops?.map((stop, index) => (
                <Marker
                    key={`stop-${index}`}
                    position={[stop.latitude, stop.longitude]}
                    icon={icons[stop.type] || icons.current}
                >
                    <Popup>
                        <div style={{ minWidth: '150px' }}>
                            <strong style={{ textTransform: 'capitalize' }}>{stop.type}</strong>
                            <br />
                            <small>{stop.location}</small>
                            <br />
                            <small>Duration: {stop.duration_hours}h</small>
                            {stop.notes && (
                                <>
                                    <br />
                                    <small style={{ color: '#666' }}>{stop.notes}</small>
                                </>
                            )}
                        </div>
                    </Popup>
                </Marker>
            ))}
        </MapContainer>
    )
}

export default RouteMap
