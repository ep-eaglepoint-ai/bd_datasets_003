package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"plugin"
	"testing"
)

var (
	Compare      func(a, b string) int
	pluginTmpDir string
)

func copyToTempDir(srcPath string) (string, string, error) {
	tmpDir, err := os.MkdirTemp("", "semver-plugin-*")
	if err != nil {
		return "", "", err
	}

	tmpFile := filepath.Join(tmpDir, filepath.Base(srcPath))

	srcBytes, err := os.ReadFile(srcPath)
	if err != nil {
		return "", "", fmt.Errorf("failed to read source file: %w", err)
	}

	if err := os.WriteFile(tmpFile, srcBytes, 0644); err != nil {
		return "", "", fmt.Errorf("failed to write temp file: %w", err)
	}

	return tmpDir, tmpFile, nil
}

func buildPluginFromFile(srcFile string) (string, string, error) {
	tmpDir, tmpFile, err := copyToTempDir(srcFile)
	if err != nil {
		return "", "", err
	}

	pluginPath := filepath.Join(tmpDir, "semver.so")

	cmd := exec.Command("go", "build", "-buildmode=plugin", "-o", pluginPath, tmpFile)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		return "", "", fmt.Errorf("failed to build plugin: %w", err)
	}

	return pluginPath, tmpDir, nil
}

func TestMain(m *testing.M) {
	repoPath := os.Getenv("REPO_PATH")
	if repoPath == "" {
		panic("REPO_PATH environment variable not set")
	}
	repoPath = filepath.Join("..", repoPath)
	absPath, err := filepath.Abs(repoPath)
	if err != nil {
		panic("failed to get absolute path of REPO_PATH: " + err.Error())
	}

	pluginPath, tmpDir, err := buildPluginFromFile(absPath)
	if err != nil {
		panic("failed to build plugin: " + err.Error())
	}
	pluginTmpDir = tmpDir

	p, err := plugin.Open(pluginPath)
	if err != nil {
		panic("failed to open plugin: " + err.Error())
	}

	sym, err := p.Lookup("Compare")
	if err != nil {
		panic("failed to find Compare symbol: " + err.Error())
	}

	var ok bool
	Compare, ok = sym.(func(string, string) int)
	if !ok {
		panic("Compare has wrong type signature")
	}

	// run tests
	code := m.Run()

	_ = os.RemoveAll(pluginTmpDir)
	os.Exit(code)
}

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
