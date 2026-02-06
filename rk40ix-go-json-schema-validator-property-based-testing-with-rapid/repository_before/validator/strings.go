package validator

import (
	"regexp"
)

var (
	emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
	uriRegex   = regexp.MustCompile(`^https?://[^\s/$.?#].[^\s]*$`)
	uuidRegex  = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
)

func validateString(schema *Schema, data interface{}, path string) error {
	str, ok := data.(string)
	if !ok {
		return &ValidationError{Path: path, Message: "expected string"}
	}

	if schema.MinLength != nil && len(str) < *schema.MinLength {
		return &ValidationError{Path: path, Message: "string too short"}
	}

	if schema.MaxLength != nil && len(str) > *schema.MaxLength {
		return &ValidationError{Path: path, Message: "string too long"}
	}

	if schema.Pattern != "" {
		matched, err := regexp.MatchString(schema.Pattern, str)
		if err != nil || !matched {
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
	}
	return nil
}
