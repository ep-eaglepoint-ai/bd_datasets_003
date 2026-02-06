package tests

import (
	"strings"
	"testing"
)

func TestMeta_FeatureTestsCoverRequirement08_LargeArray10K(t *testing.T) {
	src := readFeatureSource(t)
	if !strings.Contains(src, "10000") {
		t.Fatalf("missing explicit 10K array assertion")
	}
	runTargetRepoGoTest(t, "^TestValidator_Feature_LargeArray10000Elements$")
}
