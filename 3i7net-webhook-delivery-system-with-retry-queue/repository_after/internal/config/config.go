package config

import (
	"os"
	"strconv"
)

type Config struct {
	Port        string
	DatabaseURL string
	RedisURL    string
	WorkerCount int
}

func Load() *Config {
	workerCount := 5
	if wc := os.Getenv("WORKER_COUNT"); wc != "" {
		if n, err := strconv.Atoi(wc); err == nil && n > 0 {
			workerCount = n
		}
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/webhooks?sslmode=disable"
	}

	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379"
	}

	return &Config{
		Port:        port,
		DatabaseURL: dbURL,
		RedisURL:    redisURL,
		WorkerCount: workerCount,
	}
}
