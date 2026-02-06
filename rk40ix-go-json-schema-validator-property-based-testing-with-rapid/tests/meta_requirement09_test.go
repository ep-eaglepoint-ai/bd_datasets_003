package tests

import (
	"strings"
	"testing"
)

func TestMeta_FeatureTestsCoverRequirement09_UniqueItemsNonComparableHandlingIsTested(t *testing.T) {
	src := readFeatureSource(t)
	if !strings.Contains(src, "uniqueItems") {
		t.Fatalf("missing uniqueItems token")
	}
	if !strings.Contains(src, "must not panic for object items") {
		t.Fatalf("missing non-comparable panic check")
	}
	runTargetRepoGoTest(t, "^TestValidator_Feature_FormatAndUniqueItemsRequirements$")
}
