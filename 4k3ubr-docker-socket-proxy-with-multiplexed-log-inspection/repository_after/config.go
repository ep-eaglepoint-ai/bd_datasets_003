package main

import (
	"regexp"
)

// Config holds the configuration for the auditor
type Config struct {
	SensitivePatterns []SensitivePattern
}

// SensitivePattern represents a pattern to detect in logs
type SensitivePattern struct {
	Name  string
	Regex *regexp.Regexp
}

// LoadConfig loads the default configuration with sensitive patterns
func LoadConfig() *Config {
	return &Config{
		SensitivePatterns: []SensitivePattern{
			{
				Name:  "AWS Access Key",
				Regex: regexp.MustCompile(`AKIA[0-9A-Z]{16}`),
			},
			{
				Name:  "Generic API Key",
				Regex: regexp.MustCompile(`(?i)api[_-]?key[_-]?[:=]\s*['"]?([a-zA-Z0-9_\-]{20,})['"]?`),
			},
			{
				Name:  "Private Key",
				Regex: regexp.MustCompile(`-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----`),
			},
			{
				Name:  "Email Address",
				Regex: regexp.MustCompile(`[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`),
			},
			{
				Name:  "Bearer Token",
				Regex: regexp.MustCompile(`(?i)bearer\s+[a-zA-Z0-9_\-\.]{20,}`),
			},
			{
				Name:  "Password",
				Regex: regexp.MustCompile(`(?i)password[_-]?[:=]\s*['"]?([a-zA-Z0-9_\-!@#$%^&*]{8,})['"]?`),
			},
		},
	}
}