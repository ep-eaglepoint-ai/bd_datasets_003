# Trajectory


## The Problem: The Compare method for semanticversion  comparasion  don't have Functional and timing test

currently Compare function for semantic comparasion compare  two semantic version strings and returns -1, 0, or 1 based on their numeric ordering.
However, there are currently no automated tests that verify:
- Comparator returns 0 when two identical semantic versions are compared
- Comparator returns -1 when the first version is numerically less than the second
- Comparator returns 1 when the first version is numerically greater than the second
- COmparator treat missing componensts as zero when versions with fewer than three components compare
- Comparator ignore prerelease suffixes (e.g., "-alpha", "-beta") during comparison
- Comparator don't panic when given empty or malformed version strings.
Unit tests need to be implemented using table-driven test cases with descriptive names. 

## The Solution: Add tests covering equality, less-than, greater-than, and edge-case semantic version scenarios
1. Table-driven test setup – Use table-driven tests for all scenarios with descriptive names.
2. Add equality tests – Verify that Identical versions return 0, missing components are treated as equal, prerelease suffixes are ignored, different component counts but numerically equal are treated as equal
3. Add less-than tests – Verify that numeric ordering works for minor and major version difference
4. Add tests for invalid input tests and extra numeric component tests handled accordingly
5. Test the comparator against intentionally broken implementations (e.g., always returns 0, ignores major/minor differences) to ensure that the test suite fails appropriately.

## Recomended Resources
* Table-driven testing in GO
* Semantic versioning