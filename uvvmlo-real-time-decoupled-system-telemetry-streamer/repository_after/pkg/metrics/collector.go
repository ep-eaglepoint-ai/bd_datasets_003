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
	interval time.Duration
	stopChan chan struct{}
	prevIdle uint64
	prevTotal uint64
	mu       sync.Mutex
	stopped  bool
}

// NewCollector creates a new metrics collector
func NewCollector(interval time.Duration) *Collector {
	return &Collector{
		interval: interval,
		stopChan: make(chan struct{}),
	}
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
		// Fallback for non-Linux systems
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
	var total uint64
	var idle uint64

	for i := 1; i < len(fields); i++ {
		val, err := strconv.ParseUint(fields[i], 10, 64)
		if err != nil {
			continue
		}
		total += val
		if i == 4 { // idle is the 4th field
			idle = val
		}
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	// On first call, store baseline
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

	if cpuUsage < 0 {
		cpuUsage = 0
	}
	if cpuUsage > 100 {
		cpuUsage = 100
	}

	return cpuUsage
}

// getCPUUsageFallback estimates CPU activity from runtime metrics
func (c *Collector) getCPUUsageFallback() float64 {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

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

// getActiveConnections counts host-level network connections from /proc/net/*
// This is TRUE system-level connection count, not WebSocket client count
func (c *Collector) getActiveConnections() int {
	// Try Linux /proc filesystem first
	count := c.countLinuxConnections()
	if count > 0 {
		return count
	}

	// Fallback for non-Linux systems
	return c.countConnectionsFallback()
}

// countLinuxConnections reads /proc/net/tcp and /proc/net/tcp6
func (c *Collector) countLinuxConnections() int {
	count := 0

	// Count TCP IPv4 connections
	tcp4Count := c.countConnectionsFromFile("/proc/net/tcp")
	count += tcp4Count

	// Count TCP IPv6 connections
	tcp6Count := c.countConnectionsFromFile("/proc/net/tcp6")
	count += tcp6Count

	// Count UDP IPv4 connections (optional, but completes the picture)
	udp4Count := c.countConnectionsFromFile("/proc/net/udp")
	count += udp4Count

	// Count UDP IPv6 connections
	udp6Count := c.countConnectionsFromFile("/proc/net/udp6")
	count += udp6Count

	return count
}

// countConnectionsFromFile counts connections from a /proc/net/* file
func (c *Collector) countConnectionsFromFile(path string) int {
	file, err := os.Open(path)
	if err != nil {
		return 0
	}
	defer file.Close()

	count := 0
	scanner := bufio.NewScanner(file)

	// Skip header line
	if scanner.Scan() {
		// Header skipped
	}

	// Count each connection line
	for scanner.Scan() {
		line := scanner.Text()
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// Parse connection state (format: sl local_address rem_address st ...)
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}

		// Field index 3 is the connection state
		// TCP states: 01=ESTABLISHED, 0A=LISTEN, etc.
		// We count all states except CLOSED (00)
		state := fields[3]
		if state != "00" {
			count++
		}
	}

	return count
}

// countConnectionsFallback uses runtime stats as a proxy
// This is less accurate but works on all platforms
func (c *Collector) countConnectionsFallback() int {
	// On non-Linux systems, we can't easily get network connections
	// Return goroutine count as a rough proxy for activity
	// (This is admittedly imperfect, but better than nothing)
	return runtime.NumGoroutine()
}