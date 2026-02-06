package validator

import (
	"encoding/json"
	"fmt"
)

func uniqueKey(v interface{}) (string, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

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
		seen := make(map[string]bool, len(arr))
		for _, item := range arr {
			key, err := uniqueKey(item)
			if err != nil {
				return &ValidationError{Path: path, Message: "array item could not be compared for uniqueness"}
			}
			if seen[key] {
				return &ValidationError{Path: path, Message: "array items must be unique"}
			}
			seen[key] = true
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
