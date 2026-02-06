import os
import re

def test_secret_injection():
    dockerfile_path = "Dockerfile"
    assert os.path.exists(dockerfile_path), "Dockerfile does not exist"
    
    with open(dockerfile_path, "r") as f:
        content = f.read()
    
    # Assert Dockerfile contains --mount=type=secret,id=ssh_key
    assert "--mount=type=secret,id=ssh_key" in content, \
        "Dockerfile must contain --mount=type=secret,id=ssh_key"
    
    # Assert Dockerfile does NOT contain ARG SSH, ENV SSH, or id_rsa
    assert not re.search(r"ARG\s+SSH", content, re.IGNORECASE), "Dockerfile must NOT contain ARG SSH"
    assert not re.search(r"ENV\s+SSH", content, re.IGNORECASE), "Dockerfile must NOT contain ENV SSH"
    assert "id_rsa" not in content, "Dockerfile must NOT contain 'id_rsa'"
    
    # Assert git is configured to use ssh://git@github.com
    # The requirement says "ssh://git@github.com" but git config usually uses "ssh://git@github.com/" or just "git@github.com:"
    # I'll check for the core pattern.
    assert "ssh://git@github.com/" in content or "ssh://git@github.com" in content, \
        "Git must be configured to use ssh://git@github.com"
    
    # Assert secret mount is scoped to a single RUN instruction
    # We check if --mount=type=secret is followed by other commands in the same RUN
    # and not present outside RUN (though BuildKit requires it inside RUN or similar instructions anyway)
    
    run_with_mounts = re.findall(r"RUN\s+--mount=type=secret,id=ssh_key.*", content)
    assert len(run_with_mounts) == 1, "Secret mount should be scoped to a single RUN instruction"
    
if __name__ == "__main__":
    try:
        test_secret_injection()
        print("Secret injection tests passed!")
    except AssertionError as e:
        print(f"Test FAILED: {e}")
        exit(1)
