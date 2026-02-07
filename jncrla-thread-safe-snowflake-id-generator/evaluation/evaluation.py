import json
import os
import sys
import unittest
import importlib.util
import uuid

EVAL_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(EVAL_DIR)
REPORT_PATH = os.path.join(EVAL_DIR, "report.json")


def run_tests_with_repo(repo_path):
    os.environ["REPO_PATH"] = repo_path
    for name in list(sys.modules.keys()):
        if name in ("test_snowflake", "snowflake"):
            del sys.modules[name]
    sys.path.insert(0, PROJECT_ROOT)
    loader = unittest.TestLoader()
    spec = importlib.util.spec_from_file_location(
        "test_snowflake",
        os.path.join(PROJECT_ROOT, "tests", "test_snowflake.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    suite = loader.loadTestsFromModule(mod)
    runner = unittest.runner.TextTestRunner(verbosity=0)
    result = runner.run(suite)
    passed = result.testsRun - len(result.failures) - len(result.errors)
    return {
        "tests_run": result.testsRun,
        "passed": passed,
        "failed": len(result.failures),
        "errors": len(result.errors),
        "success": result.wasSuccessful(),
        "failures": [{"test": t[0].id(), "traceback": t[1]} for t in result.failures],
        "errors_list": [{"test": t[0].id(), "traceback": t[1]} for t in result.errors],
    }


def main():
    os.chdir(PROJECT_ROOT)
    run_id = os.environ.get("RUN_ID", str(uuid.uuid4()))
    before = run_tests_with_repo("repository_before")
    after = run_tests_with_repo("repository_after")
    comparison = {
        "before_success": before["success"],
        "after_success": after["success"],
        "before_passed": before["passed"],
        "after_passed": after["passed"],
        "improvement": after["passed"] > before["passed"] or (after["success"] and not before["success"]),
    }
    report = {
        "run_id": run_id,
        "before": before,
        "after": after,
        "comparison": comparison,
    }
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"Report written to {REPORT_PATH}")
    return 0 if after["success"] else 1


if __name__ == "__main__":
    sys.exit(main())
