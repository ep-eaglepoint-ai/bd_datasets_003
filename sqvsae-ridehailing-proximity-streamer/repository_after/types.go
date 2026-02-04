package proximity

import (
	"sync"
	"time"
)

// Message types
const (
	TypeCoordUpdate         = "COORD_UPDATE"
	TypeNearbyNotification  = "NEARBY_NOTIFICATION"
	TypeSubscribeRide       = "SUBSCRIBE_RIDE"
	TypeUnsubscribe         = "UNSUBSCRIBE"
	TypeRideCompleted       = "RIDE_COMPLETED"
	TypeHeartbeat           = "HEARTBEAT"
	TypeError               = "ERROR"
)

// CoordUpdate represents a location update from driver to passenger
type CoordUpdate struct {
	Type      string  `json:"type"`
	Lat       float64 `json:"lat"`
	Lng       float64 `json:"lng"`
	Heading   float64 `json:"heading"`
	Timestamp int64   `json:"timestamp"`
	Sequence  int64   `json:"sequence,omitempty"`
}

// NearbyNotification is sent when driver enters the 100m threshold
type NearbyNotification struct {
	Type                 string  `json:"type"`
	CurrentDistance      float64 `json:"currentDistance"`
	EstimatedArrivalTime int     `json:"estimatedArrivalTime"`
}

// SubscribeRide is sent by client to subscribe to a ride
type SubscribeRide struct {
	Type   string `json:"type"`
	RideID string `json:"rideId"`
	UserID string `json:"userId"`
}

// RideCompletedEvent signals that a ride has ended
type RideCompletedEvent struct {
	Type   string `json:"type"`
	RideID string `json:"rideId"`
}

// ErrorMessage for client errors
type ErrorMessage struct {
	Type    string `json:"type"`
	Message string `json:"message"`
	Code    string `json:"code"`
}

// DriverTelemetry represents incoming telemetry from driver
type DriverTelemetry struct {
	DriverID  string  `json:"driverId"`
	RideID    string  `json:"rideId"`
	Lat       float64 `json:"lat"`
	Lng       float64 `json:"lng"`
	Heading   float64 `json:"heading"`
	Timestamp int64   `json:"timestamp"`
}

// Ride represents an active ride session
type Ride struct {
	RideID        string
	DriverID      string
	PassengerID   string
	PickupLat     float64
	PickupLng     float64
	Status        string
	CreatedAt     time.Time
}

// RideSubscription tracks a passenger's subscription to ride updates
type RideSubscription struct {
	RideID           string
	UserID           string
	Client           *Client
	NotifiedNearby   bool      // Track if NEARBY_NOTIFICATION was sent
	LastSequence     int64     // Track message ordering
	mu               sync.Mutex
}

// ProximityThreshold in meters for NEARBY_NOTIFICATION
const ProximityThreshold = 100.0

// HeartbeatTimeout duration before considering connection dead
const HeartbeatTimeout = 30 * time.Second

// HeartbeatInterval for sending heartbeats
const HeartbeatInterval = 10 * time.Second
