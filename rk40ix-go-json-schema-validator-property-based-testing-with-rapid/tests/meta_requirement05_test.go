package tests

import "testing"

func TestMeta_FeatureTestsCoverRequirement05_ValidPairsAlwaysPass(t *testing.T) {
	runTargetRepoGoTest(t, "^TestValidator_Property_ValidDocumentsPass$")
}
