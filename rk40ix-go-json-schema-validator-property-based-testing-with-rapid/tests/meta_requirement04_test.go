package tests

import (
	"strings"
	"testing"
)

func TestMeta_FeatureTestsCoverRequirement04_SchemaGenerationWithConstraints(t *testing.T) {
	src := readFeatureSource(t)
	for _, token := range []string{"genValidSchemaValuePair", "MinLength", "MaxLength", "Minimum", "Maximum", "Required", "Items", "AllOf", "AnyOf", "OneOf", "Not", "date-time"} {
		if !strings.Contains(src, token) {
			t.Fatalf("missing schema-generation/constraint token %q", token)
		}
	}
	runTargetRepoGoTest(t, "^TestValidator_Feature_SchemaGenerationCoverage$")
}
