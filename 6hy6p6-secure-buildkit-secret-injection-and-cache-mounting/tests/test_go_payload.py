import os

def test_go_payload():
    # 1. Assert /repository_after/main.go exists
    assert os.path.exists("repository_after/main.go"), "/repository_after/main.go must exist"
    
    # 2. Assert /repository_after/go.mod exists
    assert os.path.exists("repository_after/go.mod"), "/repository_after/go.mod must exist"
    
    # 3. Assert go.mod references at least one private GitHub module
    with open("repository_after/go.mod", "r") as f:
        go_mod = f.read()
    assert "github.com/" in go_mod, "go.mod must reference a GitHub module"
    # The requirement says "private GitHub module", we use placeholder
    assert "github.com/private-org/private-lib" in go_mod, "go.mod must reference a private GitHub module"
    
    # 4. Assert main.go defines package main
    with open("repository_after/main.go", "r") as f:
        main_lines = f.readlines()
    package_main_found = any(line.strip() == "package main" for line in main_lines)
    assert package_main_found, "main.go must define package main"
    
    # 5. Assert build does not rely on CGO (checked via Dockerfile in other tests, 
    # but we can check if main.go avoids CGO imports)
    assert "import \"C\"" not in "".join(main_lines), "main.go should not use CGO"

if __name__ == "__main__":
    try:
        test_go_payload()
        print("Go payload tests passed!")
    except AssertionError as e:
        print(f"Test FAILED: {e}")
        exit(1)
