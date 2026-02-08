package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/aggregator"
	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/clickhouse"
	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/config"
	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/geoip"
	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/tuning"
	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/types"
	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/workers"
)


type Service struct {
	cfg    *config.Config
	logger *slog.Logger

	workerPool  *workers.WorkerPool
	geoEnricher *geoip.Enricher


	aggregator *aggregator.SlidingWindowAggregator


	batchInserter *clickhouse.BatchInserter


	queryService clickhouse.QueryService


	rateMonitor *tuning.RateMonitor


	eventsProcessed atomic.Int64
	eventsQueued    atomic.Int64

	buffer          chan *types.LogEntry
	bufferSize      int
	bufferThreshold float64


	mu      sync.RWMutex
	tenants map[string]*TenantStats


	eventCounter atomic.Int64
}

const (

	DefaultBufferSize     = 10000 
	BackpressureThreshold = 0.90  
	RetryAfterSeconds     = 5    
)

// TenantStats holds per-tenant statistics
type TenantStats struct {
	TenantID        string    `json:"tenant_id"`
	TotalEvents     int64     `json:"total_events"`
	TotalBytes      int64     `json:"total_bytes"`
	LastEventTime   time.Time `json:"last_event_time"`
	UniqueCountries int       `json:"unique_countries"`
}


type Option func(*serviceOptions)

type serviceOptions struct {
	connector clickhouse.Connector
}


func WithConnector(c clickhouse.Connector) Option {
	return func(o *serviceOptions) { o.connector = c }
}


func New(cfg *config.Config, logger *slog.Logger, opts ...Option) (*Service, error) {
	var so serviceOptions
	for _, o := range opts {
		o(&so)
	}


	geoConfig := geoip.DefaultConfig()

	var enricher workers.GeoIPEnricher
	var geoEnricher *geoip.Enricher

	if cfg.Environment == "development" || cfg.Environment == "test" {
		logger.Info("Using mock GeoIP enricher for development")
		enricher = geoip.NewMockEnricher(50 * time.Microsecond)
	} else {
		var err error
		geoEnricher, err = geoip.NewEnricher(geoConfig, logger)
		if err != nil {
			logger.Warn("Failed to initialize GeoIP enricher, using mock", "error", err)
			enricher = geoip.NewMockEnricher(50 * time.Microsecond)
		} else {
			enricher = geoEnricher
		}
	}

	workerConfig := workers.DefaultConfig()
	workerConfig.WorkerCount = cfg.WorkerCount
	workerPool := workers.NewWorkerPool(workerConfig, logger, enricher)

	agg := aggregator.NewSlidingWindowAggregator(logger)

	batchCfg := clickhouse.DefaultBatchConfig()
	batchCfg.BatchSize = cfg.BatchSize
	batchCfg.FlushInterval = time.Duration(cfg.FlushInterval) * time.Second

	var conn clickhouse.Connector
	if so.connector != nil {
		conn = so.connector
		logger.Info("Using real ClickHouse connector for batch inserter")
	} else {
		conn = clickhouse.NewMockConnector()
		logger.Info("Using mock ClickHouse connector (no DB)")
	}
	batchIns := clickhouse.NewBatchInserter(batchCfg, conn, logger)

	queryService := clickhouse.NewClickHouseQueryService(conn)

	rtCfg := tuning.DefaultRuntimeConfig()
	if cfg.MaxProcs > 0 {
		rtCfg.MaxProcs = cfg.MaxProcs
	}
	if cfg.TargetRatePerSec > 0 {
		rtCfg.TargetRatePerSec = cfg.TargetRatePerSec
	}
	tuning.ApplyGOMAXPROCS(rtCfg, logger)
	rateMonitor := tuning.NewRateMonitor(rtCfg, logger)

	s := &Service{
		cfg:             cfg,
		logger:          logger,
		workerPool:      workerPool,
		geoEnricher:     geoEnricher,
		aggregator:      agg,
		batchInserter:   batchIns,
		queryService:    queryService,
		rateMonitor:     rateMonitor,
		tenants:         make(map[string]*TenantStats),
		buffer:          make(chan *types.LogEntry, DefaultBufferSize),
		bufferSize:      DefaultBufferSize,
		bufferThreshold: BackpressureThreshold,
	}

	workerPool.OnResult(func(entry *types.LogEntry, tenantID string) {
		s.eventsProcessed.Add(1)

		now := time.Now()
		agg.Record(tenantID, now, entry.StatusCode, entry.BytesSent)

		eventID := fmt.Sprintf("%s-%d", tenantID, s.eventCounter.Add(1))
		if err := batchIns.AppendEntry(entry, eventID); err != nil {
			logger.Warn("Failed to append to batch inserter",
				"tenant_id", tenantID,
				"error", err,
			)
		}
	})

	workerPool.Start()

	logger.Info("ingestion service initialized",
		"buffer_size", DefaultBufferSize,
		"backpressure_threshold", BackpressureThreshold,
		"worker_count", cfg.WorkerCount,
		"worker_pool", "enabled",
	)

	return s, nil
}

func (s *Service) IsReady() bool {
	return s.IsClickHouseReady() && s.IsGeoIPReady()
}

func (s *Service) IsClickHouseReady() bool {
	if s.batchInserter != nil {
		return s.batchInserter.IsHealthy(context.Background())
	}
	return true
}

func (s *Service) IsGeoIPReady() bool {
	if s.geoEnricher != nil {
		// Check if enricher has active readers
		metrics := s.geoEnricher.GetMetrics()
		if activeReaders, ok := metrics["active_readers"]; ok {
			return activeReaders.(int) > 0
		}
	}
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

		if err := s.workerPool.SubmitJob(entry, tenantID); err != nil {
			s.logger.Warn("Failed to submit event to worker pool",
				"tenant_id", tenantID,
				"error", err,
			)

			s.eventsProcessed.Add(int64(count))
			return count, nil
		}
	}

	return count, nil
}

func (s *Service) IngestLogs(ctx context.Context, tenantID string, logs []types.LogEntry) error {

	if s.IsBackpressureTriggered() {
		return errors.New("backpressure_triggered")
	}

	count := len(logs)

	if s.rateMonitor != nil && s.rateMonitor.RecordEvents(count) {
		s.rateMonitor.RecordDropped(count)
		return errors.New("rate_limited")
	}

	s.eventsQueued.Add(int64(count))

	for _, log := range logs {
		logCopy := log
		logCopy.CustomerID = tenantID

		if err := s.workerPool.SubmitJob(&logCopy, tenantID); err != nil {
			s.logger.Error("Failed to submit job to worker pool",
				"tenant_id", tenantID,
				"error", err,
			)
			return err
		}
	}

	s.updateTenantStats(tenantID, int64(count))

	return nil
}

func (s *Service) IsBackpressureTriggered() bool {
	return s.GetBufferUtilization() >= s.bufferThreshold
}

func (s *Service) GetBufferUtilization() float64 {
	return s.workerPool.GetQueueUtilization()
}

func (s *Service) Shutdown(ctx context.Context) error {
	s.logger.Info("Shutting down service")

	if err := s.workerPool.Shutdown(30 * time.Second); err != nil {
		s.logger.Error("Worker pool shutdown failed", "error", err)
	}

	if err := s.batchInserter.Shutdown(30 * time.Second); err != nil {
		s.logger.Error("Batch inserter shutdown failed", "error", err)
	}

	if s.geoEnricher != nil {
		if err := s.geoEnricher.Close(); err != nil {
			s.logger.Error("GeoIP enricher close failed", "error", err)
		}
	}

	s.logger.Info("Service shutdown completed")
	return nil
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
	result := s.aggregator.Query(tenantID, 15)
	result.Finalize()

	return map[string]interface{}{
		"tenant_id":           tenantID,
		"window_minutes":      15,
		"total_requests":      result.TotalRequests,
		"total_bytes":         result.TotalBytes,
		"requests_per_second": result.RequestsPerSecond,
		"status_2xx":          result.Status2xx,
		"status_3xx":          result.Status3xx,
		"status_4xx":          result.Status4xx,
		"status_5xx":          result.Status5xx,
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

func (s *Service) QueryAggregator(customerID string, minutes int) aggregator.QueryResult {
	return s.aggregator.Query(customerID, minutes)
}

func (s *Service) QueryAllAggregator(minutes int) map[string]aggregator.QueryResult {
	return s.aggregator.QueryAll(minutes)
}

func (s *Service) QueryCustomerMetrics(ctx context.Context, customerID string, minutes int) (*clickhouse.CustomerMetricsSummary, error) {
	start := time.Now()

	aggResult := s.aggregator.Query(customerID, minutes)
	aggResult.Finalize()

	summary := &clickhouse.CustomerMetricsSummary{
		CustomerID:        customerID,
		WindowMinutes:     minutes,
		TotalRequests:     aggResult.TotalRequests,
		TotalBytes:        aggResult.TotalBytes,
		RequestsPerSecond: aggResult.RequestsPerSecond,
		StatusBreakdown: clickhouse.StatusBreakdown{
			Status2xx: aggResult.Status2xx,
			Status3xx: aggResult.Status3xx,
			Status4xx: aggResult.Status4xx,
			Status5xx: aggResult.Status5xx,
		},
	}

	if summary.TotalRequests > 0 {
		errorCount := summary.StatusBreakdown.Status4xx + summary.StatusBreakdown.Status5xx
		summary.ErrorRate = float64(errorCount) / float64(summary.TotalRequests) * 100.0
		summary.StatusBreakdown.ErrorPct = summary.ErrorRate
	}

	summary.QueryTimeMs = time.Since(start).Milliseconds()

	return summary, nil
}

func (s *Service) GetRateMonitor() *tuning.RateMonitor {
	return s.rateMonitor
}

func (s *Service) GetAggregator() *aggregator.SlidingWindowAggregator {
	return s.aggregator
}

func (s *Service) GetBatchInserter() *clickhouse.BatchInserter {
	return s.batchInserter
}

func (s *Service) GetMetrics() map[string]interface{} {
	metrics := map[string]interface{}{
		"events_processed":    s.eventsProcessed.Load(),
		"events_queued":       s.eventsQueued.Load(),
		"tenants_count":       len(s.tenants),
		"worker_count":        s.cfg.WorkerCount,
		"batch_size":          s.cfg.BatchSize,
		"backpressure_active": s.IsBackpressureTriggered(),
	}
	workerMetrics := s.workerPool.GetMetrics()
	for k, v := range workerMetrics {
		metrics["worker_pool_"+k] = v
	}
	aggMetrics := s.aggregator.GetMetrics()
	for k, v := range aggMetrics {
		metrics["aggregator_"+k] = v
	}
	batchMetrics := s.batchInserter.GetMetrics()
	for k, v := range batchMetrics {
		metrics["batch_"+k] = v
	}
	if s.geoEnricher != nil {
		geoMetrics := s.geoEnricher.GetMetrics()
		for k, v := range geoMetrics {
			metrics["geoip_"+k] = v
		}
	}
	if s.rateMonitor != nil {
		rmMetrics := s.rateMonitor.GetMetrics()
		for k, v := range rmMetrics {
			metrics["rate_"+k] = v
		}
	}

	return metrics
}
