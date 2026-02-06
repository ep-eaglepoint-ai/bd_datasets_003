package tests

import (
	"strings"
	"testing"
)

func TestMeta_FeatureTestsCoverRequirement06_InvalidValuesYieldPathErrors(t *testing.T) {
	src := readFeatureSource(t)
	if !strings.Contains(src, "nested[0].value") {
		t.Fatalf("missing explicit nested path assertion")
	}
	runTargetRepoGoTest(t, "^TestValidator_Property_InvalidDocumentsYieldPathErrors$")
}
