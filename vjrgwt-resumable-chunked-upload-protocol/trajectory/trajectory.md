# Trajectory: Resumable Chunked Upload Protocol

### 1. Audit / Requirements Analysis (The actual problem)

I mapped the prompt to this repository: implement a custom HTTP/1.1 offset-based resumable upload with POST/HEAD/PATCH, strict sequential consistency, disk-backed storage, and a client that resumes using server truth. The acceptance criteria are enforced by the tests in `tests` and the evaluator.

### 2. Question Assumptions (Challenge the Premise)

I verified that the client must not rely on its own state after a crash. That means the server's HEAD response is the source of truth, even if the client believes it sent more data. I also checked that the repository_before being empty is intentional and should not block evaluation.

### 3. Define Success Criteria (Establish Measurable Goals)

Success was defined as:

1. POST /files returns a unique File ID and creates the file on disk.
2. HEAD /files/{id} returns the committed byte offset in Upload-Offset.
3. PATCH /files/{id} appends only at the exact committed offset; mismatches return 409.
4. Client uploads in 1MB chunks and simulates a crash after 50% completion with a random threshold.
5. Resume logic uses HEAD and Seek to align with server truth.
6. Final server file MD5 matches the local source, including random data.
7. Streaming path works without a Content-Length header.
8. Truncate-resume scenario aligns with HEAD response.
9. CLI uploader generates a large dummy file and drives the upload flow.

### 4. Map Requirements to Validation (Define Test Strategy)

Each requirement is mapped to a test file:

- Endpoints and offsets: `req01_endpoints_test.go`
- Disk write immediacy: `req02_disk_write_test.go`
- Chunking behavior: `req03_chunking_test.go`
- Crash simulation: `req04_crash_test.go`
- Resume via HEAD: `req05_resume_head_test.go`
- MD5 correctness: `req06_md5_test.go`
- Streaming without Content-Length: `req07_streaming_test.go`
- Sequential conflict: `req08_sequential_conflict_test.go`
- Truncate then resume: `req09_truncate_resume_test.go`
- Random integrity: `req10_integrity_random_test.go`
- Dummy file + random crash + CLI build: `req11_cli_dummy_test.go`

### 5. Scope the Solution

Changes are limited to:

- `repository_after/server.go` for server protocol behavior and disk writes.
- `repository_after/client.go` for resumable upload, crash simulation, and dummy file generation.
- `repository_after/cmd/uploader/main.go` for the CLI uploader.
- `tests` for requirement-mapped validation.
- `trajectory/trajectory.md` for this explanation.
  No changes are made to `repository_before` by design.

### 6. Trace Data Flow (Follow the Path)

End-to-end flow:

1. CLI generates a dummy file and starts a new upload via POST.
2. Client HEADs to retrieve Upload-Offset as source of truth.
3. Client Seek()s to the server offset and PATCHes in 1MB chunks.
4. Server verifies offset equality, streams bytes to disk, syncs, and returns new offset.
5. Client simulates a random crash after >= 50% and resumes using HEAD + Seek.
6. On conflict, client re-HEADs and re-seeks, then continues.

### 7. Anticipate Objections (Play Devil's Advocate)

Potential objection: concurrent PATCH calls could interleave and break sequential guarantees. Mitigation: per-file locking is used to serialize writes per file ID. Another objection: Content-Length may be missing; server supports both CopyN and streaming Copy. Another objection: CLI build path differs based on REPO_PATH; tests normalize the path.

### 8. Verify Invariants (Define Constraints)

Key invariants enforced:

- Append-only at exact offset; otherwise 409 with current Upload-Offset.
- Disk-backed writes with fsync per chunk.
- Client resumes using server truth only.
- Chunked uploads do not read entire files into memory.
- CLI path works from repo root or repository_after.
- All tests pass under evaluation.

### 9. Execute with Surgical Precision (Ordered Implementation)

Implementation order:

1. Implement POST/HEAD/PATCH with strict offset checks and disk writes.
2. Add streaming support for request bodies without Content-Length.
3. Implement client resumable upload with HEAD + Seek and crash simulation.
4. Add conflict handling to re-sync on 409.
5. Add per-file locking to protect sequential consistency under concurrency.
6. Add dummy file generation and random crash threshold support.
7. Add a CLI uploader to drive the end-to-end flow.
8. Add tests for dummy file generation, random crash, and CLI build path normalization.

### 10. Measure Impact (Verify Completion)

Evaluation results show all requirement-mapped tests passing. The after-suite confirms protocol correctness, resumability, and integrity checks.

### 11. Document the Decision

This solution prioritizes correctness and explicit source-of-truth alignment: the server owns the committed offset, and the client always queries before resuming. The protocol remains minimal and uses only Go standard library features.

### 12. Infrastructure and Tooling

- `go.work` is respected for module composition.
- Tests run in the provided docker/evaluation harness.
- No external libraries or protocols are used.
