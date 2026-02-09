package service

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/config"
	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/types"
)


type Service struct {
	cfg    *config.Config
	logger *slog.Logger
	eventsProcessed atomic.Int64
	eventsQueued    atomic.Int64
	buffer          chan *types.LogEntry
	bufferSize      int
	bufferThreshold float64
	mu      sync.RWMutex
	tenants map[string]*TenantStats
}

const (
	DefaultBufferSize     = 10000 
	BackpressureThreshold = 0.90 
	RetryAfterSeconds     = 5    
)


type TenantStats struct {
	TenantID        string    `json:"tenant_id"`
	TotalEvents     int64     `json:"total_events"`
	TotalBytes      int64     `json:"total_bytes"`
	LastEventTime   time.Time `json:"last_event_time"`
	UniqueCountries int       `json:"unique_countries"`
}


func New(cfg *config.Config, logger *slog.Logger) *Service {
	s := &Service{
		cfg:             cfg,
		logger:          logger,
		tenants:         make(map[string]*TenantStats),
		buffer:          make(chan *types.LogEntry, DefaultBufferSize),
		bufferSize:      DefaultBufferSize,
		bufferThreshold: BackpressureThreshold,
	}


	for i := 0; i < cfg.WorkerCount; i++ {
		go s.bufferWorker(i)
	}

	logger.Info("ingestion service initialized",
		"buffer_size", DefaultBufferSize,
		"backpressure_threshold", BackpressureThreshold,
		"worker_count", cfg.WorkerCount,
	)

	return s
}

func (s *Service) IsReady() bool {
	return s.IsClickHouseReady() && s.IsGeoIPReady()
}


func (s *Service) IsClickHouseReady() bool {
	return s.buffer != nil && s.GetBufferUtilization() < 1.0
}


func (s *Service) IsGeoIPReady() bool {
	return true 
}

func (s *Service) IngestEvents(ctx context.Context, tenantID string, events []map[string]interface{}) (int, error) {
	count := len(events)
	s.eventsQueued.Add(int64(count))

	s.mu.Lock()
	if _, exists := s.tenants[tenantID]; !exists {
		s.tenants[tenantID] = &TenantStats{
			TenantID: tenantID,
		}
	}
	s.tenants[tenantID].TotalEvents += int64(count)
	s.tenants[tenantID].LastEventTime = time.Now()
	s.mu.Unlock()

	now := time.Now().Unix()
	for _, evt := range events {
		entry := &types.LogEntry{
			CustomerID: tenantID,
			Timestamp:  now,
		}
		if ip, ok := evt["ip"].(string); ok {
			entry.IP = ip
		}
		if sc, ok := evt["status_code"].(float64); ok {
			entry.StatusCode = int(sc)
		}
		if bs, ok := evt["bytes_sent"].(float64); ok {
			entry.BytesSent = int64(bs)
		}

		select {
		case s.buffer <- entry:

		default:
			s.logger.Warn("Buffer full, event dropped", "tenant_id", tenantID)
		}
	}

	return count, nil
}


func (s *Service) IngestLogs(ctx context.Context, tenantID string, logs []types.LogEntry) error {

	if s.IsBackpressureTriggered() {
		return errors.New("backpressure_triggered")
	}

	count := len(logs)
	s.eventsQueued.Add(int64(count))


	for _, log := range logs {
		logCopy := log
		logCopy.CustomerID = tenantID 

		select {
		case s.buffer <- &logCopy:
		
		case <-ctx.Done():
			return ctx.Err()
		default:
	
			return errors.New("buffer_full")
		}
	}

	
	s.updateTenantStats(tenantID, int64(count))

	return nil
}


func (s *Service) IsBackpressureTriggered() bool {
	return s.GetBufferUtilization() >= s.bufferThreshold
}

func (s *Service) GetBufferUtilization() float64 {
	return float64(len(s.buffer)) / float64(s.bufferSize)
}

func (s *Service) bufferWorker(workerID int) {
	s.logger.Debug("buffer worker started", "worker_id", workerID)

	for logEntry := range s.buffer {
		s.processLogEntry(logEntry)
		s.eventsProcessed.Add(1)
	}

	s.logger.Debug("buffer worker stopped", "worker_id", workerID)
}

func (s *Service) processLogEntry(entry *types.LogEntry) {

	if entry.CustomerID == "" || entry.Timestamp == 0 {
		s.logger.Debug("Skipping invalid log entry", "customer_id", entry.CustomerID)
		return
	}
	s.mu.Lock()
	if stats, exists := s.tenants[entry.CustomerID]; exists {
		stats.TotalBytes += entry.BytesSent
	}
	s.mu.Unlock()
}
func (s *Service) updateTenantStats(tenantID string, count int64) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.tenants[tenantID]; !exists {
		s.tenants[tenantID] = &TenantStats{
			TenantID: tenantID,
		}
	}
	s.tenants[tenantID].TotalEvents += count
	s.tenants[tenantID].LastEventTime = time.Now()
}

func (s *Service) GetStats(ctx context.Context, tenantID string) (*TenantStats, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if stats, exists := s.tenants[tenantID]; exists {
		return stats, nil
	}

	return &TenantStats{
		TenantID: tenantID,
	}, nil
}
func (s *Service) GetTrafficData(ctx context.Context, tenantID string) (map[string]interface{}, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if stats, exists := s.tenants[tenantID]; exists {
		return map[string]interface{}{
			"tenant_id":    tenantID,
			"total_events": stats.TotalEvents,
			"total_bytes":  stats.TotalBytes,
			"last_event":   stats.LastEventTime,
		}, nil
	}

	return map[string]interface{}{
		"tenant_id":    tenantID,
		"total_events": int64(0),
		"total_bytes":  int64(0),
	}, nil
}


func (s *Service) ListTenants(ctx context.Context) ([]TenantStats, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	tenants := make([]TenantStats, 0, len(s.tenants))
	for _, t := range s.tenants {
		tenants = append(tenants, *t)
	}

	return tenants, nil
}

func (s *Service) GetMetrics() map[string]interface{} {
	return map[string]interface{}{
		"events_processed":    s.eventsProcessed.Load(),
		"events_queued":       s.eventsQueued.Load(),
		"tenants_count":       len(s.tenants),
		"worker_count":        s.cfg.WorkerCount,
		"batch_size":          s.cfg.BatchSize,
		"buffer_size":         s.bufferSize,
		"buffer_utilization":  s.GetBufferUtilization(),
		"backpressure_active": s.IsBackpressureTriggered(),
	}
}
