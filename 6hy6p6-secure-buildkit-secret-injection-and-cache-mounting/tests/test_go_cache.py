import os
import re

def test_go_cache():
    dockerfile_path = "Dockerfile"
    assert os.path.exists(dockerfile_path), "Dockerfile does not exist"
    
    with open(dockerfile_path, "r") as f:
        content = f.read()
    
    # Assert cache mount exists with correct target
    assert "--mount=type=cache,target=/go/pkg/mod" in content, \
        "Dockerfile must contain --mount=type=cache,target=/go/pkg/mod"
    
    # Assert go.mod is copied before source code
    # Typically, "COPY go.mod" should appear before "COPY ." or "COPY src"
    copy_go_mod_pos = content.find("COPY go.mod")
    copy_all_pos = content.find("COPY .")
    
    assert copy_go_mod_pos != -1, "Dockerfile must copy go.mod"
    if copy_all_pos != -1:
        assert copy_go_mod_pos < copy_all_pos, "go.mod must be copied before the rest of the source code"
    
    # Assert cache mount is used during module download
    # Check if a line containing go mod download also contains the cache mount
    module_download_lines = re.findall(r"RUN.*--mount=type=cache,target=/go/pkg/mod.*go mod download", content, re.DOTALL)
    assert len(module_download_lines) > 0, "Go module cache must be used with 'go mod download'"

    # Assert cache mount is not copied into later production stages
    stages = re.split(r"(?i)^FROM\s+", content, flags=re.MULTILINE)
    for stage_content in stages:
        if " AS final" in stage_content or " as final" in stage_content:
            assert "--mount=type=cache" not in stage_content, "Cache mount must not leak into final stage"

if __name__ == "__main__":
    try:
        test_go_cache()
        print("Go module cache tests passed!")
    except AssertionError as e:
        print(f"Test FAILED: {e}")
        exit(1)
