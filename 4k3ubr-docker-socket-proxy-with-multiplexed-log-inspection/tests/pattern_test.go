package tests

import (
	"regexp"
	"testing"
)

// TestSensitivePatterns tests all the regex patterns
func TestSensitivePatterns(t *testing.T) {
	tests := []struct {
		name     string
		pattern  string
		testText string
		should   bool
	}{
		{
			"AWS Key Match",
			`AKIA[0-9A-Z]{16}`,
			"aws_access_key: AKIAIOSFODNN7EXAMPLE",
			true,
		},
		{
			"AWS Key No Match",
			`AKIA[0-9A-Z]{16}`,
			"normal log line",
			false,
		},
		{
			"Email Match",
			`[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`,
			"Send to admin@example.com for help",
			true,
		},
		{
			"Private Key Match",
			`-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----`,
			"-----BEGIN RSA PRIVATE KEY-----\nMIIE...",
			true,
		},
		{
			"Bearer Token Match",
			`(?i)bearer\s+[a-zA-Z0-9_\-\.]{20,}`,
			"Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
			true,
		},
		{
			"API Key Match",
			`(?i)api[_-]?key[_-]?[:=]\s*['"]?([a-zA-Z0-9_\-]{20,})['"]?`,
			"api_key=sk_live_abcdefghij1234567890",
			true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			re := regexp.MustCompile(tt.pattern)
			matched := re.MatchString(tt.testText)

			if matched != tt.should {
				t.Errorf("Pattern '%s' on text '%s': expected match=%v, got match=%v",
					tt.pattern, tt.testText, tt.should, matched)
			}
		})
	}
}

// TestRedaction tests redaction logic
func TestRedaction(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"AKIAIOSFODNN7EXAMPLE", "AK***LE"},
		{"short", "***"},
		{"user@example.com", "us***om"},
		{"verylongsecretkey12345", "ve***45"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			var result string
			if len(tt.input) <= 6 {
				result = "***"
			} else {
				result = tt.input[:2] + "***" + tt.input[len(tt.input)-2:]
			}

			if result != tt.expected {
				t.Errorf("Redaction of '%s': expected '%s', got '%s'",
					tt.input, tt.expected, result)
			}
		})
	}
}