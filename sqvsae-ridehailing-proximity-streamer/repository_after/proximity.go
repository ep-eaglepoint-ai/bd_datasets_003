package proximity

import (
	"math"
)

const (
	earthRadiusMeters = 6371000.0
)

// HaversineDistance calculates the distance between two coordinates in meters
// using the Haversine formula for great-circle distance
func HaversineDistance(lat1, lng1, lat2, lng2 float64) float64 {
	// Convert to radians
	lat1Rad := lat1 * math.Pi / 180
	lat2Rad := lat2 * math.Pi / 180
	deltaLat := (lat2 - lat1) * math.Pi / 180
	deltaLng := (lng2 - lng1) * math.Pi / 180

	// Haversine formula
	a := math.Sin(deltaLat/2)*math.Sin(deltaLat/2) +
		math.Cos(lat1Rad)*math.Cos(lat2Rad)*
			math.Sin(deltaLng/2)*math.Sin(deltaLng/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return earthRadiusMeters * c
}

// ProximityChecker handles proximity threshold detection
type ProximityChecker struct {
	pickupLat float64
	pickupLng float64
}

// NewProximityChecker creates a new proximity checker for a pickup location
func NewProximityChecker(pickupLat, pickupLng float64) *ProximityChecker {
	return &ProximityChecker{
		pickupLat: pickupLat,
		pickupLng: pickupLng,
	}
}

// CheckDistance calculates distance from driver to pickup point
func (p *ProximityChecker) CheckDistance(driverLat, driverLng float64) float64 {
	return HaversineDistance(driverLat, driverLng, p.pickupLat, p.pickupLng)
}

// IsWithinThreshold checks if distance is within the proximity threshold
func (p *ProximityChecker) IsWithinThreshold(distance float64) bool {
	return distance <= ProximityThreshold
}

// ProximityResult contains the result of a proximity check
type ProximityResult struct {
	Distance          float64
	WithinThreshold   bool
	CrossedThreshold  bool // True only on first crossing
}

// CheckProximity performs a full proximity check with threshold crossing detection
func (p *ProximityChecker) CheckProximity(driverLat, driverLng float64, wasWithinThreshold bool) ProximityResult {
	distance := p.CheckDistance(driverLat, driverLng)
	withinThreshold := p.IsWithinThreshold(distance)

	// Crossed threshold = now within AND wasn't before
	crossedThreshold := withinThreshold && !wasWithinThreshold

	return ProximityResult{
		Distance:         distance,
		WithinThreshold:  withinThreshold,
		CrossedThreshold: crossedThreshold,
	}
}

// EstimateArrivalTime estimates arrival time in seconds based on distance
// Assumes average speed of ~20 km/h in urban areas
func EstimateArrivalTime(distanceMeters float64) int {
	// 20 km/h = 5.56 m/s
	avgSpeedMps := 5.56
	return int(math.Ceil(distanceMeters / avgSpeedMps))
}
