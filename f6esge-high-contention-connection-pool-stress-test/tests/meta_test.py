import os
import shutil
import subprocess
import sys
from pathlib import Path

# Paths
ROOT = Path(__file__).parent.parent.resolve()
REPO_DIR = ROOT / "repository_after"
SOURCE_FILE = REPO_DIR / "src" / "main" / "java" / "com" / "cloudscale" / "SimpleConnectionPool.java"
BROKEN_DIR = ROOT / "tests" / "broken"
CORRECT_DIR = ROOT / "tests" / "correct"

def run_maven_test():
    """Runs maven test and returns True if passed, False if failed."""
    # -Dmaven.test.failure.ignore=false ensures exit code is non-zero on failure
    cmd = ["mvn", "clean", "test", "-Dsurefire.useFile=false", "-DtrimStackTrace=false"]

    try:
        result = subprocess.run(
            cmd, 
            cwd=REPO_DIR, 
            capture_output=True, 
            text=True,
            timeout=300
        )
        return result.returncode == 0, result.stdout + result.stderr
    except subprocess.TimeoutExpired:
        return False, "TIMEOUT: Test execution exceeded 300 seconds."

def main():
    print("Starting Meta-Test...")
    
    # 1. Sanity Check: Correct implementation must pass
    print("\n[Meta-Test] Verifying CORRECT implementation...")
    # Ensure we start with correct code
    if not CORRECT_DIR.exists():
        os.makedirs(CORRECT_DIR, exist_ok=True)
        if SOURCE_FILE.exists():
            shutil.copy(SOURCE_FILE, CORRECT_DIR / "SimpleConnectionPool.java")
        else:
             print("Error: Source file not found and no backup exists.")
             sys.exit(1)
             
    shutil.copy(CORRECT_DIR / "SimpleConnectionPool.java", SOURCE_FILE)
    
    passed, output = run_maven_test()
    if not passed:
        print("CRITICAL: The valid implementation FAILED tests!")
        print(output[-2000:])
        sys.exit(1)
    print("MATCH: Correct implementation passed.")

    # 2. Iterate Broken Implementations
    broken_files = list(BROKEN_DIR.glob("*.java"))
    if not broken_files:
        print("Warning: No broken implementations found in tests/broken")
        
    all_caught = True
    
    for broken_file in broken_files:
        print(f"\n[Meta-Test] Testing BROKEN implementation: {broken_file.name}")
        shutil.copy(broken_file, SOURCE_FILE)
        
        passed, output = run_maven_test()
        
        if passed:
            print(f"FAILURE: Test suite PASSED against broken implementation: {broken_file.name}")
            print("The test suite failed to detect the bug.")
            all_caught = False
        else:
            print(f"SUCCESS: Test suite FAILED against broken implementation: {broken_file.name}")
            # Optional: Check if the failure reason is correct (e.g., TimeoutException vs Assertion logic)
            # But simple failure is enough for now.

    # 3. Restore Correct Implementation
    print("\n[Meta-Test] Restoring correct implementation...")
    shutil.copy(CORRECT_DIR / "SimpleConnectionPool.java", SOURCE_FILE)
    
    if all_caught:
        print("\nMETA-TEST PASSED: All broken implementations were caught.")
        sys.exit(0)
    else:
        print("\nMETA-TEST FAILED: Some broken implementations evaded the test suite.")
        sys.exit(1)

if __name__ == "__main__":
    main()
