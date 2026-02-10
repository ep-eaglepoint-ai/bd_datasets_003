package main

import (
	"testing"
)

func TestCompare_Equality(t *testing.T) {
	tests := []struct {
		name string
		a    string
		b    string
		want int
	}{
		{
			name: "identical versions",
			a:    "1.0.0",
			b:    "1.0.0",
			want: 0,
		},
		{
			name: "missing patch treated as zero",
			a:    "1.0",
			b:    "1.0.0",
			want: 0,
		},
		{
			name: "prerelease suffix ignored",
			a:    "1.0.0-alpha",
			b:    "1.0.0",
			want: 0,
		},
		{
			name: "different component counts but numerically equal",
			a:    "2",
			b:    "2.0.0",
			want: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Compare(tt.a, tt.b)
			if got != tt.want {
				t.Fatalf("Compare(%q, %q) = %d, want %d", tt.a, tt.b, got, tt.want)
			}
		})
	}
}

func TestCompare_LessThan(t *testing.T) {
	tests := []struct {
		name string
		a    string
		b    string
	}{
		{
			name: "patch version less than",
			a:    "1.2.3",
			b:    "1.2.4",
		},
		{
			name: "minor version less than",
			a:    "1.2.0",
			b:    "1.3.0",
		},
		{
			name: "major version less than",
			a:    "1.9.9",
			b:    "2.0.0",
		},
		{
			name: "minor version less than with double digits",
			a:    "1.2.0",
			b:    "1.10.0",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Compare(tt.a, tt.b); got != -1 {
				t.Fatalf("Compare(%q, %q) = %d, want -1", tt.a, tt.b, got)
			}
		})
	}
}

func TestCompare_GreaterThan(t *testing.T) {
	tests := []struct {
		name string
		a    string
		b    string
	}{
		{
			name: "patch version greater than",
			a:    "1.2.4",
			b:    "1.2.3",
		},
		{
			name: "minor version greater than",
			a:    "1.3.0",
			b:    "1.2.9",
		},
		{
			name: "major version greater than",
			a:    "2.0.0",
			b:    "1.9.9",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Compare(tt.a, tt.b); got != 1 {
				t.Fatalf("Compare(%q, %q) = %d, want 1", tt.a, tt.b, got)
			}
		})
	}
}

func TestCompare_EdgeCases_InvalidInputs(t *testing.T) {
	tests := []struct {
		name string
		a    string
		b    string
		want int
	}{
		{
			name: "both empty strings",
			a:    "",
			b:    "",
			want: 0,
		},
		{
			name: "invalid strings treated deterministically",
			a:    "x.y.z",
			b:    "0.0.0",
			want: 0,
		},
		{
			name: "mixed valid and invalid input",
			a:    "1.x.0",
			b:    "1.0.0",
			want: 0,
		},
		{
			name: "invalid compared to higher valid version",
			a:    "x",
			b:    "1.0.0",
			want: -1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			defer func() {
				if r := recover(); r != nil {
					t.Fatalf("Compare(%q, %q) panicked: %v", tt.a, tt.b, r)
				}
			}()

			got := Compare(tt.a, tt.b)
			if got != tt.want {
				t.Fatalf("Compare(%q, %q) = %d, want %d", tt.a, tt.b, got, tt.want)
			}
		})
	}
}
