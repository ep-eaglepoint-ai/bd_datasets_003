package tests

import (
	"testing"

	m "ambiguous-wildcard-filepath-matcher/repository_after"
)

type testCase struct {
	name    string
	include string
	target  string
	poison  []string
	want    bool
	wantErr bool
}

func TestMatch_TableDriven(t *testing.T) {
	cases := []testCase{
		{
			name:    "exact match",
			include: "a/b/c.go",
			target:  "a/b/c.go",
			want:    true,
		},
		{
			name:    "exact mismatch",
			include: "a/b/c.go",
			target:  "a/b/d.go",
			want:    false,
		},
		{
			name:    "empty pattern empty target",
			include: "",
			target:  "",
			want:    true,
		},
		{
			name:    "empty pattern non-empty target",
			include: "",
			target:  "a",
			want:    false,
		},
		{
			name:    "question matches one char",
			include: "a?c",
			target:  "abc",
			want:    true,
		},
		{
			name:    "question does not match slash",
			include: "a?c",
			target:  "a/c",
			want:    false,
		},
		{
			name:    "question fails at end of string",
			include: "a?",
			target:  "a",
			want:    false,
		},
		{
			name:    "star matches zero chars",
			include: "ab*cd",
			target:  "abcd",
			want:    true,
		},
		{
			name:    "star matches within segment",
			include: "ab*cd",
			target:  "abZZZcd",
			want:    true,
		},
		{
			name:    "star does not cross slash",
			include: "ab*cd",
			target:  "ab/ZZcd",
			want:    false,
		},
		{
			name:    "double-star matches zero segments between slashes",
			include: "a/**/c.go",
			target:  "a/c.go",
			want:    true,
		},
		{
			name:    "double-star matches multiple segments",
			include: "a/**/c.go",
			target:  "a/x/y/c.go",
			want:    true,
		},
		{
			name:    "double-star at start",
			include: "**/tests/*.go",
			target:  "a/b/tests/main.go",
			want:    true,
		},
		{
			name:    "double-star at start matches immediate dir",
			include: "**/tests/*.go",
			target:  "tests/main.go",
			want:    true,
		},
		{
			name:    "double-star with trailing pattern",
			include: "src/**",
			target:  "src/a/b/c",
			want:    true,
		},
		{
			name:    "double-star can match zero segments",
			include: "src/**",
			target:  "src",
			want:    true,
		},
		{
			name:    "overlapping wildcards star then double-star",
			include: "*/**/x.go",
			target:  "a/b/c/x.go",
			want:    true,
		},
		{
			name:    "overlapping wildcards does not allow star to cross slash",
			include: "*/**/x.go",
			target:  "a/b/c/d/x.go",
			want:    true,
		},
		{
			name:    "group matches first alternative",
			include: "src/(api|impl)/*.go",
			target:  "src/api/main.go",
			want:    true,
		},
		{
			name:    "group matches second alternative",
			include: "src/(api|impl)/*.go",
			target:  "src/impl/main.go",
			want:    true,
		},
		{
			name:    "group mismatch",
			include: "src/(api|impl)/*.go",
			target:  "src/other/main.go",
			want:    false,
		},
		{
			name:    "multiple groups in one pattern",
			include: "(a|b)/(c|d).txt",
			target:  "b/d.txt",
			want:    true,
		},
		{
			name:    "multiple groups mismatch",
			include: "(a|b)/(c|d).txt",
			target:  "b/e.txt",
			want:    false,
		},
		{
			name:    "poison overrides include",
			include: "**/*.go",
			target:  "a/b/c.go",
			poison:  []string{"**/b/**"},
			want:    false,
		},
		{
			name:    "poison no match -> include stands",
			include: "**/*.go",
			target:  "a/b/c.go",
			poison:  []string{"**/x/**"},
			want:    true,
		},
		{
			name:    "poison match with group",
			include: "**/*",
			target:  "src/api/main.go",
			poison:  []string{"src/(api|impl)/**"},
			want:    false,
		},
		{
			name:    "unterminated group errors",
			include: "src/(api|impl/*.go",
			target:  "src/api/main.go",
			wantErr: true,
		},
		{
			name:    "poison invalid pattern errors",
			include: "**/*.go",
			target:  "a/b/c.go",
			poison:  []string{"(oops"},
			wantErr: true,
		},
		{
			name:    "double-star can match empty string",
			include: "**",
			target:  "",
			want:    true,
		},
		{
			name:    "double-star matches arbitrary path",
			include: "**",
			target:  "a/b/c",
			want:    true,
		},
		{
			name:    "star matches empty segment (before slash)",
			include: "*/a",
			target:  "/a",
			want:    true,
		},
		{
			name:    "star cannot match slash; leading slash requires empty segment only",
			include: "*/a",
			target:  "x/a",
			want:    true,
		},
		{
			name:    "unicode question mark",
			include: "?.go",
			target:  "世.go",
			want:    true,
		},
		{
			name:    "poison takes absolute precedence over universal include",
			include: "**",
			target:  "any/path",
			poison:  []string{"**"},
			want:    false,
		},
		{
			name:    "poison takes precedence over broad include",
			include: "**",
			target:  "critical/file.so",
			poison:  []string{"**/*.so"},
			want:    false,
		},
		{
			name:    "selection group with empty option (no alt prefix)",
			include: "src/(|alt/)main.go",
			target:  "src/main.go",
			want:    true,
		},
		{
			name:    "selection group with empty option (alt prefix)",
			include: "src/(|alt/)main.go",
			target:  "src/alt/main.go",
			want:    true,
		},
		{
			name:    "backtracking stress with many stars",
			include: "*/*/*/*/*/a.go",
			target:  "v/w/x/y/z/a.go",
			want:    true,
		},
		{
			name:    "backtracking stress with many double-stars",
			include: "**/**/**/a.go",
			target:  "a/b/c/d/e/f/g/a.go",
			want:    true,
		},
		{
			name:    "case sensitivity",
			include: "*.go",
			target:  "MAIN.GO",
			want:    false,
		},
		{
			name:    "double slashes are literal unless pattern includes them",
			include: "src/main.go",
			target:  "src//main.go",
			want:    false,
		},
		{
			name:    "double slashes exact match",
			include: "src//main.go",
			target:  "src//main.go",
			want:    true,
		},
		{
			name:    "dot-slash is literal (no normalization)",
			include: "src/main.go",
			target:  "./src/main.go",
			want:    false,
		},
		{
			name:    "trailing slash inconsistency",
			include: "path/to/dir",
			target:  "path/to/dir/",
			want:    false,
		},
	}

	if len(cases) < 20 {
		t.Fatalf("need at least 20 cases, got %d", len(cases))
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			got, err := m.Match(tc.include, tc.target, tc.poison)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
		})
	}
}
