package config

// Config holds all application configuration
type Config struct {
	// Server
	Environment string
	ServerPort  string
	LogLevel    string

	// ClickHouse
	ClickHouseHost     string
	ClickHousePort     int
	ClickHouseDatabase string
	ClickHouseUser     string
	ClickHousePassword string
	ClickHouseTable    string

	// GeoIP
	GeoIPDatabasePath string

	// Performance
	BatchSize        int
	FlushInterval    int 
	WorkerCount      int
	MaxProcs         int 
	TargetRatePerSec int 
}


func Load() *Config {
	return &Config{
		// Server
		Environment: "development",
		ServerPort:  "8080",
		LogLevel:    "info",

		// ClickHouse
		ClickHouseHost:     "localhost",
		ClickHousePort:     9000,
		ClickHouseDatabase: "cdn_analytics",
		ClickHouseUser:     "default",
		ClickHousePassword: "",
		ClickHouseTable:    "cdn_logs",

		// GeoIP
		GeoIPDatabasePath: "/data/geoip/GeoLite2-City.mmdb",

		// Performance
		BatchSize:        1000,
		FlushInterval:    5,
		WorkerCount:      4,
		MaxProcs:         2,
		TargetRatePerSec: 8000,
	}
}
