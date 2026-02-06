package tests

import (
	"strings"
	"testing"
)

func TestMeta_FeatureTestsCoverRequirement07_DeepNesting50Levels(t *testing.T) {
	src := readFeatureSource(t)
	if !strings.Contains(src, "for i := 0; i < 50; i++") {
		t.Fatalf("missing explicit 50-level nesting check")
	}
	runTargetRepoGoTest(t, "^TestValidator_Feature_DeepNesting50Levels_NoStackOverflow$")
}
