package tests

import (
	"strings"
	"testing"
)

func TestMeta_FeatureTestsCoverRequirement02_UnicodeGeneration(t *testing.T) {
	src := readFeatureSource(t)
	for _, token := range []string{"🙂", "مرحبا", "a\\x00b", "e\\u0301", "👨\u200d👩\u200d👧\u200d👦", "😀", "\\ud83d\\ude00"} {
		if !strings.Contains(src, token) {
			t.Fatalf("missing unicode edge case token %q", token)
		}
	}
	runTargetRepoGoTest(t, "^TestValidator_Feature_SpecialNumericValuesAndUnicodeCoverage$")
}
