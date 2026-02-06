import os

EXPECTED_REQUIREMENTS = [
    "Secret injection via RUN --mount=type=secret,id=ssh_key",
    "No ARG / ENV for secrets",
    "Git configured to use SSH with the injected secret",
    "Go module cache via --mount=type=cache,target=/go/pkg/mod",
    "Final image must be scratch or gcr.io/distroless/static",
    "Use ARG TARGETOS and ARG TARGETARCH",
    "Pass them to go build",
    "CGO_ENABLED=0",
    "Secret must not exist in final image",
    "Cross-build for linux/amd64 and linux/arm64"
]

def test_requirements_lock():
    # Construct path to REQUIREMENTS.md
    # Assuming the test is run from the root of the repository
    req_file_path = os.path.join("repository_after", "REQUIREMENTS.md")
    
    assert os.path.exists(req_file_path), f"File {req_file_path} does not exist"
    
    with open(req_file_path, "r") as f:
        lines = [line.strip() for line in f.readlines() if line.strip()]
    
    # Check if each expected requirement is present in order and verbatim
    # The REQUIREMENTS.md might have numbers (e.g., "1. Requirement text")
    # So we should strip the leading number and dot if present.
    
    actual_requirements = []
    for line in lines:
        # Expected format "1. Requirement..."
        if ". " in line:
            parts = line.split(". ", 1)
            actual_requirements.append(parts[1])
        else:
            actual_requirements.append(line)
            
    assert len(actual_requirements) == len(EXPECTED_REQUIREMENTS), \
        f"Expected {len(EXPECTED_REQUIREMENTS)} requirements, found {len(actual_requirements)}"
    
    for i, (expected, actual) in enumerate(zip(EXPECTED_REQUIREMENTS, actual_requirements)):
        assert expected == actual, f"Requirement {i+1} mismatch:\nExpected: {expected}\nActual:   {actual}"

if __name__ == "__main__":
    test_requirements_lock()
    print("All requirements verified successfully!")
