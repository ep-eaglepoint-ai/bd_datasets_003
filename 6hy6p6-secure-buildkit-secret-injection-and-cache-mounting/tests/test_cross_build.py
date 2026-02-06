import os
import re

def test_cross_build():
    dockerfile_path = "Dockerfile"
    assert os.path.exists(dockerfile_path), "Dockerfile does not exist"
    
    with open(dockerfile_path, "r") as f:
        content = f.read()
    
    # Assert ARG TARGETOS exists
    assert re.search(r"ARG\s+TARGETOS", content, re.IGNORECASE), "Dockerfile must contain ARG TARGETOS"
    
    # Assert ARG TARGETARCH exists
    assert re.search(r"ARG\s+TARGETARCH", content, re.IGNORECASE), "Dockerfile must contain ARG TARGETARCH"
    
    # Assert GOOS=$TARGETOS is passed to go build
    assert "GOOS=${TARGETOS}" in content or "GOOS=$TARGETOS" in content, \
        "GOOS=$TARGETOS must be passed to go build"
    
    # Assert GOARCH=$TARGETARCH is passed to go build
    assert "GOARCH=${TARGETARCH}" in content or "GOARCH=$TARGETARCH" in content, \
        "GOARCH=$TARGETARCH must be passed to go build"
    
    # Assert CGO_ENABLED=0
    assert "CGO_ENABLED=0" in content, "CGO_ENABLED=0 must be set for go build"

if __name__ == "__main__":
    try:
        test_cross_build()
        print("Cross-compilation tests passed!")
    except AssertionError as e:
        print(f"Test FAILED: {e}")
        exit(1)
