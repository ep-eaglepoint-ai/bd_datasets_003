# 6HY6P6 - Secure BuildKit Secret Injection and Cache Mounting

### 1. Phase 1: Title
**Guiding Question**: "What exactly needs to be built, and what are the constraints?"

**Reasoning**:
The goal is to author a BuildKit-enabled Dockerfile and minimal Go payload that demonstrate secure secret injection for transient use during image build, effective Go module caching between builds, and reproducible cross-compilation into a minimal final image that contains no secrets.

**Key Requirements**:
- **Secret injection**: Use BuildKit secret mount `--mount=type=secret,id=ssh_key` during a single `RUN` so the secret is available only transiently.
- **No ARG/ENV for secrets**: Secrets must not be passed via `ARG` or `ENV` and must not appear in any Dockerfile layer or final image.
- **Git over SSH**: Configure Git inside the build stage to fetch private modules via SSH using the injected secret.
- **Go module cache**: Use `--mount=type=cache,target=/go/pkg/mod` while running `go mod download` (or similar) to cache modules across builds.
- **Deterministic build**: Pin base images by digest and pass deterministic build flags (e.g., `-trimpath -buildvcs=false`) to `go build`.
- **Minimal final image**: Final stage must be `scratch` or `gcr.io/distroless/static` and must only contain the statically built binary plus certs.
- **Cross-build**: Support `ARG TARGETOS` and `ARG TARGETARCH`, pass them to `go build`, and set `CGO_ENABLED=0` for static builds.

**Primary artifacts**:
- Requirements: [tests/REQUIREMENTS.md](tests/REQUIREMENTS.md)
- Build target: [repository_after/Dockerfile](repository_after/Dockerfile)
- Payload: [repository_after/main.go](repository_after/main.go)
- Tests: [tests/tests_test.go](tests/tests_test.go)

### 2. Phase 2: QUESTION ASSUMPTIONS (Challenge the Premise)
**Guiding Question**: "Is there a simpler way? Why not leak secrets or avoid cache mounts?"

**Reasoning**:
Leaving secrets in layers or passing them via ARG/ENV is simpler but insecure. The exercise intentionally forces BuildKit's ephemeral secret mounts and cache mounts to teach secure patterns that avoid leaking credentials while achieving build performance.

### 3. Phase 3: DEFINE SUCCESS CRITERIA (Measurable Goals)
**Success Criteria**:
1. **Secret mount present**: `--mount=type=secret,id=ssh_key` is used in `RUN` instructions. Verified by [tests/tests_test.go](tests/tests_test.go).
2. **No secret artifacts**: No `ARG SSH`, `ENV SSH`, or `id_rsa` left in the final stage; final image has no secret references. Verified by [tests/tests_test.go](tests/tests_test.go).
3. **Git configured for SSH**: Dockerfile configures SSH for GitHub and uses `GIT_SSH_COMMAND`. Verified by [tests/tests_test.go](tests/tests_test.go).
4. **Module cache used**: `--mount=type=cache,target=/go/pkg/mod` in build stage and used with `go mod download`. Verified by [tests/tests_test.go](tests/tests_test.go).
5. **Deterministic build**: Base images are pinned by digest and `go build` uses `-trimpath -buildvcs=false`. Verified by [tests/tests_test.go](tests/tests_test.go).
6. **Minimal final image**: Final stage base is `scratch` or `gcr.io/distroless/static` and only copies binary + certs. Verified by [tests/tests_test.go](tests/tests_test.go).
7. **Cross-build flags**: `ARG TARGETOS` and `ARG TARGETARCH` exist and `GOOS`/`GOARCH` are passed to `go build`; `CGO_ENABLED=0` set. Verified by [tests/tests_test.go](tests/tests_test.go).
8. **Repository structure**: Root `Dockerfile` exists, and `repository_after/Dockerfile` plus `tests/REQUIREMENTS.md` are present. Verified by [tests/tests_test.go](tests/tests_test.go).
9. **SSH fetch attempt**: If Docker is available, the build must attempt an SSH-based fetch. The test treats expected SSH auth errors as proof of an SSH fetch attempt, while still enforcing image integrity when the build succeeds. Verified by [tests/tests_test.go](tests/tests_test.go).

### 4. Phase 4: MAP REQUIREMENTS TO VALIDATION (Test Strategy)
**Test Strategy**:
- All assertions are consolidated in a single Go test file: [tests/tests_test.go](tests/tests_test.go).
- The suite validates Dockerfile content for BuildKit secret and cache mounts, cross-build flags, and minimal final image behavior.
- Repository structure and `REQUIREMENTS.md` content are checked for consistency.
- The build integrity test attempts a Docker build. If Docker is present and the private repo is inaccessible, the test expects SSH auth errors as evidence of an SSH-based fetch attempt; if the build succeeds, it verifies entrypoint and secret non-leakage.

### 5. Phase 5: SCOPE THE SOLUTION (Minimal Implementation)
**Components created / expected locations**:
- `repository_after/Dockerfile` implementing multi-stage BuildKit patterns with:
  - a build/test stage that uses `--mount=type=secret,id=ssh_key` and `--mount=type=cache,target=/go/pkg/mod` while running `go mod download` and `go build`.
  - a final stage (`AS final`) based on `scratch` or `gcr.io/distroless/static`, copying only the binary and certs.
- Application payload in [repository_after/main.go](repository_after/main.go) and [repository_after/go.mod](repository_after/go.mod).
- Test harness in `tests/` (Go tests) to assert each requirement.

### 6. Phase 6: TRACE DATA/CONTROL FLOW (Build & Verification)
**Build Flow (repository_after/Dockerfile)**:
1. Build starts with BuildKit enabled.
2. In the build stage: `COPY go.mod` then `RUN --mount=type=cache,target=/go/pkg/mod --mount=type=secret,id=ssh_key \
   ssh-keyscan github.com >> /etc/ssh/ssh_known_hosts && \
   GIT_CONFIG_GLOBAL=/tmp/gitconfig GIT_CONFIG_NOSYSTEM=1 GOPRIVATE=github.com/private \
   GIT_SSH_COMMAND="ssh -i /run/secrets/ssh_key -o StrictHostKeyChecking=accept-new" \
   go mod download` — this uses the secret only during module download.
3. `CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -trimpath -buildvcs=false -o /app/bin/secure-build ./main.go` produces a static binary.
4. Final stage copies `/app/bin/secure-build` and `ca-certificates.crt` into a `scratch`/distroless image; base images are pinned by digest and no secret files are copied.

**Verification Flow**:
- Tests parse the `Dockerfile` and `repository_after` to ensure mounts, builds, and final content match the requirements. A Docker build is attempted when available to validate SSH fetch behavior and final image integrity.

### 7. Phase 7: ANTICIPATE OBJECTIONS (Trade-offs & Risks)
**Objection 1**: "Why not pass SSH key via ARG/ENV?"
- **Counter**: ARG/ENV persists in image history or layers; BuildKit secret mounts avoid this by making the secret ephemeral during RUN only.

**Objection 2**: "Is `scratch` practical for debugging?"
- **Counter**: `scratch` is smallest for production; during debugging you may use an intermediate image. Tests require a minimal final image.

**Objection 3**: "Cache mounts complicate reproducibility?"
- **Counter**: Caching speeds iterative builds without adding content to image layers; reproducibility is preserved by pinning module versions.

### 8. Phase 8: VERIFY INVARIANTS / CONSTRAINTS
**Must Satisfy**:
- Secrets only in BuildKit secret mount and not present in final stage. (Checked by [tests/tests_test.go](tests/tests_test.go)).
- Go builds use `CGO_ENABLED=0` and accept `TARGETOS`/`TARGETARCH`. (Checked by [tests/tests_test.go](tests/tests_test.go)).

**Must Not Violate**:
- No `ARG SSH` / `ENV SSH` or `id_rsa` strings in Dockerfile or final stage. (Enforced by tests.)

### 9. Phase 9: EXECUTE WITH SURGICAL PRECISION (Ordered Implementation)
1. Implement `repository_after` payload (`main.go`, `go.mod`).
2. Add `repository_after/Dockerfile` using BuildKit secret and cache mounts.
3. Ensure `CGO_ENABLED=0` and `ARG TARGETOS` / `ARG TARGETARCH` are wired through to `go build`.
4. Create tests (already present in `tests/`) and run them with `go test ./tests` (this is what the evaluation harness executes).
5. Iterate until all tests pass; produce `evaluation/report.json` via the evaluation harness (`go run evaluation.go`).

### 10. Phase 10: MEASURE IMPACT / VERIFY COMPLETION
**Observed verification**:
- Requirements are enumerated in [tests/REQUIREMENTS.md](tests/REQUIREMENTS.md).
- The test suite in `tests/` maps explicitly to each requirement and validates them.
- The evaluation harness [evaluation/evaluation.go](evaluation/evaluation.go) runs each test script and emits a JSON report under `evaluation/<timestamp>/report.json`.

**Completion Criteria**:
- All tests in `tests/` pass when run via `go test ./tests` (this is how the evaluation harness runs them).

### 11. Phase 11: DOCUMENT THE DECISION (Summary & Next Steps)
**Problem**: Build a secure, reproducible container build for a Go binary that uses private Git modules fetched via an SSH key without leaking credentials, and that builds for multiple architectures while caching modules.

**Solution**: Use BuildKit ephemeral secret mounts for SSH, use cache mounts for `/go/pkg/mod` during `go mod download`, and cross-compile with `CGO_ENABLED=0` into a minimal final image.

**Trade-offs**:
- This approach requires BuildKit-enabled builds and slightly more complex Dockerfile authoring compared to naive approaches that leak secrets via `ARG`/`ENV`.

**When to revisit**:
- If the project needs runtime multi-arch images per platform-specific assets, or if a builderless CI environment prevents BuildKit secret mounts, revisit to add Git auth alternatives that remain secure.

**Test Coverage**: The provided Go tests in `tests/tests_test.go` cover structural, behavioral, and content-based assertions for the requirements.

---
Generated from the repository contents and test suite present in this workspace.
# Trajectory
