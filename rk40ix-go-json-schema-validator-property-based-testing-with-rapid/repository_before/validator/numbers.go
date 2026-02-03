package validator

import (
	"math"
)

func validateNumber(schema *Schema, data interface{}, path string) error {
	num, ok := getFloat64(data)
	if !ok {
		return &ValidationError{Path: path, Message: "expected number"}
	}

	if schema.Minimum != nil && num < *schema.Minimum {
		return &ValidationError{Path: path, Message: "number below minimum"}
	}

	if schema.Maximum != nil && num > *schema.Maximum {
		return &ValidationError{Path: path, Message: "number above maximum"}
	}

	return nil
}

func validateInteger(schema *Schema, data interface{}, path string) error {
	num, ok := getFloat64(data)
	if !ok {
		return &ValidationError{Path: path, Message: "expected integer"}
	}

	if num != math.Trunc(num) {
		return &ValidationError{Path: path, Message: "expected integer, got float"}
	}

	if schema.Minimum != nil && num < *schema.Minimum {
		return &ValidationError{Path: path, Message: "integer below minimum"}
	}

	if schema.Maximum != nil && num > *schema.Maximum {
		return &ValidationError{Path: path, Message: "integer above maximum"}
	}

	return nil
}
