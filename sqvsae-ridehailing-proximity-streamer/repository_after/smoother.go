package proximity

import (
	"math"
	"sync"
	"time"
)

// PositionSmoother implements client-side position interpolation
// to prevent the UI vehicle icon from "teleporting" during high network jitter
type PositionSmoother struct {
	// Current interpolated position
	currentLat float64
	currentLng float64
	currentHeading float64

	// Target position from latest update
	targetLat float64
	targetLng float64
	targetHeading float64

	// Previous positions for velocity estimation
	positions []TimestampedPosition

	// Smoothing parameters
	smoothingFactor float64 // 0-1, higher = faster response
	maxPositionHistory int

	// Last update time
	lastUpdateTime time.Time
	lastRenderTime time.Time

	mu sync.RWMutex
}

// TimestampedPosition represents a position with timestamp
type TimestampedPosition struct {
	Lat       float64
	Lng       float64
	Heading   float64
	Timestamp time.Time
}

// SmoothedPosition represents the current smoothed position
type SmoothedPosition struct {
	Lat       float64
	Lng       float64
	Heading   float64
	Velocity  float64 // m/s
	IsMoving  bool
}

// NewPositionSmoother creates a new position smoother
func NewPositionSmoother(smoothingFactor float64) *PositionSmoother {
	if smoothingFactor <= 0 || smoothingFactor > 1 {
		smoothingFactor = 0.3 // Default smoothing
	}
	return &PositionSmoother{
		smoothingFactor:    smoothingFactor,
		maxPositionHistory: 5,
		positions:          make([]TimestampedPosition, 0, 5),
	}
}

// Update processes a new coordinate update
func (s *PositionSmoother) Update(lat, lng, heading float64) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()

	// Initialize if first update
	if s.lastUpdateTime.IsZero() {
		s.currentLat = lat
		s.currentLng = lng
		s.currentHeading = heading
		s.targetLat = lat
		s.targetLng = lng
		s.targetHeading = heading
		s.lastUpdateTime = now
		s.lastRenderTime = now
		return
	}

	// Store in position history
	s.positions = append(s.positions, TimestampedPosition{
		Lat:       lat,
		Lng:       lng,
		Heading:   heading,
		Timestamp: now,
	})

	// Trim history
	if len(s.positions) > s.maxPositionHistory {
		s.positions = s.positions[1:]
	}

	// Update target
	s.targetLat = lat
	s.targetLng = lng
	s.targetHeading = heading
	s.lastUpdateTime = now
}

// GetSmoothedPosition returns the current interpolated position
func (s *PositionSmoother) GetSmoothedPosition() SmoothedPosition {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	dt := now.Sub(s.lastRenderTime).Seconds()
	s.lastRenderTime = now

	if dt <= 0 {
		dt = 0.016 // ~60fps default
	}

	// Exponential smoothing (lerp towards target)
	alpha := 1.0 - math.Exp(-s.smoothingFactor*dt*10)

	s.currentLat = lerp(s.currentLat, s.targetLat, alpha)
	s.currentLng = lerp(s.currentLng, s.targetLng, alpha)
	s.currentHeading = lerpAngle(s.currentHeading, s.targetHeading, alpha)

	// Calculate velocity from position history
	velocity := s.calculateVelocity()

	return SmoothedPosition{
		Lat:      s.currentLat,
		Lng:      s.currentLng,
		Heading:  s.currentHeading,
		Velocity: velocity,
		IsMoving: velocity > 0.5, // Moving if > 0.5 m/s
	}
}

// calculateVelocity estimates velocity from position history
func (s *PositionSmoother) calculateVelocity() float64 {
	if len(s.positions) < 2 {
		return 0
	}

	// Use last two positions
	p1 := s.positions[len(s.positions)-2]
	p2 := s.positions[len(s.positions)-1]

	dt := p2.Timestamp.Sub(p1.Timestamp).Seconds()
	if dt <= 0 {
		return 0
	}

	distance := HaversineDistance(p1.Lat, p1.Lng, p2.Lat, p2.Lng)
	return distance / dt
}

// GetTargetPosition returns the raw target position
func (s *PositionSmoother) GetTargetPosition() (lat, lng, heading float64) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.targetLat, s.targetLng, s.targetHeading
}

// Reset clears the smoother state
func (s *PositionSmoother) Reset() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.positions = s.positions[:0]
	s.lastUpdateTime = time.Time{}
	s.lastRenderTime = time.Time{}
}

// lerp performs linear interpolation between two values
func lerp(a, b, t float64) float64 {
	return a + (b-a)*t
}

// lerpAngle performs linear interpolation between two angles (in degrees)
// handling the wrap-around at 360 degrees
func lerpAngle(a, b, t float64) float64 {
	// Normalize angles to 0-360
	a = normalizeAngle(a)
	b = normalizeAngle(b)

	// Find shortest path
	diff := b - a
	if diff > 180 {
		diff -= 360
	} else if diff < -180 {
		diff += 360
	}

	return normalizeAngle(a + diff*t)
}

// normalizeAngle normalizes an angle to 0-360 range
func normalizeAngle(angle float64) float64 {
	for angle < 0 {
		angle += 360
	}
	for angle >= 360 {
		angle -= 360
	}
	return angle
}

// JitterDetector detects network jitter and adjusts smoothing
type JitterDetector struct {
	updateIntervals []time.Duration
	maxHistory      int
	expectedInterval time.Duration
	lastUpdate      time.Time
	mu              sync.Mutex
}

// NewJitterDetector creates a new jitter detector
func NewJitterDetector(expectedInterval time.Duration) *JitterDetector {
	return &JitterDetector{
		updateIntervals:  make([]time.Duration, 0, 10),
		maxHistory:       10,
		expectedInterval: expectedInterval,
	}
}

// RecordUpdate records an update timestamp
func (j *JitterDetector) RecordUpdate() {
	j.mu.Lock()
	defer j.mu.Unlock()

	now := time.Now()
	if !j.lastUpdate.IsZero() {
		interval := now.Sub(j.lastUpdate)
		j.updateIntervals = append(j.updateIntervals, interval)
		if len(j.updateIntervals) > j.maxHistory {
			j.updateIntervals = j.updateIntervals[1:]
		}
	}
	j.lastUpdate = now
}

// GetJitterLevel returns jitter level (0 = no jitter, 1 = high jitter)
func (j *JitterDetector) GetJitterLevel() float64 {
	j.mu.Lock()
	defer j.mu.Unlock()

	if len(j.updateIntervals) < 2 {
		return 0
	}

	// Calculate variance in intervals
	var sum, sumSq float64
	for _, interval := range j.updateIntervals {
		ms := float64(interval.Milliseconds())
		sum += ms
		sumSq += ms * ms
	}

	n := float64(len(j.updateIntervals))
	mean := sum / n
	variance := (sumSq / n) - (mean * mean)
	stdDev := math.Sqrt(variance)

	// Normalize by expected interval
	expectedMs := float64(j.expectedInterval.Milliseconds())
	jitterRatio := stdDev / expectedMs

	// Clamp to 0-1
	if jitterRatio > 1 {
		jitterRatio = 1
	}
	return jitterRatio
}

// AdaptiveSmoother adjusts smoothing based on jitter
type AdaptiveSmoother struct {
	smoother       *PositionSmoother
	jitterDetector *JitterDetector
	minSmoothing   float64
	maxSmoothing   float64
}

// NewAdaptiveSmoother creates an adaptive smoother
func NewAdaptiveSmoother(expectedUpdateInterval time.Duration) *AdaptiveSmoother {
	return &AdaptiveSmoother{
		smoother:       NewPositionSmoother(0.3),
		jitterDetector: NewJitterDetector(expectedUpdateInterval),
		minSmoothing:   0.1,
		maxSmoothing:   0.5,
	}
}

// Update processes a coordinate update with adaptive smoothing
func (a *AdaptiveSmoother) Update(lat, lng, heading float64) {
	a.jitterDetector.RecordUpdate()

	// Adjust smoothing based on jitter
	jitter := a.jitterDetector.GetJitterLevel()
	// More jitter = lower smoothing factor = smoother movement
	smoothing := a.maxSmoothing - jitter*(a.maxSmoothing-a.minSmoothing)
	a.smoother.smoothingFactor = smoothing

	a.smoother.Update(lat, lng, heading)
}

// GetSmoothedPosition returns the smoothed position
func (a *AdaptiveSmoother) GetSmoothedPosition() SmoothedPosition {
	return a.smoother.GetSmoothedPosition()
}
