package pool

import "time"

type Config struct {
	MaxConnsPerHost   int
	MaxIdleConns      int
	IdleTimeout       time.Duration
	HealthCheckPeriod time.Duration
	DNSRefreshPeriod  time.Duration
	ConnectTimeout    time.Duration
	RequestTimeout    time.Duration
}

func DefaultConfig() *Config {
	return &Config{
		MaxConnsPerHost:   100,
		MaxIdleConns:      50,
		IdleTimeout:       60 * time.Second,
		HealthCheckPeriod: 10 * time.Second,
		DNSRefreshPeriod:  30 * time.Second,
		ConnectTimeout:    5 * time.Second,
		RequestTimeout:    30 * time.Second,
	}
}
