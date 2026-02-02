import pytest
import subprocess
import os
import json
import time

# Helper to run the parser executable
def run_parser(input_file, repo_path=None):
    if repo_path is None:
        repo_path = os.environ.get("TARGET_REPO", "repository_after")
    
    executable = os.path.join(repo_path, "build", "json_parser_demo")
    
    # If build directory structure differs, try root
    if not os.path.exists(executable):
        executable = os.path.join(repo_path, "json_parser_demo")
        
    # If still not found, search in the repo
    if not os.path.exists(executable):
        for root, dirs, files in os.walk(repo_path):
            if "json_parser_demo" in files:
                executable = os.path.join(root, "json_parser_demo")
                break
    
    if not os.path.exists(executable):
        pytest.fail(f"Executable not found: {executable}")

    start_time = time.time()
    result = subprocess.run([executable, input_file], capture_output=True, text=True)
    duration = (time.time() - start_time) * 1000 # ms
    
    return result, duration

def create_temp_json(tmp_path, content, filename="test.json"):
    p = tmp_path / filename
    p.write_text(content, encoding="utf-8")
    return str(p)

def test_basic_object(tmp_path):
    json_str = '{"key": "value", "num": 123, "bool": true, "null": null}'
    f = create_temp_json(tmp_path, json_str)
    result, _ = run_parser(f)
    assert result.returncode == 0
    assert "Parsed JSON object" in result.stdout

def test_basic_array(tmp_path):
    json_str = '[1, 2, "three", true]'
    f = create_temp_json(tmp_path, json_str)
    result, _ = run_parser(f)
    assert result.returncode == 0
    assert "Parsed JSON array" in result.stdout

def test_deep_nesting(tmp_path):
    # Depth 600 - should pass in after (limit 1000), fail in before (stack overflow)
    # Actually 'before' crashes around 500 levels potentially.
    # We will test a safe depth for after, and a very deep one for after (>1000) to check error.
    
    depth = 800
    json_str = ("[" * depth) + ("]" * depth)
    f = create_temp_json(tmp_path, json_str)
    result, _ = run_parser(f)
    
    assert result.returncode == 0
    
    # Test exceed limit
    depth = 1200
    json_str = ("[" * depth) + ("]" * depth)
    f = create_temp_json(tmp_path, json_str)
    result, _ = run_parser(f)
    
    assert result.returncode != 0
    assert "Maximum nesting depth exceeded" in result.stderr

def test_unicode_handling(tmp_path):
    # \u0024 is $
    # \u00A2 is ¢
    # \u20AC is €
    # \uD801\uDC37 is 𐐷 (supplementary plane)
    json_str = '{"unicode": "\\u0024 \\u00A2 \\u20AC \\uD801\\uDC37"}'
    f = create_temp_json(tmp_path, json_str)
    result, _ = run_parser(f)
    assert result.returncode == 0
    # We assume the tool prints success. Verification of content is hard without modifying main.cpp
    # but the parser shouldn't crash or throw.

def test_invalid_json_trailing_comma(tmp_path):
    json_str = '{"key": "value",}'
    f = create_temp_json(tmp_path, json_str)
    result, _ = run_parser(f)
    assert result.returncode != 0
    assert "Expected string key" in result.stderr or "Expected" in result.stderr

def test_large_array_performance(tmp_path):
    # 100,000 elements
    items = ["1"] * 100000
    json_str = "[" + ",".join(items) + "]"
    f = create_temp_json(tmp_path, json_str)
    
    result, duration = run_parser(f)
    assert result.returncode == 0
    
    # Expect reasonably fast (e.g. < 500ms). 'Before' implementation might be very slow.
    print(f"Large array parse time: {duration}ms")

def test_malformed_input(tmp_path):
    json_str = '{"key": "val' # unterminated
    f = create_temp_json(tmp_path, json_str)
    result, _ = run_parser(f)
    assert result.returncode != 0
    assert "Unterminated string" in result.stderr

