package tests

import (
	"strings"
	"testing"
)

func TestMeta_FeatureTestsCoverRequirement03_NumericEdgesIncludingIEEE754(t *testing.T) {
	src := readFeatureSource(t)
	for _, token := range []string{"math.NaN()", "math.Inf(1)", "math.Inf(-1)", "json.Number(\"42\")", "-123.456", "0.0"} {
		if !strings.Contains(src, token) {
			t.Fatalf("missing numeric edge token %q", token)
		}
	}
	runTargetRepoGoTest(t, "^TestValidator_Feature_SpecialNumericValuesAndUnicodeCoverage$")
}
