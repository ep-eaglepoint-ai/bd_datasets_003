package main

import (
	"fmt"
)

func main() {
	fmt.Println("=== Semantic Version Comparator Demo ===\n")

	fmt.Println("--- Required Test Cases ---")
	testCases := []struct {
		name     string
		a        string
		b        string
		expected int
	}{
		{"1.0.0 equals 1.0.0", "1.0.0", "1.0.0", 0},
		{"1.2.3 less than 1.2.4", "1.2.3", "1.2.4", -1},
		{"2.0.0 greater than 1.9.9", "2.0.0", "1.9.9", 1},
		{"1.0 equals 1.0.0", "1.0", "1.0.0", 0},
		{"1.0.0-alpha equals 1.0.0", "1.0.0-alpha", "1.0.0", 0},
		{"Empty string handling", "", "1.0.0", -1},
		{"Invalid string handling", "x.y.z", "1.0.0", -1},
	}

	for _, tc := range testCases {
		result := Compare(tc.a, tc.b)  // Changed from semver.Compare to Compare
		status := "✅"
		if result != tc.expected {
			status = "❌"
		}
		fmt.Printf("%s Compare(%q, %q) = %d (expected %d)\n", status, tc.a, tc.b, result, tc.expected)
	}

	fmt.Println("\n--- Bug Demonstration ---")
	fmt.Println("The bug occurs when comparing single-component versions with multi-component versions:")
	
	bugCases := []struct {
		name     string
		a        string
		b        string
		expected int
	}{
		{"BUG: 1 vs 1.0.1 (should be -1)", "1", "1.0.1", -1},
		{"BUG: 1.0.1 vs 1 (should be 1)", "1.0.1", "1", 1},
		{"BUG: 1.2 vs 1.2.1 (should be -1)", "1.2", "1.2.1", -1},
		{"BUG: 1.2.1 vs 1.2 (should be 1)", "1.2.1", "1.2", 1},
		{"Works: 1 vs 1.0.0 (equal)", "1", "1.0.0", 0},
		{"Works: 2 vs 1.5.3 (greater)", "2", "1.5.3", 1},
	}

	for _, tc := range bugCases {
		result := Compare(tc.a, tc.b)  // Changed from semver.Compare to Compare
		status := "✅"
		if result != tc.expected {
			status = "❌ BUG"
		}
		fmt.Printf("%s Compare(%q, %q) = %d (expected %d)\n", status, tc.a, tc.b, result, tc.expected)
	}

	fmt.Println("\n--- Explanation ---")
	fmt.Println("The bug is in the limit calculation:")
	fmt.Println("  limit = min(3, len(partsA), len(partsB))")
	fmt.Println("For '1' vs '1.0.1':")
	fmt.Println("  partsA = [1] (length 1)")
	fmt.Println("  partsB = [1, 0, 1] (length 3)")
	fmt.Println("  limit = min(3, 1, 3) = 1")
	fmt.Println("  Only compares first component: 1 == 1 → returns 0")
	fmt.Println("  Should compare: 1 vs 1, then 0 vs 0, then 0 vs 1 → returns -1")
}