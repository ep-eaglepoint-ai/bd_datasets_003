package types


type LogBatchRequest struct {
	Logs []LogEntry `json:"logs" validate:"required,dive"`
}


type LogEntry struct {
	Timestamp  int64       `json:"timestamp" validate:"required"`
	CustomerID string      `json:"customer_id" validate:"required"`
	StatusCode int         `json:"status_code" validate:"required,min=100,max=599"`
	BytesSent  int64       `json:"bytes_sent" validate:"required,min=0"`
	IP         string      `json:"ip" validate:"required,ip"`
	GeoIP      interface{} `json:"geoip,omitempty"` 
}

type BackpressureResponse struct {
	Error       string  `json:"error"`
	RetryAfter  int     `json:"retry_after_seconds"`
	Utilization float64 `json:"buffer_utilization"`
	Message     string  `json:"message"`
}


type ErrorResponse struct {
	Error   string `json:"error"`
	Code    string `json:"code,omitempty"`
	Message string `json:"message,omitempty"`
}

type SuccessResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Message string      `json:"message,omitempty"`
}


type PaginatedResponse struct {
	Data       interface{} `json:"data"`
	Page       int         `json:"page"`
	PageSize   int         `json:"page_size"`
	TotalCount int64       `json:"total_count"`
	TotalPages int         `json:"total_pages"`
}


type EventsRequest struct {
	Events []EventPayload `json:"events"`
}


type EventPayload struct {
	Timestamp     int64   `json:"timestamp"`
	ClientIP      string  `json:"client_ip"`
	EdgeLocation  string  `json:"edge_location"`
	RequestPath   string  `json:"request_path"`
	HTTPMethod    string  `json:"http_method"`
	StatusCode    int     `json:"status_code"`
	BytesSent     int64   `json:"bytes_sent"`
	BytesReceived int64   `json:"bytes_received"`
	ResponseTime  float64 `json:"response_time_ms"`
	UserAgent     string  `json:"user_agent"`
	Referer       string  `json:"referer"`
	CacheStatus   string  `json:"cache_status"`
}


type StatsQuery struct {
	StartTime   string `query:"start_time"`
	EndTime     string `query:"end_time"`
	Granularity string `query:"granularity"` 
	GroupBy     string `query:"group_by"` 
}
