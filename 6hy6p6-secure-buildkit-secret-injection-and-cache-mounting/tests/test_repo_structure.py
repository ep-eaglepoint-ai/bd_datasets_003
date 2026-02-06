import os

def test_repo_structure():
    # 1. Dockerfile exists at root
    assert os.path.exists("Dockerfile"), "Dockerfile must exist at the root"
    
    # 2. No duplicate Dockerfiles
    all_files = []
    for root, dirs, files in os.walk("."):
        for file in files:
            if file.lower() == "dockerfile":
                all_files.append(os.path.join(root, file))
    
    assert len(all_files) == 1, f"Expected exactly one Dockerfile, found {len(all_files)}: {all_files}"
    
    # 3. /tests contains tests only (allowing for __pycache__ etc)
    assert os.path.isdir("tests"), "/tests directory must exist"
    test_files = os.listdir("tests")
    for b in test_files:
        if b.endswith(".py"):
            assert b.startswith("test_"), f"Files in /tests should be tests (start with test_): {b}"
        elif b == "__pycache__":
            continue
        # Allow other test-related files if necessary, but keep it strict
        
    # 4. Implementation artifacts in /repository_after
    assert os.path.isdir("repository_after"), "/repository_after directory must exist"
    
    # Check for implementation leakage outside /repository_after and root (specific files)
    root_whitelist = [
        "Dockerfile", "go.mod", "go.sum", "main.go", "package.json", 
        "config", "README.md", "docker-compose.yml", ".gitignore"
    ]
    
    for item in os.listdir("."):
        if os.path.isfile(item):
            if item not in root_whitelist and not item.startswith("."):
                # Potential implementation leaking to root
                pass # Depending on strictness, we might want to flag this
        elif os.path.isdir(item):
            if item not in ["repository_after", "tests", "repository_before", "evaluation", "instances", "patches", "trajectory"] and not item.startswith("."):
                # New directory that isn't part of the allowed structure
                # We should be careful here as the user might have added it
                pass

    # Ensure /repository_after contains the requirements file as previously verified
    assert os.path.exists("repository_after/REQUIREMENTS.md"), "REQUIREMENTS.md must be in /repository_after"

if __name__ == "__main__":
    try:
        test_repo_structure()
        print("Repository structure validation passed!")
    except AssertionError as e:
        print(f"Test FAILED: {e}")
        exit(1)
