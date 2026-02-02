import json
import os
import platform
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path


def generate_run_id() -> str:
    return "run-fixed"


def get_environment_info() -> dict:
    return {
        "python_version": sys.version.split()[0],
        "platform": platform.platform(),
        "os_type": platform.system(),
        "execution_mode": "Inside Docker Container"
        if os.getenv("INSIDE_DOCKER") == "true"
        else "Host Machine",
    }


def generate_output_path() -> Path:
    output_dir = Path(__file__).resolve().parent / "reports"
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir / "report.json"


def parse_junit(junit_path: Path) -> list[dict]:
    tests = []
    tree = ET.parse(junit_path)
    root = tree.getroot()

    for testcase in root.iter("testcase"):
        name = testcase.attrib.get("name", "unknown")
        suite = testcase.attrib.get("classname", "unknown")
        outcome = "passed"
        for child in testcase:
            if child.tag in {"failure", "error"}:
                outcome = "failed"
                break
            if child.tag == "skipped":
                outcome = "skipped"
                break
        tests.append({"suite": suite, "name": name, "outcome": outcome})
    return tests


def run_tests(target: str) -> dict:
    junit_path = Path("/tmp") / f"pytest-{target}.xml"
    pytest_command = [
        "pytest",
        "-q",
        "-vv",
        "tests",
        f"--junitxml={junit_path}",
    ]

    env = {**os.environ, "TARGET_REPO": target, "CI": "true"}
    
    # If running as root (to write reports), we must downgrade to postgres user for the tests
    # because the ensure_postgres fixture spawns a postgres server which refuses to run as root.
    if os.geteuid() == 0:
        # Construct the environment variables to pass through to the inner postgres user
        vars_to_pass = [
            "TARGET_REPO", "CI", "PATH", "DATABASE_URL", "REDIS_URL", 
            "PYTEST_ADDOPTS", "PYTHONPYCACHEPREFIX", "INSIDE_DOCKER"
        ]
        env_cmd = ["env"]
        for key in vars_to_pass:
            if key in env:
                env_cmd.append(f"{key}={env[key]}")
        
        # Wrap the command: runuser -u postgres -- env VAR=VAL pytest ...
        command = ["runuser", "-u", "postgres", "--"] + env_cmd + pytest_command
    else:
        command = pytest_command

    start_time = time.time()
    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        env=env,
    )

    tests = parse_junit(junit_path) if junit_path.exists() else []
    summary = {
        "total": len(tests),
        "passed": len([t for t in tests if t["outcome"] == "passed"]),
        "failed": len([t for t in tests if t["outcome"] == "failed"]),
        "skipped": len([t for t in tests if t["outcome"] == "skipped"]),
        "errors": 1 if result.returncode != 0 and not tests else 0,
    }

    return {
        "success": result.returncode == 0,
        "exit_code": result.returncode,
        "tests": tests,
        "summary": summary,
        "stdout": result.stdout,
        "stderr": result.stderr,
        "duration_ms": int((time.time() - start_time) * 1000),
    }


def map_criteria(tests: list[dict]) -> dict:
    def check(fragment: str) -> str:
        matching = [t for t in tests if fragment in t["name"]]
        if not matching:
            return "Not Run"
        return "Fail" if any(t["outcome"] == "failed" for t in matching) else "Pass"

    return {
        "query_count_optimized": check("test_query_count_optimized"),
        "trigram_search_uses_index": check("test_trigram_search_uses_index"),
        "filter_indexes_exist": check("test_filter_indexes_exist"),
        "count_uses_sql": check("test_count_query_uses_sql_count"),
        "cache_reuse": check("test_cache_reuse_avoids_db_hits"),
        "pagination_index": check("test_pagination_plan_uses_index"),
        "relevance_sorting": check("test_relevance_sorting_places_exact_match_first"),
        "cache_invalidation": check("test_cache_invalidation_on_update"),
        "pool_configuration": check("test_engine_pool_configuration"),
    }


def main() -> None:
    run_id = generate_run_id()

    before_results = run_tests("before")
    after_results = run_tests("after")

    report = {
        "run_id": run_id,
        "tool": "Product Search Optimization Evaluator",
        "started_at": datetime.utcnow().isoformat() + "Z",
        "environment": get_environment_info(),
        "before": before_results,
        "after": after_results,
        "criteria_analysis": {
            "before": map_criteria(before_results["tests"]),
            "after": map_criteria(after_results["tests"]),
        },
        "comparison": {
            "summary": "Containerized Evaluation",
            "success": after_results["success"],
        },
    }

    output_path = generate_output_path()
    output_path.write_text(json.dumps(report, indent=2))

    print("\n---------------------------------------------------")
    print("Before Results:")
    print(f"  Tests Run: {before_results['summary']['total']}")
    print(f"  Passed:    {before_results['summary']['passed']}")
    print(f"  Failed:    {before_results['summary']['failed']}")
    print("---------------------------------------------------")
    print("After Results:")
    print(f"  Tests Run: {after_results['summary']['total']}")
    print(f"  Passed:    {after_results['summary']['passed']}")
    print(f"  Failed:    {after_results['summary']['failed']}")
    print("---------------------------------------------------")
    print(f"Report saved to: {output_path}")


if __name__ == "__main__":
    main()
