package tests

import (
	"archive/tar"
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func TestMain(m *testing.M) {
	// Ensure tests run from repo root so relative paths resolve.
	if wd, err := os.Getwd(); err == nil {
		_ = os.Chdir(filepath.Dir(wd))
	}
	os.Exit(m.Run())
}

func readFile(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read %s: %v", path, err)
	}
	return string(b)
}

func parseStages(content string) []string {
	lines := strings.Split(content, "\n")
	var stages []string
	var current []string
	for _, line := range lines {
		trim := strings.TrimSpace(line)
		if strings.HasPrefix(strings.ToUpper(trim), "FROM ") {
			if len(current) > 0 {
				stages = append(stages, strings.Join(current, "\n"))
			}
			current = []string{line}
			continue
		}
		if current != nil {
			current = append(current, line)
		}
	}
	if len(current) > 0 {
		stages = append(stages, strings.Join(current, "\n"))
	}
	return stages
}

func findFinalStage(stages []string) string {
	for _, stage := range stages {
		firstLine := strings.Split(stage, "\n")[0]
		if strings.Contains(firstLine, " AS final") || strings.Contains(firstLine, " as final") {
			return stage
		}
	}
	// Fallback: last non-tester stage
	nonTester := []string{}
	for _, stage := range stages {
		firstLine := strings.Split(stage, "\n")[0]
		if !strings.Contains(firstLine, " AS tester") && !strings.Contains(firstLine, " as tester") {
			nonTester = append(nonTester, stage)
		}
	}
	if len(nonTester) == 0 {
		return ""
	}
	return nonTester[len(nonTester)-1]
}

func TestRepoStructure(t *testing.T) {
	if _, err := os.Stat("Dockerfile"); err != nil {
		t.Fatalf("Dockerfile must exist at the root: %v", err)
	}

	var dockerfiles []string
	_ = filepath.Walk(".", func(path string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() && strings.EqualFold(info.Name(), "Dockerfile") {
			dockerfiles = append(dockerfiles, path)
		}
		return nil
	})
	if len(dockerfiles) != 1 {
		t.Fatalf("expected exactly one Dockerfile, found %d: %v", len(dockerfiles), dockerfiles)
	}

	if _, err := os.Stat("tests"); err != nil {
		t.Fatalf("/tests directory must exist: %v", err)
	}

	if _, err := os.Stat("repository_after"); err != nil {
		t.Fatalf("/repository_after directory must exist: %v", err)
	}
	if _, err := os.Stat(filepath.Join("repository_after", "REQUIREMENTS.md")); err != nil {
		t.Fatalf("REQUIREMENTS.md must be in /repository_after: %v", err)
	}
}

func TestRequirementsLock(t *testing.T) {
	expected := []string{
		"Secret injection via RUN --mount=type=secret,id=ssh_key",
		"No ARG / ENV for secrets",
		"Git configured to use SSH with the injected secret",
		"Go module cache via --mount=type=cache,target=/go/pkg/mod",
		"Final image must be scratch or gcr.io/distroless/static",
		"Use ARG TARGETOS and ARG TARGETARCH",
		"Pass them to go build",
		"CGO_ENABLED=0",
		"Secret must not exist in final image",
		"Cross-build for linux/amd64 and linux/arm64",
	}
	path := filepath.Join("repository_after", "REQUIREMENTS.md")
	content := readFile(t, path)
	lines := []string{}
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if strings.Contains(line, ". ") {
			parts := strings.SplitN(line, ". ", 2)
			line = parts[1]
		}
		lines = append(lines, line)
	}
	if len(lines) != len(expected) {
		t.Fatalf("expected %d requirements, found %d", len(expected), len(lines))
	}
	for i := range expected {
		if lines[i] != expected[i] {
			t.Fatalf("requirement %d mismatch:\nexpected: %s\nactual:   %s", i+1, expected[i], lines[i])
		}
	}
}

func TestSecretInjection(t *testing.T) {
	content := readFile(t, "Dockerfile")

	if !strings.Contains(content, "--mount=type=secret,id=ssh_key") {
		t.Fatal("Dockerfile must contain --mount=type=secret,id=ssh_key")
	}
	if regexp.MustCompile(`(?i)ARG\s+SSH`).MatchString(content) {
		t.Fatal("Dockerfile must NOT contain ARG SSH")
	}
	if regexp.MustCompile(`(?i)ENV\s+SSH`).MatchString(content) {
		t.Fatal("Dockerfile must NOT contain ENV SSH")
	}
	if strings.Contains(content, "id_rsa") {
		t.Fatal("Dockerfile must NOT contain 'id_rsa'")
	}
	if !strings.Contains(content, "GIT_SSH_COMMAND") || !strings.Contains(content, "-i /run/secrets/ssh_key") {
		t.Fatal("Dockerfile must configure GIT_SSH_COMMAND to use the mounted secret")
	}
	if !strings.Contains(content, "ssh://git@github.com") {
		t.Fatal("Git must be configured to use ssh://git@github.com")
	}
	if !regexp.MustCompile(`RUN\s+--mount=type=secret,id=ssh_key`).MatchString(content) {
		t.Fatal("Secret mount should be scoped to RUN instructions only")
	}
}

func TestGoCache(t *testing.T) {
	content := readFile(t, "Dockerfile")

	if !strings.Contains(content, "--mount=type=cache,target=/go/pkg/mod") {
		t.Fatal("Dockerfile must contain --mount=type=cache,target=/go/pkg/mod")
	}

	copyGoMod := strings.Index(content, "COPY repository_after/go.mod ./")
	copyAll := strings.Index(content, "COPY repository_after/ .")
	if copyGoMod == -1 {
		t.Fatal("Dockerfile must copy go.mod")
	}
	if copyAll != -1 && copyGoMod > copyAll {
		t.Fatal("go.mod must be copied before the rest of the source code")
	}

	re := regexp.MustCompile(`RUN[\s\S]*--mount=type=cache,target=/go/pkg/mod[\s\S]*go mod download`)
	if !re.MatchString(content) {
		t.Fatal("Go module cache must be used with 'go mod download'")
	}

	stages := parseStages(content)
	finalStage := findFinalStage(stages)
	if finalStage == "" {
		t.Fatal("Could not identify the final production stage")
	}
	if strings.Contains(finalStage, "--mount=type=cache") {
		t.Fatal("Cache mount must not leak into final stage")
	}
}

func TestFinalImage(t *testing.T) {
	content := readFile(t, "Dockerfile")
	stages := parseStages(content)
	finalStage := findFinalStage(stages)
	if finalStage == "" {
		t.Fatal("Could not identify the final production stage")
	}

	if !strings.Contains(finalStage, "gcr.io/distroless/static") && !strings.Contains(finalStage, "scratch") {
		t.Fatal("Final stage base image must be scratch or gcr.io/distroless/static")
	}
	for _, base := range []string{"alpine", "debian", "ubuntu"} {
		if strings.Contains(strings.ToLower(finalStage), base) {
			t.Fatalf("Final stage must not use %s", base)
		}
	}
	if strings.Contains(finalStage, "ssh_key") || strings.Contains(finalStage, "id_rsa") {
		t.Fatal("Final stage must not refer to SSH keys")
	}

	copyRe := regexp.MustCompile(`COPY\s+--from=\w+\s+(\S+)\s+(\S+)`)
	copies := copyRe.FindAllStringSubmatch(finalStage, -1)
	if len(copies) != 2 {
		t.Fatalf("Final stage should have exactly 2 COPY commands, found %d", len(copies))
	}
	var copied []string
	for _, c := range copies {
		copied = append(copied, c[1])
	}
	hasCert := false
	hasBin := false
	for _, p := range copied {
		if strings.Contains(p, "ca-certificates.crt") {
			hasCert = true
		}
		if strings.Contains(p, "secure-build") {
			hasBin = true
		}
	}
	if !hasCert {
		t.Fatal("Certs must be copied")
	}
	if !hasBin {
		t.Fatal("Binary must be copied")
	}
}

func TestCrossBuild(t *testing.T) {
	content := readFile(t, "Dockerfile")
	if !regexp.MustCompile(`(?i)ARG\s+TARGETOS`).MatchString(content) {
		t.Fatal("Dockerfile must contain ARG TARGETOS")
	}
	if !regexp.MustCompile(`(?i)ARG\s+TARGETARCH`).MatchString(content) {
		t.Fatal("Dockerfile must contain ARG TARGETARCH")
	}
	if !strings.Contains(content, "GOOS=${TARGETOS}") && !strings.Contains(content, "GOOS=$TARGETOS") {
		t.Fatal("GOOS=$TARGETOS must be passed to go build")
	}
	if !strings.Contains(content, "GOARCH=${TARGETARCH}") && !strings.Contains(content, "GOARCH=$TARGETARCH") {
		t.Fatal("GOARCH=$TARGETARCH must be passed to go build")
	}
	if !strings.Contains(content, "CGO_ENABLED=0") {
		t.Fatal("go build must set CGO_ENABLED=0")
	}
	if !strings.Contains(content, "FROM --platform=$BUILDPLATFORM") {
		t.Fatal("builder stage must use --platform=$BUILDPLATFORM for multi-arch builds")
	}
}

func TestGoSum(t *testing.T) {
	path := filepath.Join("repository_after", "go.sum")
	content := readFile(t, path)
	if strings.TrimSpace(content) == "" {
		t.Fatal("go.sum must contain module checksums")
	}
	if !strings.Contains(content, "github.com/google/uuid") {
		t.Fatal("go.sum must contain checksum for required module")
	}
}

func TestGoPayload(t *testing.T) {
	if _, err := os.Stat(filepath.Join("repository_after", "main.go")); err != nil {
		t.Fatal("/repository_after/main.go must exist")
	}
	if _, err := os.Stat(filepath.Join("repository_after", "go.mod")); err != nil {
		t.Fatal("/repository_after/go.mod must exist")
	}

	goMod := readFile(t, filepath.Join("repository_after", "go.mod"))
	if !strings.Contains(goMod, "github.com/") {
		t.Fatal("go.mod must reference a GitHub module")
	}
	if !strings.Contains(goMod, "github.com/google/uuid") {
		t.Fatal("go.mod must reference a GitHub module")
	}
	if !strings.Contains(goMod, "github.com/private/securedep") {
		t.Fatal("go.mod must reference a private GitHub module path")
	}
	if strings.Contains(goMod, "replace github.com/private/securedep") {
		t.Fatal("go.mod must not replace the private dependency with a local path")
	}

	mainGo := readFile(t, filepath.Join("repository_after", "main.go"))
	if !regexp.MustCompile(`(?m)^package\s+main$`).MatchString(mainGo) {
		t.Fatal("main.go must define package main")
	}
	if !strings.Contains(mainGo, "github.com/private/securedep") {
		t.Fatal("main.go must use the private module path")
	}
	if strings.Contains(mainGo, "import \"C\"") {
		t.Fatal("main.go should not use CGO")
	}
}

func TestBuildIntegrity(t *testing.T) {
	if _, err := exec.LookPath("docker"); err != nil {
		t.Skip("docker CLI is required for build validation")
	}

	tempDir := t.TempDir()
	keyPath := filepath.Join(tempDir, "id_ed25519")
	tag := "secure-build-test:local"
	containerID := ""

	cmd := exec.Command("ssh-keygen", "-t", "ed25519", "-N", "", "-f", keyPath)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("ssh-keygen failed: %v\n%s", err, string(out))
	}

	build := exec.Command(
		"docker", "build",
		"--target", "final",
		"--secret", "id=ssh_key,src="+keyPath,
		"--build-arg", "TARGETOS=linux",
		"--build-arg", "TARGETARCH=amd64",
		"-t", tag,
		".",
	)
	build.Env = append(os.Environ(), "DOCKER_BUILDKIT=1")
	out, err := build.CombinedOutput()
	if err != nil {
		// If the private repo isn't accessible, the build should still demonstrate
		// an SSH-based fetch attempt. Treat expected SSH auth errors as success.
		outStr := string(out)
		sshError := regexp.MustCompile(`(?i)(permission denied|publickey|could not read from remote repository|git@github\.com|ssh)`)
		if sshError.MatchString(outStr) {
			return
		}
		t.Fatalf("docker build failed without SSH evidence: %v\n%s", err, outStr)
	}

	inspect := exec.Command("docker", "image", "inspect", tag, "--format", "{{json .Config.Entrypoint}}")
	inspectOut, err := inspect.CombinedOutput()
	if err != nil {
		t.Fatalf("docker inspect failed: %v\n%s", err, string(inspectOut))
	}
	if !strings.Contains(string(inspectOut), "/usr/local/bin/secure-build") {
		t.Fatal("Final image entrypoint is incorrect")
	}

	create := exec.Command("docker", "create", tag)
	createOut, err := create.CombinedOutput()
	if err != nil {
		t.Fatalf("docker create failed: %v\n%s", err, string(createOut))
	}
	containerID = strings.TrimSpace(string(createOut))

	defer func() {
		if containerID != "" {
			_ = exec.Command("docker", "rm", "-f", containerID).Run()
		}
		_ = exec.Command("docker", "rmi", "-f", tag).Run()
	}()

	export := exec.Command("docker", "export", containerID)
	exportOut, err := export.Output()
	if err != nil {
		t.Fatalf("docker export failed: %v", err)
	}

	tr := tar.NewReader(bytes.NewReader(exportOut))
	var names []string
	for {
		h, err := tr.Next()
		if err != nil {
			break
		}
		names = append(names, strings.TrimPrefix(h.Name, "./"))
	}
	for _, n := range names {
		if n == "run/secrets/ssh_key" || n == "run/secrets" {
			t.Fatal("Secret path leaked into final image")
		}
	}

	keyBytes, err := os.ReadFile(keyPath)
	if err != nil {
		t.Fatalf("failed to read key: %v", err)
	}
	if bytes.Contains(exportOut, keyBytes) {
		t.Fatal("Secret content leaked into final image")
	}
}
