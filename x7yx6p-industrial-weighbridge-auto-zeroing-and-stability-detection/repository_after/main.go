package main

import (
	"math"
	"sync"
	"time"
)

// Status represents the current state of the weighbridge
type Status int

const (
	EMPTY Status = iota
	IN_MOTION
	LOCKED
)

// WeightLockedEvent represents an event emitted when weight is locked
type WeightLockedEvent struct {
	Weight float64
	Time   time.Time
}

// CircularBuffer implements a thread-safe circular buffer (ring) for storing recent N samples
type CircularBuffer struct {
	buffer []int64
	size   int
	head   int
	count  int
	mu     sync.RWMutex
}

// NewCircularBuffer creates a new circular buffer with the specified size
func NewCircularBuffer(size int) *CircularBuffer {
	return &CircularBuffer{
		buffer: make([]int64, size),
		size:   size,
		head:   0,
		count:  0,
	}
}

// Add adds a new value to the buffer
func (cb *CircularBuffer) Add(value int64) {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	
	cb.buffer[cb.head] = value
	cb.head = (cb.head + 1) % cb.size
	if cb.count < cb.size {
		cb.count++
	}
}

// GetValues returns all current values in the buffer (thread-safe copy)
func (cb *CircularBuffer) GetValues() []int64 {
	cb.mu.RLock()
	defer cb.mu.RUnlock()
	
	values := make([]int64, cb.count)
	if cb.count == 0 {
		return values
	}
	
	// Calculate start index (oldest value)
	start := (cb.head - cb.count + cb.size) % cb.size
	for i := 0; i < cb.count; i++ {
		idx := (start + i) % cb.size
		values[i] = cb.buffer[idx]
	}
	return values
}

// Count returns the number of samples in the buffer
func (cb *CircularBuffer) Count() int {
	cb.mu.RLock()
	defer cb.mu.RUnlock()
	return cb.count
}

// Weighbridge represents the main weighbridge controller
type Weighbridge struct {
	// Configuration parameters
	calibrationFactor  float64       // Slope for conversion (kg per raw unit)
	stabilityThreshold float64       // Variance threshold for stability detection
	zeroBand          float64       // Band around zero for auto-zero detection (in raw units)
	zeroAdjustTime    time.Duration // Time to wait before adjusting zero (5 seconds)
	lockTime          time.Duration // Time to wait before locking weight (2 seconds)
	bufferSize        int           // Size of circular buffer (50 samples)
	
	// State variables (protected by mutex)
	zeroOffset        float64 // Current zero offset (tare) in raw units
	status            Status  // Current status
	buffer            *CircularBuffer
	
	// Timing tracking for state transitions
	zeroAdjustStart   time.Time // When zero adjustment condition was first met
	lockStart         time.Time // When lock condition was first met
	lastUpdate        time.Time // Last update timestamp
	
	// Event channel for weight locked events
	weightLockedEvents chan WeightLockedEvent
	
	// Thread safety
	mu sync.RWMutex
}

// NewWeighbridge creates a new weighbridge controller
func NewWeighbridge(calibrationFactor float64, initialRaw int64) *Weighbridge {
	wb := &Weighbridge{
		calibrationFactor:  calibrationFactor,
		stabilityThreshold: 100.0, // Default variance threshold
		zeroBand:           50.0,  // Default zero band (in raw units)
		zeroAdjustTime:     5 * time.Second,
		lockTime:           2 * time.Second,
		bufferSize:         50,
		zeroOffset:         float64(initialRaw),
		status:             EMPTY,
		buffer:             NewCircularBuffer(50),
		weightLockedEvents: make(chan WeightLockedEvent, 10),
		lastUpdate:         time.Now(),
	}
	
	// Initialize buffer with initial raw value
	wb.buffer.Add(initialRaw)
	
	return wb
}

// SetStabilityThreshold sets the variance threshold for stability detection
func (wb *Weighbridge) SetStabilityThreshold(threshold float64) {
	wb.mu.Lock()
	defer wb.mu.Unlock()
	wb.stabilityThreshold = threshold
}

// SetZeroBand sets the band around zero for auto-zero detection
func (wb *Weighbridge) SetZeroBand(band float64) {
	wb.mu.Lock()
	defer wb.mu.Unlock()
	wb.zeroBand = band
}

// SetZeroAdjustTime sets the time to wait before adjusting zero (for testing)
func (wb *Weighbridge) SetZeroAdjustTime(duration time.Duration) {
	wb.mu.Lock()
	defer wb.mu.Unlock()
	wb.zeroAdjustTime = duration
}

// SetLockTime sets the time to wait before locking weight (for testing)
func (wb *Weighbridge) SetLockTime(duration time.Duration) {
	wb.mu.Lock()
	defer wb.mu.Unlock()
	wb.lockTime = duration
}

// Update processes a new raw ADC reading (thread-safe)
func (wb *Weighbridge) Update(raw int64) {
	wb.mu.Lock()
	defer wb.mu.Unlock()
	
	now := time.Now()
	wb.lastUpdate = now
	
	// Add to circular buffer
	wb.buffer.Add(raw)
	
	// Need at least 2 samples to calculate variance
	if wb.buffer.Count() < 2 {
		return
	}
	
	// Get current buffer values (already thread-safe copy)
	values := wb.buffer.GetValues()
	
	// Calculate moving average manually
	avg := wb.calculateAverage(values)
	
	// Calculate moving variance manually
	variance := wb.calculateVariance(values, avg)
	
	// Determine if stable (low variance)
	isStable := variance < wb.stabilityThreshold
	
	// Requirement 4: If Variance > Threshold, status must be IN_MOTION
	if variance > wb.stabilityThreshold {
		// High variance means motion detected - force IN_MOTION status
		if wb.status != IN_MOTION {
			wb.status = IN_MOTION
			wb.zeroAdjustStart = time.Time{} // Reset zero adjustment
			wb.lockStart = time.Time{}       // Reset lock timer
		}
		// Don't process further logic when in motion (high variance)
		return
	}
	
	// Calculate current net raw value (for logic decisions)
	currentNetRaw := avg - wb.zeroOffset
	
	// Check if within zero band
	isNearZero := math.Abs(currentNetRaw) < wb.zeroBand
	
	// State machine logic (only reached when variance is low)
	switch wb.status {
	case EMPTY:
		if isStable && isNearZero {
			// Start tracking zero adjustment time
			if wb.zeroAdjustStart.IsZero() {
				wb.zeroAdjustStart = now
			}
			
			// Check if enough time has passed for zero adjustment
			if now.Sub(wb.zeroAdjustStart) >= wb.zeroAdjustTime {
				// Adjust zero offset to current average (auto-zero tracking)
				wb.zeroOffset = avg
				wb.zeroAdjustStart = time.Time{} // Reset
			}
		} else {
			// Reset zero adjustment timer if conditions not met
			wb.zeroAdjustStart = time.Time{}
			
			// Check if weight is rising significantly above zero
			if currentNetRaw > wb.zeroBand {
				wb.status = IN_MOTION
				wb.lockStart = time.Time{} // Reset lock timer
			}
		}
		
	case IN_MOTION:
		// We're here because variance is low (checked above)
		// Start tracking lock time when stable
		if wb.lockStart.IsZero() {
			wb.lockStart = now
		}
		
		// Check if enough time has passed for locking
		if now.Sub(wb.lockStart) >= wb.lockTime {
			wb.status = LOCKED
			// Emit WeightLocked event
			currentNetWeight := currentNetRaw * wb.calibrationFactor
			select {
			case wb.weightLockedEvents <- WeightLockedEvent{
				Weight: currentNetWeight,
				Time:   now,
			}:
			default:
				// Channel full, skip event (non-blocking)
			}
			wb.lockStart = time.Time{} // Reset
		}
		
		// Check if weight dropped back to zero
		if isStable && isNearZero {
			wb.status = EMPTY
			wb.zeroAdjustStart = time.Time{}
			wb.lockStart = time.Time{}
		}
		
	case LOCKED:
		// Check if weight dropped back to zero
		if isStable && isNearZero {
			wb.status = EMPTY
			wb.zeroAdjustStart = time.Time{}
			wb.lockStart = time.Time{}
		}
		// Note: Variance check already handled above - if high variance, status would be IN_MOTION
		// CRITICAL: Do NOT adjust zero offset when locked (safety feature)
		// This prevents auto-taring a full truck
	}
}

// GetWeight returns the current net weight in kilograms (thread-safe)
// Formula: Net Weight = (CurrentAverage - ZeroOffset) * CalibrationFactor
func (wb *Weighbridge) GetWeight() float64 {
	wb.mu.RLock()
	defer wb.mu.RUnlock()
	
	if wb.buffer.Count() == 0 {
		return 0.0
	}
	
	// Get current buffer values
	values := wb.buffer.GetValues()
	
	// Calculate moving average
	avg := wb.calculateAverage(values)
	
	// Calculate net weight: (CurrentAverage - ZeroOffset) * CalibrationFactor
	netRaw := avg - wb.zeroOffset
	return netRaw * wb.calibrationFactor
}

// GetStatus returns the current status (thread-safe)
func (wb *Weighbridge) GetStatus() Status {
	wb.mu.RLock()
	defer wb.mu.RUnlock()
	return wb.status
}

// GetZeroOffset returns the current zero offset (thread-safe)
func (wb *Weighbridge) GetZeroOffset() float64 {
	wb.mu.RLock()
	defer wb.mu.RUnlock()
	return wb.zeroOffset
}

// GetWeightLockedEvents returns the channel for weight locked events
func (wb *Weighbridge) GetWeightLockedEvents() <-chan WeightLockedEvent {
	return wb.weightLockedEvents
}

// GetVariance returns the current variance of the buffer (thread-safe)
func (wb *Weighbridge) GetVariance() float64 {
	wb.mu.RLock()
	defer wb.mu.RUnlock()
	
	if wb.buffer.Count() < 2 {
		return 0.0
	}
	
	values := wb.buffer.GetValues()
	avg := wb.calculateAverage(values)
	return wb.calculateVariance(values, avg)
}

// calculateAverage calculates the arithmetic mean of values (manual implementation)
func (wb *Weighbridge) calculateAverage(values []int64) float64 {
	if len(values) == 0 {
		return 0.0
	}
	
	sum := int64(0)
	for _, v := range values {
		sum += v
	}
	return float64(sum) / float64(len(values))
}

// calculateVariance calculates the population variance of values (manual implementation)
// Formula: Variance = Σ(xi - μ)² / N
func (wb *Weighbridge) calculateVariance(values []int64, mean float64) float64 {
	if len(values) == 0 {
		return 0.0
	}
	
	sumSquaredDiff := 0.0
	for _, v := range values {
		diff := float64(v) - mean
		sumSquaredDiff += diff * diff
	}
	
	return sumSquaredDiff / float64(len(values))
}

