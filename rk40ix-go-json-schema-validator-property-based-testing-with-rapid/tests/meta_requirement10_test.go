package tests

import "testing"

func TestMeta_FeatureTestsCoverRequirement10_CompositionKeywords(t *testing.T) {
	runTargetRepoGoTest(t, "^TestValidator_Feature_CompositionKeywords$")
}
