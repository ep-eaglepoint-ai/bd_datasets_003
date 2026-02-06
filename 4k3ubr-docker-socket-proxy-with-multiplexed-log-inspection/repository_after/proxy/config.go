package proxy

import (
	"encoding/json"
	"fmt"
	"os"
	"regexp"
)

type Config struct {
	SensitivePatterns []SensitivePattern `json:"patterns"`
	MaxLogSizeMB      int                `json:"max_log_size_mb"`
	MaxLogFiles       int                `json:"max_log_files"`
}

type SensitivePattern struct {
	Name     string `json:"name"`
	Pattern  string `json:"pattern"`
	Severity string `json:"severity"` // NEW: Configurable severity
	Regex    *regexp.Regexp
}

func (sp *SensitivePattern) UnmarshalJSON(data []byte) error {
	type Alias SensitivePattern
	aux := &struct {
		*Alias
	}{
		Alias: (*Alias)(sp),
	}
	if err := json.Unmarshal(data, &aux); err != nil {
		return err
	}

	// Default severity if not specified
	if sp.Severity == "" {
		sp.Severity = "MEDIUM"
	}

	regex, err := regexp.Compile(sp.Pattern)
	if err != nil {
		return fmt.Errorf("invalid regex: %v", err)
	}
	sp.Regex = regex
	return nil
}

func LoadConfig() (*Config, error) {
	configPath := os.Getenv("AUDIT_CONFIG_PATH")
	if configPath == "" {
		configPath = "audit-config.json"
	}

	if _, err := os.Stat(configPath); err == nil {
		return loadFromFile(configPath)
	}

	return getDefaultConfig(), nil
}

func loadFromFile(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var config Config
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, err
	}

	// Set defaults
	if config.MaxLogSizeMB == 0 {
		config.MaxLogSizeMB = 100
	}
	if config.MaxLogFiles == 0 {
		config.MaxLogFiles = 5
	}

	return &config, nil
}

func getDefaultConfig() *Config {
	patterns := []SensitivePattern{
		{
			Name:     "AWS Access Key",
			Pattern:  `AKIA[0-9A-Z]{16}`,
			Severity: "CRITICAL",
			Regex:    regexp.MustCompile(`AKIA[0-9A-Z]{16}`),
		},
		{
			Name:     "Generic API Key",
			Pattern:  `(?i)api[_-]?key[_-]?[:=]\s*['"]?([a-zA-Z0-9_\-]{20,})['"]?`,
			Severity: "HIGH",
			Regex:    regexp.MustCompile(`(?i)api[_-]?key[_-]?[:=]\s*['"]?([a-zA-Z0-9_\-]{20,})['"]?`),
		},
		{
			Name:     "Private Key",
			Pattern:  `-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----`,
			Severity: "CRITICAL",
			Regex:    regexp.MustCompile(`-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----`),
		},
		{
			Name:     "Email Address",
			Pattern:  `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`,
			Severity: "LOW",
			Regex:    regexp.MustCompile(`[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`),
		},
		{
			Name:     "Bearer Token",
			Pattern:  `(?i)bearer\s+[a-zA-Z0-9_\-\.]{20,}`,
			Severity: "HIGH",
			Regex:    regexp.MustCompile(`(?i)bearer\s+[a-zA-Z0-9_\-\.]{20,}`),
		},
		{
			Name:     "Password",
			Pattern:  `(?i)password[_-]?[:=]\s*['"]?([a-zA-Z0-9_\-!@#$%^&*]{8,})['"]?`,
			Severity: "MEDIUM",
			Regex:    regexp.MustCompile(`(?i)password[_-]?[:=]\s*['"]?([a-zA-Z0-9_\-!@#$%^&*]{8,})['"]?`),
		},
	}

	return &Config{
		SensitivePatterns: patterns,
		MaxLogSizeMB:      100,
		MaxLogFiles:       5,
	}
}