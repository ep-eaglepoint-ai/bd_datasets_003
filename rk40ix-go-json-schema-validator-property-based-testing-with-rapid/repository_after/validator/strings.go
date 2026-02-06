package validator

import (
	"regexp"
	"time"
	"unicode/utf8"
)

var (
	emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
	uriRegex   = regexp.MustCompile(`^https?://[^\s]+$`)
	uuidRegex  = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
)

func validateString(schema *Schema, data interface{}, path string) error {
	str, ok := data.(string)
	if !ok {
		return &ValidationError{Path: path, Message: "expected string"}
	}

	runeLen := utf8.RuneCountInString(str)
	if schema.MinLength != nil && runeLen < *schema.MinLength {
		return &ValidationError{Path: path, Message: "string too short"}
	}

	if schema.MaxLength != nil && runeLen > *schema.MaxLength {
		return &ValidationError{Path: path, Message: "string too long"}
	}

	if schema.Pattern != "" {
		matched, err := regexp.MatchString(schema.Pattern, str)
		if err != nil {
			return &ValidationError{Path: path, Message: "invalid regex pattern"}
		}
		if !matched {
			return &ValidationError{Path: path, Message: "string does not match pattern"}
		}
	}

	if schema.Format != "" {
		if err := validateFormat(schema.Format, str, path); err != nil {
			return err
		}
	}

	return nil
}

func validateFormat(format, str, path string) error {
	switch format {
	case "email":
		if !emailRegex.MatchString(str) {
			return &ValidationError{Path: path, Message: "invalid email format"}
		}
	case "uri":
		if !uriRegex.MatchString(str) {
			return &ValidationError{Path: path, Message: "invalid uri format"}
		}
	case "uuid":
		if !uuidRegex.MatchString(str) {
			return &ValidationError{Path: path, Message: "invalid uuid format"}
		}
	case "date-time":
		if _, err := time.Parse(time.RFC3339, str); err != nil {
			return &ValidationError{Path: path, Message: "invalid date-time format"}
		}
	}
	return nil
}
