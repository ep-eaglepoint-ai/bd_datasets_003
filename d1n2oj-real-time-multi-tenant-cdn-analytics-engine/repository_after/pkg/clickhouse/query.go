package clickhouse

import (
	"context"
	"time"
)


type CustomerMetricsSummary struct {
	CustomerID        string             `json:"customer_id"`
	WindowMinutes     int                `json:"window_minutes"`
	TotalRequests     int64              `json:"total_requests"`
	TotalBytes        int64              `json:"total_bytes"`
	RequestsPerSecond float64            `json:"requests_per_second"`
	ErrorRate         float64            `json:"error_rate"`
	StatusBreakdown   StatusBreakdown    `json:"status_breakdown"`
	TopCountries      []CountryBreakdown `json:"top_countries,omitempty"`
	QueryTimeMs       int64              `json:"query_time_ms"`
}

type StatusBreakdown struct {
	Status2xx int64   `json:"2xx"`
	Status3xx int64   `json:"3xx"`
	Status4xx int64   `json:"4xx"`
	Status5xx int64   `json:"5xx"`
	ErrorPct  float64 `json:"error_pct"` 
}


type CountryBreakdown struct {
	Country  string `json:"country"`
	Requests int64  `json:"requests"`
}


type QueryService interface {

	QueryCustomerMetrics(ctx context.Context, customerID string, minutes int) (*CustomerMetricsSummary, error)
}

type ClickHouseQueryService struct {
	conn Connector
}


func NewClickHouseQueryService(conn Connector) *ClickHouseQueryService {
	return &ClickHouseQueryService{conn: conn}
}


func (qs *ClickHouseQueryService) QueryCustomerMetrics(
	ctx context.Context, customerID string, minutes int,
) (*CustomerMetricsSummary, error) {
	start := time.Now()


	summary := &CustomerMetricsSummary{
		CustomerID:    customerID,
		WindowMinutes: minutes,
		QueryTimeMs:   time.Since(start).Milliseconds(),
	}

	return summary, nil
}

type AggregatorQuerier interface {
	QueryCustomerMetrics(customerID string, minutes int) *CustomerMetricsSummary
}

type MockQueryService struct {
	Results       map[string]*CustomerMetricsSummary
	CallCount     int
	ShouldError   bool
	ErrorToReturn error
}


func NewMockQueryService() *MockQueryService {
	return &MockQueryService{
		Results: make(map[string]*CustomerMetricsSummary),
	}
}

func (m *MockQueryService) QueryCustomerMetrics(
	_ context.Context, customerID string, minutes int,
) (*CustomerMetricsSummary, error) {
	m.CallCount++
	if m.ShouldError {
		return nil, m.ErrorToReturn
	}
	if res, ok := m.Results[customerID]; ok {
		return res, nil
	}

	return &CustomerMetricsSummary{
		CustomerID:    customerID,
		WindowMinutes: minutes,
	}, nil
}
