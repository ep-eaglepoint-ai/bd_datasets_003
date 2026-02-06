package tests

import (
	"strings"
	"testing"
)

func TestMeta_FeatureTestsCoverRequirement01_AllJSONTypesGenerator(t *testing.T) {
	src := readFeatureSource(t)
	for _, token := range []string{"Type: \"string\"", "Type: \"number\"", "Type: \"boolean\"", "Type: \"null\"", "Type: \"array\"", "Type: \"object\""} {
		if !strings.Contains(src, token) {
			t.Fatalf("missing JSON type coverage token %q", token)
		}
	}
	runTargetRepoGoTest(t, "^TestValidator_Property_AllJSONTypesAndNoPanics$")
}
