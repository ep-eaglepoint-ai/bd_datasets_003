package tests

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMeta_FeatureTestsCoverRequirement12_PropertyTestsWithPanicRecoveryAndHighVolume(t *testing.T) {
	requireFeatureTestFile(t)
	rapidFile := filepath.Join(targetRepoPath(t), "pgregory.net", "rapid", "rapid.go")
	b, err := os.ReadFile(rapidFile)
	if err != nil {
		t.Fatalf("rapid shim not present for this repo target: %v", err)
	}
	src := string(b)
	if !strings.Contains(src, "defaultRuns = 10000") {
		t.Fatalf("property execution volume must be in the thousands")
	}
	featureSrc := readFeatureSource(t)
	if !strings.Contains(featureSrc, "safeValidate") {
		t.Fatalf("panic recovery helper safeValidate must exist")
	}
	runTargetRepoGoTest(t, "^TestValidator_Property_ValidDocumentsPass$")
	runTargetRepoGoTest(t, "^TestValidator_Property_AllJSONTypesAndNoPanics$")
}
