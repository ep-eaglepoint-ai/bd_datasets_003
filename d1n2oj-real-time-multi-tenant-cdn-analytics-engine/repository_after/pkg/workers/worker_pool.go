package workers

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/types"
)

// Job represents a log processing job
type Job struct {
	LogEntry  *types.LogEntry
	TenantID  string
	Timestamp time.Time
}

// Result represents the result of processing a job
type Result struct {
	Job       *Job
	Error     error
	Processed bool
	Duration  time.Duration
}

// ResultHandler is called for every successfully processed job.
// Implementations must be safe for concurrent invocation.
type ResultHandler func(entry *types.LogEntry, tenantID string)

// WorkerPool manages a pool of workers for processing log entries
type WorkerPool struct {
	workerCount int
	jobQueue    chan *Job
	resultQueue chan *Result
	workers     []*Worker

	// Graceful shutdown
	ctx     context.Context
	cancel  context.CancelFunc
	wg      sync.WaitGroup
	stopped atomic.Bool

	// Metrics
	jobsQueued     int64
	jobsProcessed  int64
	jobsInProgress int64

	// Dependencies
	logger         *slog.Logger
	enricher       GeoIPEnricher
	resultHandlers []ResultHandler

	mu sync.RWMutex
}

// Worker represents a single worker in the pool
type Worker struct {
	id          int
	jobQueue    chan *Job
	resultQueue chan *Result
	enricher    GeoIPEnricher
	logger      *slog.Logger
}

// GeoIPEnricher interface for geo-IP enrichment
type GeoIPEnricher interface {
	Enrich(logEntry *types.LogEntry) error
	Close() error
}

// WorkerPoolConfig holds configuration for the worker pool
type WorkerPoolConfig struct {
	WorkerCount     int
	JobQueueSize    int
	ResultQueueSize int
}

// DefaultConfig returns default configuration
func DefaultConfig() *WorkerPoolConfig {
	return &WorkerPoolConfig{
		WorkerCount:     4,
		JobQueueSize:    10000,
		ResultQueueSize: 1000,
	}
}

// NewWorkerPool creates a new worker pool
func NewWorkerPool(config *WorkerPoolConfig, logger *slog.Logger, enricher GeoIPEnricher) *WorkerPool {
	ctx, cancel := context.WithCancel(context.Background())

	pool := &WorkerPool{
		workerCount: config.WorkerCount,
		jobQueue:    make(chan *Job, config.JobQueueSize),
		resultQueue: make(chan *Result, config.ResultQueueSize),
		ctx:         ctx,
		cancel:      cancel,
		logger:      logger,
		enricher:    enricher,
	}

	// Create workers
	pool.workers = make([]*Worker, config.WorkerCount)
	for i := 0; i < config.WorkerCount; i++ {
		pool.workers[i] = &Worker{
			id:          i,
			jobQueue:    pool.jobQueue,
			resultQueue: pool.resultQueue,
			enricher:    enricher,
			logger:      logger,
		}
	}

	return pool
}

// OnResult registers a handler that is called for every successfully
// enriched log entry. Must be called before Start.
func (wp *WorkerPool) OnResult(h ResultHandler) {
	wp.resultHandlers = append(wp.resultHandlers, h)
}

// Start starts all workers in the pool
func (wp *WorkerPool) Start() {
	wp.logger.Info("Starting worker pool",
		"worker_count", wp.workerCount,
		"job_queue_size", cap(wp.jobQueue),
		"result_queue_size", cap(wp.resultQueue),
	)

	// Start workers
	for _, worker := range wp.workers {
		wp.wg.Add(1)
		go func(w *Worker) {
			defer wp.wg.Done()
			w.run(wp.ctx)
		}(worker)
	}

	// Start result processor
	wp.wg.Add(1)
	go func() {
		defer wp.wg.Done()
		wp.processResults()
	}()
}

// SubmitJob submits a job to the worker pool
func (wp *WorkerPool) SubmitJob(logEntry *types.LogEntry, tenantID string) error {
	if wp.stopped.Load() {
		return ErrPoolStopped
	}

	job := &Job{
		LogEntry:  logEntry,
		TenantID:  tenantID,
		Timestamp: time.Now(),
	}

	select {
	case wp.jobQueue <- job:
		wp.mu.Lock()
		wp.jobsQueued++
		wp.mu.Unlock()
		return nil
	case <-wp.ctx.Done():
		return wp.ctx.Err()
	default:
		return ErrQueueFull
	}
}

// GetQueueUtilization returns the current queue utilization (0.0 to 1.0)
func (wp *WorkerPool) GetQueueUtilization() float64 {
	return float64(len(wp.jobQueue)) / float64(cap(wp.jobQueue))
}

// GetMetrics returns worker pool metrics
func (wp *WorkerPool) GetMetrics() map[string]interface{} {
	wp.mu.RLock()
	defer wp.mu.RUnlock()

	return map[string]interface{}{
		"worker_count":      wp.workerCount,
		"jobs_queued":       wp.jobsQueued,
		"jobs_processed":    wp.jobsProcessed,
		"jobs_in_progress":  wp.jobsInProgress,
		"queue_utilization": wp.GetQueueUtilization(),
		"queue_size":        len(wp.jobQueue),
		"queue_capacity":    cap(wp.jobQueue),
	}
}

// Shutdown gracefully shuts down the worker pool
func (wp *WorkerPool) Shutdown(timeout time.Duration) error {
	wp.logger.Info("Shutting down worker pool", "timeout", timeout)

	// Stop accepting new jobs
	wp.stopped.Store(true)
	wp.cancel()

	// Close job queue to signal workers
	close(wp.jobQueue)

	// Wait for workers to finish with timeout
	done := make(chan struct{})
	go func() {
		wp.wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		wp.logger.Info("Worker pool shutdown completed")
		return nil
	case <-time.After(timeout):
		wp.logger.Warn("Worker pool shutdown timed out")
		return ErrShutdownTimeout
	}
}

// run executes the worker main loop
func (w *Worker) run(ctx context.Context) {
	w.logger.Debug("Worker started", "worker_id", w.id)

	for {
		select {
		case job, ok := <-w.jobQueue:
			if !ok {
				// Queue closed, worker should exit
				w.logger.Debug("Worker shutting down", "worker_id", w.id)
				return
			}

			result := w.processJob(job)

			select {
			case w.resultQueue <- result:
				// Result queued successfully
			case <-ctx.Done():
				// Context cancelled, worker should exit
				return
			default:
				// Result queue full, log warning but continue
				w.logger.Warn("Result queue full, dropping result", "worker_id", w.id)
			}

		case <-ctx.Done():
			w.logger.Debug("Worker context cancelled", "worker_id", w.id)
			return
		}
	}
}

// processJob processes a single job
func (w *Worker) processJob(job *Job) *Result {
	start := time.Now()
	result := &Result{
		Job:       job,
		Processed: false,
	}

	// Enrich log entry with geo-IP data
	if err := w.enricher.Enrich(job.LogEntry); err != nil {
		result.Error = err
		w.logger.Error("Geo-IP enrichment failed",
			"worker_id", w.id,
			"tenant_id", job.TenantID,
			"error", err,
		)
	} else {
		result.Processed = true
		w.logger.Debug("Job processed successfully",
			"worker_id", w.id,
			"tenant_id", job.TenantID,
		)
	}

	result.Duration = time.Since(start)
	return result
}

// processResults handles processed job results
func (wp *WorkerPool) processResults() {
	wp.logger.Debug("Result processor started")

	for {
		select {
		case result, ok := <-wp.resultQueue:
			if !ok {
				wp.logger.Debug("Result processor shutting down")
				return
			}

			wp.handleResult(result)

		case <-wp.ctx.Done():
			wp.logger.Debug("Result processor context cancelled")
			return
		}
	}
}

// handleResult processes a single result
func (wp *WorkerPool) handleResult(result *Result) {
	wp.mu.Lock()
	wp.jobsProcessed++
	wp.mu.Unlock()

	if result.Error != nil {
		wp.logger.Error("Job processing failed",
			"tenant_id", result.Job.TenantID,
			"error", result.Error,
			"duration", result.Duration,
		)
	} else {
		wp.logger.Debug("Job completed successfully",
			"tenant_id", result.Job.TenantID,
			"duration", result.Duration,
		)

		// Forward to all registered result handlers (aggregator, batch inserter, etc.)
		for _, h := range wp.resultHandlers {
			h(result.Job.LogEntry, result.Job.TenantID)
		}
	}
}

// Error definitions
var (
	ErrQueueFull       = errors.New("job queue is full")
	ErrPoolStopped     = errors.New("worker pool is stopped")
	ErrShutdownTimeout = errors.New("shutdown timed out")
)
