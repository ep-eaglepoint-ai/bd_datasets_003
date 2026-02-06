package validator

import (
	"encoding/json"
	"fmt"
)

type Schema struct {
	Type                 string             `json:"type,omitempty"`
	Properties           map[string]*Schema `json:"properties,omitempty"`
	Items                *Schema            `json:"items,omitempty"`
	Required             []string           `json:"required,omitempty"`
	Minimum              *float64           `json:"minimum,omitempty"`
	Maximum              *float64           `json:"maximum,omitempty"`
	MinLength            *int               `json:"minLength,omitempty"`
	MaxLength            *int               `json:"maxLength,omitempty"`
	Pattern              string             `json:"pattern,omitempty"`
	MinItems             *int               `json:"minItems,omitempty"`
	MaxItems             *int               `json:"maxItems,omitempty"`
	UniqueItems          bool               `json:"uniqueItems,omitempty"`
	AdditionalProperties *bool              `json:"additionalProperties,omitempty"`
	Format               string             `json:"format,omitempty"`
	AllOf                []*Schema          `json:"allOf,omitempty"`
	AnyOf                []*Schema          `json:"anyOf,omitempty"`
	OneOf                []*Schema          `json:"oneOf,omitempty"`
	Not                  *Schema            `json:"not,omitempty"`
}

type ValidationError struct {
	Path    string
	Message string
}

func (e *ValidationError) Error() string {
	if e.Path == "" {
		return e.Message
	}
	return fmt.Sprintf("%s: %s", e.Path, e.Message)
}

func Validate(schema *Schema, data interface{}) error {
	return validateValue(schema, data, "")
}

func validateValue(schema *Schema, data interface{}, path string) error {
	if schema == nil {
		return nil
	}

	if len(schema.AllOf) > 0 {
		for _, subSchema := range schema.AllOf {
			if err := validateValue(subSchema, data, path); err != nil {
				return err
			}
		}
	}

	if len(schema.AnyOf) > 0 {
		valid := false
		for _, subSchema := range schema.AnyOf {
			if err := validateValue(subSchema, data, path); err == nil {
				valid = true
				break
			}
		}
		if !valid {
			return &ValidationError{Path: path, Message: "does not match any schema in anyOf"}
		}
	}

	if len(schema.OneOf) > 0 {
		matchCount := 0
		for _, subSchema := range schema.OneOf {
			if err := validateValue(subSchema, data, path); err == nil {
				matchCount++
			}
		}
		if matchCount != 1 {
			return &ValidationError{Path: path, Message: fmt.Sprintf("must match exactly one schema in oneOf, matched %d", matchCount)}
		}
	}

	if schema.Not != nil {
		if err := validateValue(schema.Not, data, path); err == nil {
			return &ValidationError{Path: path, Message: "must not match schema in 'not'"}
		}
	}

	if schema.Type == "" {
		return nil
	}

	switch schema.Type {
	case "string":
		return validateString(schema, data, path)
	case "number":
		return validateNumber(schema, data, path)
	case "integer":
		return validateInteger(schema, data, path)
	case "boolean":
		return validateBoolean(data, path)
	case "null":
		return validateNull(data, path)
	case "array":
		return validateArray(schema, data, path)
	case "object":
		return validateObject(schema, data, path)
	default:
		return &ValidationError{Path: path, Message: fmt.Sprintf("unknown type: %s", schema.Type)}
	}
}

func validateBoolean(data interface{}, path string) error {
	if _, ok := data.(bool); !ok {
		return &ValidationError{Path: path, Message: "expected boolean"}
	}
	return nil
}

func validateNull(data interface{}, path string) error {
	if data != nil {
		return &ValidationError{Path: path, Message: "expected null"}
	}
	return nil
}

func getFloat64(data interface{}) (float64, bool) {
	switch v := data.(type) {
	case float64:
		return v, true
	case float32:
		return float64(v), true
	case int:
		return float64(v), true
	case int64:
		return float64(v), true
	case json.Number:
		f, err := v.Float64()
		return f, err == nil
	default:
		return 0, false
	}
}
