import json
import os
import sys
import unittest

EVAL_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(EVAL_DIR)
REPORT_PATH = os.path.join(EVAL_DIR, "report.json")


def run_tests():
    sys.path.insert(0, PROJECT_ROOT)
    import importlib.util
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
        "failures": [
            {"test": t[0].id(), "traceback": t[1]}
            for t in result.failures
        ],
        "errors_list": [
            {"test": t[0].id(), "traceback": t[1]}
            for t in result.errors
        ],
    }


def main():
    os.chdir(PROJECT_ROOT)
    report = run_tests()
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"Report written to {REPORT_PATH}")
    return 0 if report["success"] else 1


if __name__ == "__main__":
    sys.exit(main())
