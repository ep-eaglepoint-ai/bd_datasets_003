package metrics

import (
	"bufio"
	"encoding/json"
	"net"
	"os"
	"runtime"
	"strconv"
	"strings"
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
	interval  time.Duration
	prevIdle  uint64
	prevTotal uint64
	stopChan  chan struct{}
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

// Stop terminates the collection loop
func (c *Collector) Stop() {
	close(c.stopChan)
}

// Collect gathers current system metrics
func (c *Collector) Collect() SystemMetrics {
	return SystemMetrics{
		Timestamp:          time.Now().UnixMilli(),
		CPUUsage:           c.getCPUUsage(),
		MemoryTotal:        c.getMemoryTotal(),
		MemoryUsed:         c.getMemoryUsed(),
		MemoryUsagePercent: c.getMemoryUsagePercent(),
		ActiveConnections:  c.getActiveConnections(),
		NumGoroutines:      runtime.NumGoroutine(),
	}
}

func (c *Collector) getCPUUsage() float64 {
	file, err := os.Open("/proc/stat")
	if err != nil {
		// Fallback for non-Linux systems
		var m runtime.MemStats
		runtime.ReadMemStats(&m)
		return float64(m.NumGC % 100)
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	if scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "cpu ") {
			fields := strings.Fields(line)
			if len(fields) < 5 {
				return 0
			}

			var total uint64
			var idle uint64

			for i := 1; i < len(fields); i++ {
				val, _ := strconv.ParseUint(fields[i], 10, 64)
				total += val
				if i == 4 {
					idle = val
				}
			}

			if c.prevTotal == 0 {
				c.prevTotal = total
				c.prevIdle = idle
				return 0
			}

			totalDiff := float64(total - c.prevTotal)
			idleDiff := float64(idle - c.prevIdle)

			c.prevTotal = total
			c.prevIdle = idle

			if totalDiff == 0 {
				return 0
			}

			return (1 - idleDiff/totalDiff) * 100
		}
	}
	return 0
}

func (c *Collector) getMemoryTotal() uint64 {
	val := getMemInfo("MemTotal")
	if val == 0 {
		var m runtime.MemStats
		runtime.ReadMemStats(&m)
		return m.Sys
	}
	return val
}

func (c *Collector) getMemoryUsed() uint64 {
	total := getMemInfo("MemTotal")
	if total == 0 {
		var m runtime.MemStats
		runtime.ReadMemStats(&m)
		return m.Alloc
	}
	available := getMemInfo("MemAvailable")
	if available == 0 {
		free := getMemInfo("MemFree")
		buffers := getMemInfo("Buffers")
		cached := getMemInfo("Cached")
		available = free + buffers + cached
	}
	return total - available
}

func (c *Collector) getMemoryUsagePercent() float64 {
	total := c.getMemoryTotal()
	used := c.getMemoryUsed()
	if total == 0 {
		return 0
	}
	return float64(used) / float64(total) * 100
}

func getMemInfo(key string) uint64 {
	file, err := os.Open("/proc/meminfo")
	if err != nil {
		return 0
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, key+":") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				val, _ := strconv.ParseUint(fields[1], 10, 64)
				return val * 1024
			}
		}
	}
	return 0
}

func (c *Collector) getActiveConnections() int {
	count := 0

	tcpFile, err := os.Open("/proc/net/tcp")
	if err == nil {
		scanner := bufio.NewScanner(tcpFile)
		for scanner.Scan() {
			count++
		}
		tcpFile.Close()
		if count > 0 {
			count--
		}
	}

	if count <= 0 {
		addrs, _ := net.InterfaceAddrs()
		count = len(addrs)
	}

	return count
}