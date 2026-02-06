package tests

import "testing"

func TestMeta_FeatureTestsCoverRequirement11_ErrorPathAccuracy(t *testing.T) {
	runTargetRepoGoTest(t, "^TestValidator_Property_InvalidDocumentsYieldPathErrors$")
}
