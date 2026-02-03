package validator

import (
	"fmt"
)

func validateArray(schema *Schema, data interface{}, path string) error {
	arr, ok := data.([]interface{})
	if !ok {
		return &ValidationError{Path: path, Message: "expected array"}
	}

	if schema.MinItems != nil && len(arr) < *schema.MinItems {
		return &ValidationError{Path: path, Message: "array has too few items"}
	}

	if schema.MaxItems != nil && len(arr) > *schema.MaxItems {
		return &ValidationError{Path: path, Message: "array has too many items"}
	}

	if schema.UniqueItems {
		seen := make(map[interface{}]bool)
		for _, item := range arr {
			if seen[item] {
				return &ValidationError{Path: path, Message: "array items must be unique"}
			}
			seen[item] = true
		}
	}

	if schema.Items != nil {
		for i, item := range arr {
			itemPath := fmt.Sprintf("%s[%d]", path, i)
			if path == "" {
				itemPath = fmt.Sprintf("[%d]", i)
			}
			if err := validateValue(schema.Items, item, itemPath); err != nil {
				return err
			}
		}
	}

	return nil
}
