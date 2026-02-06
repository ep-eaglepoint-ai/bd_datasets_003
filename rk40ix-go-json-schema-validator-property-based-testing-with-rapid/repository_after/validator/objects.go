package validator

import (
	"fmt"
)

func validateObject(schema *Schema, data interface{}, path string) error {
	obj, ok := data.(map[string]interface{})
	if !ok {
		return &ValidationError{Path: path, Message: "expected object"}
	}

	for _, req := range schema.Required {
		if _, exists := obj[req]; !exists {
			missingPath := req
			if path != "" {
				missingPath = fmt.Sprintf("%s.%s", path, req)
			}
			return &ValidationError{Path: missingPath, Message: fmt.Sprintf("missing required property: %s", req)}
		}
	}

	if schema.AdditionalProperties != nil && !*schema.AdditionalProperties {
		for key := range obj {
			if _, defined := schema.Properties[key]; !defined {
				return &ValidationError{Path: path, Message: fmt.Sprintf("additional property not allowed: %s", key)}
			}
		}
	}

	for key, propSchema := range schema.Properties {
		if val, exists := obj[key]; exists {
			propPath := key
			if path != "" {
				propPath = fmt.Sprintf("%s.%s", path, key)
			}
			if err := validateValue(propSchema, val, propPath); err != nil {
				return err
			}
		}
	}

	return nil
}
