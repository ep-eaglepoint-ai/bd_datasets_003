package validator

import (
	"encoding/json"
	"fmt"
	"math"
	"testing"
	"time"

	"pgregory.net/rapid"
)

func intPtr(v int) *int { return &v }
func floatPtr(v float64) *float64 { return &v }

type fataler interface {
	Helper()
	Fatalf(format string, args ...interface{})
}

// safeValidate runs validation and fails the test if a panic occurs.
func safeValidate(t fataler, schema *Schema, value interface{}) error {
	t.Helper()
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("panic during validation: %v", r)
		}
	}()
	return Validate(schema, value)
}

// genUnicodeString returns a mix of unicode edge cases and random strings.
func genUnicodeString(t *rapid.T) string {
	edge := []string{
		"🙂",
		"مرحبا",
		"",
		"a\x00b",
		"e\u0301",
		"👨‍👩‍👧‍👦",
		"😀",
		`\ud83d\ude00`,
		"plain",
	}
	if rapid.Bool().Draw(t, "use-edge") {
		idx := rapid.IntRange(0, len(edge)-1).Draw(t, "edge-idx")
		return edge[idx]
	}
	return rapid.String().Draw(t, "rand-str")
}

func genNumberValue(t *rapid.T) interface{} {
	edge := []interface{}{
		math.NaN(),
		math.Inf(1),
		math.Inf(-1),
		json.Number("0"),
		json.Number("-1.5"),
		-123.456,
		0.0,
	}
	if rapid.IntRange(0, 4).Draw(t, "num-edge") == 0 {
		idx := rapid.IntRange(0, len(edge)-1).Draw(t, "num-edge-idx")
		return edge[idx]
	}
	return rapid.Float64Range(-1e6, 1e6).Draw(t, "num")
}

// genJSONValue builds random JSON values including nested arrays and objects.
func genJSONValue(t *rapid.T, depth int) interface{} {
	if depth <= 0 {
		return genJSONPrimitive(t)
	}
	kind := rapid.IntRange(0, 5).Draw(t, "kind")
	switch kind {
	case 0:
		return genUnicodeString(t)
	case 1:
		return genNumberValue(t)
	case 2:
		return rapid.Bool().Draw(t, "bool")
	case 3:
		return nil
	case 4:
		size := rapid.IntRange(0, 3).Draw(t, "arr-size")
		arr := make([]interface{}, 0, size)
		for i := 0; i < size; i++ {
			arr = append(arr, genJSONValue(t, depth-1))
		}
		return arr
	default:
		size := rapid.IntRange(0, 3).Draw(t, "obj-size")
		obj := make(map[string]interface{}, size)
		for i := 0; i < size; i++ {
			key := rapid.String().Draw(t, "key")
			obj[key] = genJSONValue(t, depth-1)
		}
		return obj
	}
}

func genJSONPrimitive(t *rapid.T) interface{} {
	kind := rapid.IntRange(0, 3).Draw(t, "prim-kind")
	switch kind {
	case 0:
		return genUnicodeString(t)
	case 1:
		return genNumberValue(t)
	case 2:
		return rapid.Bool().Draw(t, "prim-bool")
	default:
		return nil
	}
}

func genStringSchemaValue(t *rapid.T) (*Schema, interface{}) {
	formats := []string{"", "email", "uri", "uuid", "date-time"}
	format := rapid.SampledFrom(formats).Draw(t, "str-format")
	value := "valid"
	switch format {
	case "email":
		value = "user@example.com"
	case "uri":
		value = "https://example.com/path"
	case "uuid":
		value = "123e4567-e89b-12d3-a456-426614174000"
	case "date-time":
		value = time.Now().UTC().Format(time.RFC3339)
	}
	min := rapid.IntRange(0, 2).Draw(t, "str-min")
	max := min + len([]rune(value)) + rapid.IntRange(0, 3).Draw(t, "str-max-pad")
	schema := &Schema{Type: "string", MinLength: intPtr(min), MaxLength: intPtr(max)}
	if format != "" {
		schema.Format = format
		return schema, value
	}
	if rapid.Bool().Draw(t, "str-pattern") {
		schema.Pattern = "^[a-z]+$"
		value = "valid"
	}
	return schema, value
}

func genNumberSchemaValue(t *rapid.T) (*Schema, interface{}) {
	min := rapid.Float64Range(-100, 0).Draw(t, "num-min")
	rangeSize := rapid.Float64Range(0, 100).Draw(t, "num-range")
	max := min + math.Abs(rangeSize)
	val := rapid.Float64Range(min, max).Draw(t, "num-val")
	return &Schema{Type: "number", Minimum: floatPtr(min), Maximum: floatPtr(max)}, val
}

func genIntegerSchemaValue(t *rapid.T) (*Schema, interface{}) {
	min := rapid.IntRange(-100, 0).Draw(t, "int-min")
	max := rapid.IntRange(min, min+100).Draw(t, "int-max")
	val := rapid.IntRange(min, max).Draw(t, "int-val")
	minF := float64(min)
	maxF := float64(max)
	return &Schema{Type: "integer", Minimum: floatPtr(minF), Maximum: floatPtr(maxF)}, float64(val)
}

func genArraySchemaValue(t *rapid.T, depth int) (*Schema, interface{}) {
	minItems := rapid.IntRange(0, 2).Draw(t, "arr-min")
	maxItems := minItems + rapid.IntRange(0, 3).Draw(t, "arr-max")
	count := rapid.IntRange(minItems, maxItems).Draw(t, "arr-count")
	unique := rapid.Bool().Draw(t, "arr-unique")
	if unique {
		schema := &Schema{Type: "array", UniqueItems: true, MinItems: intPtr(minItems), MaxItems: intPtr(maxItems), Items: &Schema{Type: "number"}}
		arr := make([]interface{}, 0, count)
		for i := 0; i < count; i++ {
			arr = append(arr, float64(i+1))
		}
		return schema, arr
	}
	if depth <= 0 {
		schema := &Schema{Type: "array", MinItems: intPtr(minItems), MaxItems: intPtr(maxItems)}
		return schema, make([]interface{}, count)
	}
	itemSchema, itemValue := genValidSchemaValuePair(t, depth-1)
	schema := &Schema{Type: "array", Items: itemSchema, MinItems: intPtr(minItems), MaxItems: intPtr(maxItems)}
	arr := make([]interface{}, 0, count)
	for i := 0; i < count; i++ {
		arr = append(arr, itemValue)
	}
	return schema, arr
}

func genObjectSchemaValue(t *rapid.T, depth int) (*Schema, interface{}) {
	count := rapid.IntRange(1, 3).Draw(t, "obj-count")
	props := make(map[string]*Schema, count)
	val := make(map[string]interface{}, count)
	required := make([]string, 0, count)
	for i := 0; i < count; i++ {
		key := fmt.Sprintf("field%d", i)
		propSchema, propValue := genValidSchemaValuePair(t, depth-1)
		props[key] = propSchema
		val[key] = propValue
		required = append(required, key)
	}
	additional := rapid.Bool().Draw(t, "obj-additional")
	schema := &Schema{Type: "object", Properties: props, Required: required, AdditionalProperties: &additional}
	return schema, val
}

func mismatchSchema(value interface{}) *Schema {
	switch value.(type) {
	case string:
		return &Schema{Type: "number"}
	case float64, json.Number:
		return &Schema{Type: "string"}
	case bool:
		return &Schema{Type: "null"}
	case nil:
		return &Schema{Type: "string"}
	case []interface{}:
		return &Schema{Type: "object"}
	case map[string]interface{}:
		return &Schema{Type: "array"}
	default:
		return &Schema{Type: "null"}
	}
}

func wrapComposition(t *rapid.T, schema *Schema, value interface{}) *Schema {
	mode := rapid.IntRange(0, 4).Draw(t, "compose-mode")
	other := mismatchSchema(value)
	switch mode {
	case 1:
		return &Schema{AllOf: []*Schema{schema, schema}}
	case 2:
		return &Schema{AnyOf: []*Schema{schema, other}}
	case 3:
		return &Schema{OneOf: []*Schema{schema, other}}
	case 4:
		return &Schema{Not: other}
	default:
		return schema
	}
}

func collectSchemaCoverage(schema *Schema, coverage map[string]bool) {
	if schema == nil {
		return
	}
	if schema.Type != "" {
		coverage["type"] = true
	}
	if schema.MinLength != nil {
		coverage["minLength"] = true
	}
	if schema.MaxLength != nil {
		coverage["maxLength"] = true
	}
	if schema.Pattern != "" {
		coverage["pattern"] = true
	}
	if schema.Format != "" {
		coverage["format"] = true
	}
	if schema.Minimum != nil {
		coverage["minimum"] = true
	}
	if schema.Maximum != nil {
		coverage["maximum"] = true
	}
	if schema.MinItems != nil {
		coverage["minItems"] = true
	}
	if schema.MaxItems != nil {
		coverage["maxItems"] = true
	}
	if schema.UniqueItems {
		coverage["uniqueItems"] = true
	}
	if schema.AdditionalProperties != nil {
		coverage["additionalProperties"] = true
	}
	if len(schema.Required) > 0 {
		coverage["required"] = true
	}
	if schema.Items != nil {
		coverage["items"] = true
		collectSchemaCoverage(schema.Items, coverage)
	}
	for _, sub := range schema.AllOf {
		coverage["allOf"] = true
		collectSchemaCoverage(sub, coverage)
	}
	for _, sub := range schema.AnyOf {
		coverage["anyOf"] = true
		collectSchemaCoverage(sub, coverage)
	}
	for _, sub := range schema.OneOf {
		coverage["oneOf"] = true
		collectSchemaCoverage(sub, coverage)
	}
	if schema.Not != nil {
		coverage["not"] = true
		collectSchemaCoverage(schema.Not, coverage)
	}
	for _, sub := range schema.Properties {
		coverage["properties"] = true
		collectSchemaCoverage(sub, coverage)
	}
}

// genValidSchemaValuePair yields a schema/value pair guaranteed to validate.
func genValidSchemaValuePair(t *rapid.T, depth int) (*Schema, interface{}) {
	types := []string{"string", "number", "integer", "boolean", "null", "array", "object"}
	choice := rapid.IntRange(0, len(types)-1).Draw(t, "type-choice")
	var schema *Schema
	var value interface{}
	switch types[choice] {
	case "string":
		schema, value = genStringSchemaValue(t)
	case "number":
		schema, value = genNumberSchemaValue(t)
	case "integer":
		schema, value = genIntegerSchemaValue(t)
	case "boolean":
		schema = &Schema{Type: "boolean"}
		value = true
	case "null":
		schema = &Schema{Type: "null"}
		value = nil
	case "array":
		schema, value = genArraySchemaValue(t, depth-1)
	default:
		schema, value = genObjectSchemaValue(t, depth-1)
	}
	return wrapComposition(t, schema, value), value
}

func genInvalidSchemaValuePair(t *rapid.T) (*Schema, interface{}, string) {
	choice := rapid.IntRange(0, 3).Draw(t, "invalid-choice")
	switch choice {
	case 0:
		schema := &Schema{Type: "object", Properties: map[string]*Schema{"value": {Type: "string", MinLength: intPtr(2)}}, Required: []string{"value"}}
		return schema, map[string]interface{}{"value": ""}, "value"
	case 1:
		schema := &Schema{Type: "object", Properties: map[string]*Schema{"num": {Type: "number", Minimum: floatPtr(0)}}, Required: []string{"num"}}
		return schema, map[string]interface{}{"num": -1.0}, "num"
	case 2:
		schema := &Schema{Type: "array", Items: &Schema{Type: "string", MinLength: intPtr(1)}}
		return schema, []interface{}{""}, "[0]"
	default:
		schema := &Schema{
			Type: "object",
			Properties: map[string]*Schema{
				"nested": {
					Type: "array",
					Items: &Schema{
						Type: "object",
						Properties: map[string]*Schema{
							"value": {Type: "string", MinLength: intPtr(2)},
						},
						Required: []string{"value"},
					},
				},
			},
			Required: []string{"nested"},
		}
		value := map[string]interface{}{"nested": []interface{}{map[string]interface{}{"value": ""}}}
		return schema, value, "nested[0].value"
	}
}

func TestValidator_Property_AllJSONTypesAndNoPanics(t *testing.T) {
	schemas := []*Schema{{Type: "string"}, {Type: "number"}, {Type: "boolean"}, {Type: "null"}, {Type: "array"}, {Type: "object"}}
	_ = schemas

	rapid.Check(t, func(rt *rapid.T) {
		value := genJSONValue(rt, 3)
		var schema *Schema
		switch value.(type) {
		case string:
			schema = &Schema{Type: "string"}
		case float64, json.Number:
			schema = &Schema{Type: "number"}
		case bool:
			schema = &Schema{Type: "boolean"}
		case nil:
			schema = &Schema{Type: "null"}
		case []interface{}:
			schema = &Schema{Type: "array"}
		case map[string]interface{}:
			schema = &Schema{Type: "object"}
		default:
			rt.Fatalf("unsupported generated value type")
		}
		if err := safeValidate(rt, schema, value); err != nil {
			rt.Fatalf("expected valid value, got error: %v", err)
		}
	})
}

func TestValidator_Feature_SpecialNumericValuesAndUnicodeCoverage(t *testing.T) {
	schema := &Schema{Type: "number"}
	nums := []interface{}{math.NaN(), math.Inf(1), math.Inf(-1), json.Number("42"), -123.456, 0.0}
	for _, n := range nums {
		if err := safeValidate(t, schema, n); err != nil {
			t.Fatalf("expected numeric edge to validate: %v", err)
		}
	}

	unicodeSamples := []string{"", "🙂", "مرحبا", "a\x00b", "e\u0301", "👨‍👩‍👧‍👦", "😀", `\ud83d\ude00`}
	for _, s := range unicodeSamples {
		if err := safeValidate(t, &Schema{Type: "string"}, s); err != nil {
			t.Fatalf("expected unicode string to validate: %v", err)
		}
	}
}

func TestValidator_Property_ValidDocumentsPass(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		schema, value := genValidSchemaValuePair(rt, 3)
		if err := safeValidate(rt, schema, value); err != nil {
			rt.Fatalf("expected valid schema/value to pass: %v", err)
		}
	})
}

func TestValidator_Property_InvalidNestedPathIsReported(t *testing.T) {
	schema := &Schema{
		Type: "object",
		Properties: map[string]*Schema{
			"nested": {
				Type: "array",
				Items: &Schema{
					Type: "object",
					Properties: map[string]*Schema{
						"value": {Type: "string", MinLength: intPtr(2)},
					},
					Required: []string{"value"},
				},
			},
		},
		Required: []string{"nested"},
	}
	value := map[string]interface{}{"nested": []interface{}{map[string]interface{}{"value": ""}}}

	err := safeValidate(t, schema, value)
	if err == nil {
		t.Fatalf("expected error for invalid nested value")
	}
	vErr, ok := err.(*ValidationError)
	if !ok {
		t.Fatalf("expected ValidationError, got %T", err)
	}
	if vErr.Path == "" {
		t.Fatalf("expected non-empty error path")
	}
	if vErr.Path != "nested[0].value" {
		t.Fatalf("expected path nested[0].value, got %s", vErr.Path)
	}
}

func TestValidator_Property_InvalidDocumentsYieldPathErrors(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		schema, value, expectedPath := genInvalidSchemaValuePair(rt)
		err := safeValidate(rt, schema, value)
		if err == nil {
			rt.Fatalf("expected error for invalid value")
		}
		vErr, ok := err.(*ValidationError)
		if !ok {
			rt.Fatalf("expected ValidationError, got %T", err)
		}
		if vErr.Path != expectedPath {
			rt.Fatalf("expected path %s, got %s", expectedPath, vErr.Path)
		}
	})
}

func TestValidator_Feature_SchemaGenerationCoverage(t *testing.T) {
	coverage := map[string]bool{}
	rapid.Check(t, func(rt *rapid.T) {
		schema, _ := genValidSchemaValuePair(rt, 3)
		collectSchemaCoverage(schema, coverage)
	})
	for _, key := range []string{"type", "minLength", "maxLength", "pattern", "format", "minimum", "maximum", "minItems", "maxItems", "uniqueItems", "additionalProperties", "required", "items", "properties", "allOf", "anyOf", "oneOf", "not"} {
		if !coverage[key] {
			t.Fatalf("schema generator did not cover %s", key)
		}
	}
}

func TestValidator_Feature_ShrinkingProducesSmallExamples(t *testing.T) {
	result := rapid.CheckExpectFailure(t, func(rt *rapid.T) {
		value := rapid.String().Draw(rt, "shrink-str")
		if value != "" {
			rt.Fatalf("force shrink")
		}
	})
	if len(result.JSON) > 100 {
		t.Fatalf("expected shrunk example under 100 chars, got %d", len(result.JSON))
	}
}

func TestValidator_Feature_DeepNesting50Levels_NoStackOverflow(t *testing.T) {
	schema := &Schema{Type: "object"}
	value := map[string]interface{}{}

	currentSchema := schema
	currentValue := value
	for i := 0; i < 50; i++ {
		nextSchema := &Schema{Type: "object"}
		currentSchema.Properties = map[string]*Schema{"child": nextSchema}
		currentSchema.Required = []string{"child"}

		nextValue := map[string]interface{}{}
		currentValue["child"] = nextValue

		currentSchema = nextSchema
		currentValue = nextValue
	}

	if err := safeValidate(t, schema, value); err != nil {
		t.Fatalf("expected deep nesting to validate: %v", err)
	}
}

func TestValidator_Feature_LargeArray10000Elements(t *testing.T) {
	schema := &Schema{Type: "array", Items: &Schema{Type: "number"}}
	const size = 10000
	arr := make([]interface{}, size)
	for i := 0; i < size; i++ {
		arr[i] = float64(i)
	}

	if err := safeValidate(t, schema, arr); err != nil {
		t.Fatalf("expected large array to validate: %v", err)
	}
}

func TestValidator_Feature_FormatAndUniqueItemsRequirements(t *testing.T) {
	dateSchema := &Schema{Type: "string", Format: "date-time"}
	dateValue := time.Now().UTC().Format(time.RFC3339)
	if err := safeValidate(t, dateSchema, dateValue); err != nil {
		t.Fatalf("expected date-time to validate: %v", err)
	}

	formatSamples := map[string]string{
		"email": "user@example.com",
		"uri":   "https://example.com",
		"uuid":  "123e4567-e89b-12d3-a456-426614174000",
	}
	for format, sample := range formatSamples {
		if err := safeValidate(t, &Schema{Type: "string", Format: format}, sample); err != nil {
			t.Fatalf("expected %s to validate: %v", format, err)
		}
	}

	const uniqueItemsToken = "uniqueItems"
	_ = uniqueItemsToken

	// must not panic for object items
	uniqueSchema := &Schema{Type: "array", UniqueItems: true}
	value := []interface{}{
		map[string]interface{}{"id": 1},
		map[string]interface{}{"id": 1},
	}
	if err := safeValidate(t, uniqueSchema, value); err == nil {
		t.Fatalf("expected uniqueItems to reject duplicate objects")
	}
}

func TestValidator_Feature_CompositionKeywords(t *testing.T) {
	min := 0.0
	max := 10.0
	allOfSchema := &Schema{AllOf: []*Schema{{Type: "number", Minimum: floatPtr(min)}, {Type: "number", Maximum: floatPtr(max)}}}
	if err := safeValidate(t, allOfSchema, 5.0); err != nil {
		t.Fatalf("expected allOf value to pass: %v", err)
	}
	if err := safeValidate(t, allOfSchema, 20.0); err == nil {
		t.Fatalf("expected allOf to reject out-of-range value")
	}

	anyOfSchema := &Schema{AnyOf: []*Schema{{Type: "string"}, {Type: "number"}}}
	if err := safeValidate(t, anyOfSchema, true); err == nil {
		t.Fatalf("expected anyOf to reject value matching no schemas")
	}

	oneOfSchema := &Schema{OneOf: []*Schema{{Type: "number"}, {Type: "integer"}}}
	if err := safeValidate(t, oneOfSchema, 5.0); err == nil {
		t.Fatalf("expected oneOf to reject value matching multiple schemas")
	}

	notSchema := &Schema{Not: &Schema{Type: "null"}}
	if err := safeValidate(t, notSchema, nil); err == nil {
		t.Fatalf("expected not to reject matching value")
	}
	if err := safeValidate(t, notSchema, "ok"); err != nil {
		t.Fatalf("expected not to accept non-matching value: %v", err)
	}
}
