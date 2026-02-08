package geoip

import (
	"errors"
	"fmt"
	"log/slog"
	"net"
	"os"
	"sync"
	"sync/atomic"
	"time"

	"github.com/oschwald/geoip2-golang"

	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/types"
)

// Enricher provides thread-safe GeoIP enrichment for log entries
type Enricher struct {
	readers    []*geoip2.Reader
	readerMu   sync.RWMutex
	roundRobin int64

	// Configuration
	dbPath     string
	maxReaders int
	readerPool chan *geoip2.Reader

	// Metrics
	enrichments int64
	errors      int64
	totalTime   time.Duration

	logger *slog.Logger
	mu     sync.RWMutex
}

// EnrichmentResult contains the result of geo-IP enrichment
type EnrichmentResult struct {
	Country     string  `json:"country,omitempty"`
	CountryCode string  `json:"country_code,omitempty"`
	City        string  `json:"city,omitempty"`
	Latitude    float64 `json:"latitude,omitempty"`
	Longitude   float64 `json:"longitude,omitempty"`
	ASN         uint    `json:"asn,omitempty"`
	ASNOrg      string  `json:"asn_org,omitempty"`
	Timezone    string  `json:"timezone,omitempty"`
}

// Config holds configuration for the GeoIP enricher
type Config struct {
	DatabasePath  string
	MaxReaders    int
	PoolSize      int
	EnableMetrics bool
}

// DefaultConfig returns default configuration
func DefaultConfig() *Config {
	return &Config{
		DatabasePath:  "/usr/share/GeoIP/GeoLite2-City.mmdb",
		MaxReaders:    10,
		PoolSize:      10,
		EnableMetrics: true,
	}
}


func NewEnricher(config *Config, logger *slog.Logger) (*Enricher, error) {

	if _, err := os.Stat(config.DatabasePath); os.IsNotExist(err) {
		return nil, fmt.Errorf("GeoIP database not found at %s", config.DatabasePath)
	}

	enricher := &Enricher{
		dbPath:     config.DatabasePath,
		maxReaders: config.MaxReaders,
		readerPool: make(chan *geoip2.Reader, config.PoolSize),
		logger:     logger,
	}


	for i := 0; i < config.PoolSize; i++ {
		reader, err := geoip2.Open(config.DatabasePath)
		if err != nil {
			enricher.Close()
			return nil, fmt.Errorf("failed to open GeoIP database: %w", err)
		}

		enricher.readerPool <- reader
		enricher.readers = append(enricher.readers, reader)
	}

	logger.Info("GeoIP enricher initialized",
		"database_path", config.DatabasePath,
		"reader_pool_size", config.PoolSize,
		"max_readers", config.MaxReaders,
	)

	return enricher, nil
}

// Enrich enriches a log entry with geo-IP information
func (e *Enricher) Enrich(logEntry *types.LogEntry) error {
	start := time.Now()
	defer func() {
		e.mu.Lock()
		e.totalTime += time.Since(start)
		e.enrichments++
		e.mu.Unlock()
	}()


	ip := net.ParseIP(logEntry.IP)
	if ip == nil {
		e.mu.Lock()
		e.errors++
		e.mu.Unlock()
		return fmt.Errorf("invalid IP address: %s", logEntry.IP)
	}


	if isPrivateIP(ip) {
		logEntry.GeoIP = &EnrichmentResult{
			Country:     "Private",
			CountryCode: "XX",
			City:        "Private Network",
		}
		return nil
	}


	var reader *geoip2.Reader
	select {
	case reader = <-e.readerPool:

	default:
		e.readerMu.Lock()
		if len(e.readers) < e.maxReaders {
			newReader, err := geoip2.Open(e.dbPath)
			if err != nil {
				e.readerMu.Unlock()
				e.mu.Lock()
				e.errors++
				e.mu.Unlock()
				return fmt.Errorf("failed to create new reader: %w", err)
			}
			e.readers = append(e.readers, newReader)
			reader = newReader
		}
		e.readerMu.Unlock()

		if reader == nil {
			e.mu.Lock()
			e.errors++
			e.mu.Unlock()
			return errors.New("no available readers and maximum readers reached")
		}
	}

	// Return reader to pool when done
	defer func() {
		select {
		case e.readerPool <- reader:

		default:
			
		}
	}()


	record, err := reader.City(ip)
	if err != nil {
		e.mu.Lock()
		e.errors++
		e.mu.Unlock()
		return fmt.Errorf("GeoIP lookup failed: %w", err)
	}


	result := &EnrichmentResult{
		Country:     record.Country.Names["en"],
		CountryCode: record.Country.IsoCode,
		City:        record.City.Names["en"],
		Latitude:    record.Location.Latitude,
		Longitude:   record.Location.Longitude,
		Timezone:    record.Location.TimeZone,
	}

	logEntry.GeoIP = result

	e.logger.Debug("IP enriched successfully",
		"ip", logEntry.IP,
		"country", result.Country,
		"city", result.City,
		"duration_microseconds", time.Since(start).Microseconds(),
	)

	return nil
}


func (e *Enricher) GetMetrics() map[string]interface{} {
	e.mu.RLock()
	defer e.mu.RUnlock()

	avgDuration := time.Duration(0)
	if e.enrichments > 0 {
		avgDuration = e.totalTime / time.Duration(e.enrichments)
	}

	return map[string]interface{}{
		"total_enrichments":         e.enrichments,
		"total_errors":              e.errors,
		"active_readers":            len(e.readers),
		"pooled_readers":            len(e.readerPool),
		"max_readers":               e.maxReaders,
		"avg_duration_microseconds": avgDuration.Microseconds(),
		"total_duration_ms":         e.totalTime.Milliseconds(),
	}
}


func (e *Enricher) Close() error {
	e.readerMu.Lock()
	defer e.readerMu.Unlock()

	var lastErr error


	close(e.readerPool)
	for reader := range e.readerPool {
		if err := reader.Close(); err != nil {
			lastErr = err
		}
	}

	for _, reader := range e.readers {
		if err := reader.Close(); err != nil {
			lastErr = err
		}
	}

	e.readers = nil
	e.logger.Info("GeoIP enricher closed")

	return lastErr
}


func isPrivateIP(ip net.IP) bool {
	privateRanges := []string{
		"10.0.0.0/8",     // Class A
		"172.16.0.0/12",  // Class B
		"192.168.0.0/16", // Class C
		"127.0.0.0/8",    // Loopback
		"169.254.0.0/16", // Link-local
		"::1/128",        // IPv6 loopback
		"fc00::/7",       // IPv6 unique local
		"fe80::/10",      // IPv6 link-local
	}

	for _, cidr := range privateRanges {
		_, network, err := net.ParseCIDR(cidr)
		if err != nil {
			continue
		}

		if network.Contains(ip) {
			return true
		}
	}

	return false
}


type MockEnricher struct {
	enrichments atomic.Int64
	errors      atomic.Int64
	delay       time.Duration
	shouldError atomic.Bool
}


func NewMockEnricher(delay time.Duration) *MockEnricher {
	return &MockEnricher{
		delay: delay,
	}
}

func (m *MockEnricher) Enrich(logEntry *types.LogEntry) error {
	if m.delay > 0 {
		time.Sleep(m.delay)
	}

	if m.shouldError.Load() {
		m.errors.Add(1)
		return errors.New("mock enrichment error")
	}

	m.enrichments.Add(1)

	
	logEntry.GeoIP = &EnrichmentResult{
		Country:     "United States",
		CountryCode: "US",
		City:        "New York",
		Latitude:    40.7128,
		Longitude:   -74.0060,
		ASN:         12345,
		ASNOrg:      "Mock ISP",
		Timezone:    "America/New_York",
	}

	return nil
}


func (m *MockEnricher) Close() error {
	return nil
}

func (m *MockEnricher) SetShouldError(shouldError bool) {
	m.shouldError.Store(shouldError)
}

func (m *MockEnricher) GetMetrics() map[string]interface{} {
	return map[string]interface{}{
		"total_enrichments": m.enrichments.Load(),
		"total_errors":      m.errors.Load(),
		"mock":              true,
	}
}
