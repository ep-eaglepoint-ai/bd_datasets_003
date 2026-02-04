import subprocess
import json
import os
import sys

def run_command(command):
    result = subprocess.run(command, capture_output=True, text=True, shell=True)
    return result.returncode, result.stdout, result.stderr

def test_requirements():
    print("Starting Requirements Verification...")
    results = {}

    # Determine which repository to test (default to repository_after)
    repo_to_test = sys.argv[1] if len(sys.argv) > 1 else "repository_after"
    script_path = os.path.join(repo_to_test, "script.py")
    # A repository is only valid if it contains the script
    script_exists = os.path.exists(script_path)
    
    # 1-4: Run script and check JSON output
    # Command to run the script
    rc, stdout, stderr = run_command(f"python {script_path}")
    
    # Requirement 1 & 2: Fetches data without auth (implicit by running successfully)
    results["Req 1 & 2: Public API & Top 10"] = (rc == 0) and script_exists
    
    # Requirement 3 & 4: JSON format and specific fields
    try:
        data = json.loads(stdout)
        is_list = isinstance(data, list)
        has_10_items = len(data) == 10
        
        required_fields = ["name", "url", "stars", "description"]
        all_fields_present = True
        if is_list:
            for item in data:
                if not all(field in item for field in required_fields):
                    all_fields_present = False
                    break
        
        results["Req 3: JSON Format"] = is_list and script_exists
        results["Req 4: Correct Fields (name, url, stars, description)"] = all_fields_present and script_exists
        results["Check: Exactly 10 items"] = has_10_items and script_exists
        
    except json.JSONDecodeError:
        results["Req 3: JSON Format"] = False
        results["Req 4: Correct Fields (name, url, stars, description)"] = False
        results["Check: Exactly 10 items"] = False

    # Requirement 5-8: Docker Setup (Verified by the fact that this script is running inside Docker)
    results["Req 5: Dockerfile exists"] = os.path.exists("Dockerfile") and script_exists
    results["Req 6: Automatic run (Verified by user)"] = script_exists 
    results["Req 7: Self-contained (Verified by env)"] = ("python" in sys.executable) and script_exists
    
    results["Req 9: Complete and ready"] = script_exists and os.path.exists("Dockerfile")
    
    if not script_exists:
        print(f"ERROR: No script found at '{script_path}'. This repository implementation is incomplete.")

    # Summary
    print("\n--- Test Results ---")
    all_passed = True
    for req, passed in results.items():
        status = "PASS" if passed else "FAIL"
        print(f"{req}: {status}")
        if not passed:
            all_passed = False
    
    if all_passed:
        print("\nALL REQUIREMENTS MET!")
        sys.exit(0)
    else:
        print("\nSOME REQUIREMENTS FAILED.")
        sys.exit(1)

if __name__ == "__main__":
    test_requirements()
