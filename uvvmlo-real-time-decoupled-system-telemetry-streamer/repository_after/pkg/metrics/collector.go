package metrics

import (
	"bufio"
	"encoding/json"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

// SystemMetrics represents the telemetry data collected from the system
type SystemMetrics struct {
	Timestamp          int64   `json:"timestamp"`
	CPUUsage           float64 `json:"cpu_usage"`
	MemoryTotal        uint64  `json:"memory_total"`
	MemoryUsed         uint64  `json:"memory_used"`
	MemoryUsagePercent float64 `json:"memory_usage_percent"`
	ActiveConnections  int     `json:"active_connections"`
	NumGoroutines      int     `json:"num_goroutines"`
}

// Collector samples system metrics at regular intervals
type Collector struct {
	interval      time.Duration
	stopChan      chan struct{}
	prevIdle      uint64
	prevTotal     uint64
	mu            sync.Mutex
	connectionHub interface{ ClientCount() int }
	stopped       bool
}

// NewCollector creates a new metrics collector
func NewCollector(interval time.Duration) *Collector {
	return &Collector{
		interval: interval,
		stopChan: make(chan struct{}),
	}
}

// SetConnectionHub allows injecting a hub to track active connections
func (c *Collector) SetConnectionHub(hub interface{ ClientCount() int }) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.connectionHub = hub
}

// Start begins the metrics collection loop
func (c *Collector) Start(broadcast func([]byte)) {
	ticker := time.NewTicker(c.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			metrics := c.Collect()
			data, err := json.Marshal(metrics)
			if err != nil {
				continue
			}
			broadcast(data)
		case <-c.stopChan:
			return
		}
	}
}

// Stop terminates the collection loop (idempotent)
func (c *Collector) Stop() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.stopped {
		close(c.stopChan)
		c.stopped = true
	}
}

// Collect gathers current system metrics
func (c *Collector) Collect() SystemMetrics {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	return SystemMetrics{
		Timestamp:          time.Now().UnixMilli(),
		CPUUsage:           c.getCPUUsage(),
		MemoryTotal:        m.Sys,
		MemoryUsed:         m.Alloc,
		MemoryUsagePercent: c.getMemoryUsagePercent(&m),
		ActiveConnections:  c.getActiveConnections(),
		NumGoroutines:      runtime.NumGoroutine(),
	}
}

// getCPUUsage reads /proc/stat and calculates CPU utilization delta
// Falls back to runtime-based estimate on non-Linux systems
func (c *Collector) getCPUUsage() float64 {
	file, err := os.Open("/proc/stat")
	if err != nil {
		// Fallback for non-Linux systems (macOS, Windows, etc.)
		return c.getCPUUsageFallback()
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	if !scanner.Scan() {
		return 0
	}

	line := scanner.Text()
	if !strings.HasPrefix(line, "cpu ") {
		return 0
	}

	fields := strings.Fields(line)
	if len(fields) < 5 {
		return 0
	}

	// Parse CPU time values
	// fields: cpu user nice system idle iowait irq softirq...
	var total uint64
	var idle uint64

	for i := 1; i < len(fields); i++ {
		val, err := strconv.ParseUint(fields[i], 10, 64)
		if err != nil {
			continue
		}
		total += val
		if i == 4 { // idle is the 4th field (index 4)
			idle = val
		}
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	// On first call, store baseline and return 0
	if c.prevTotal == 0 {
		c.prevTotal = total
		c.prevIdle = idle
		return 0
	}

	// Calculate deltas
	totalDiff := float64(total - c.prevTotal)
	idleDiff := float64(idle - c.prevIdle)

	// Update previous values
	c.prevTotal = total
	c.prevIdle = idle

	if totalDiff == 0 {
		return 0
	}

	// CPU usage = (1 - idle_delta / total_delta) * 100
	cpuUsage := (1.0 - idleDiff/totalDiff) * 100.0

	// Clamp to valid range
	if cpuUsage < 0 {
		cpuUsage = 0
	}
	if cpuUsage > 100 {
		cpuUsage = 100
	}

	return cpuUsage
}

// getCPUUsageFallback estimates CPU activity from runtime metrics
// Used on non-Linux platforms where /proc/stat is unavailable
func (c *Collector) getCPUUsageFallback() float64 {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	// Estimate based on goroutine count and GC activity
	numCPU := float64(runtime.NumCPU())
	goroutinePressure := float64(runtime.NumGoroutine()) / (numCPU * 10.0)
	gcPressure := float64(m.NumGC%100) / 10.0

	estimate := (goroutinePressure + gcPressure) * 100.0
	if estimate > 100.0 {
		estimate = 100.0
	}
	if estimate < 0.0 {
		estimate = 0.0
	}

	return estimate
}

// getMemoryUsagePercent calculates memory usage percentage from runtime stats
func (c *Collector) getMemoryUsagePercent(m *runtime.MemStats) float64 {
	if m.Sys == 0 {
		return 0
	}
	return float64(m.Alloc) / float64(m.Sys) * 100
}

// getActiveConnections returns the number of active WebSocket connections from the hub
func (c *Collector) getActiveConnections() int {
	c.mu.Lock()
	hub := c.connectionHub
	c.mu.Unlock()

	if hub != nil {
		return hub.ClientCount()
	}

	return 0
}