import ast
import os
import pytest

# Get the target file from environment, default to repository_after if not set (for local runs)
TARGET_FILE = os.environ.get('TARGET_FILE', 'repository_after/report_generator.py')

def should_xfail():
    """Check if we are testing the legacy 'before' code."""
    return 'repository_before' in TARGET_FILE

def get_ast_tree(filepath):
    """Parses the target file into an AST tree."""
    if not os.path.isabs(filepath):
        # Assume relative to project root (parent of tests dir)
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        filepath = os.path.join(project_root, filepath)
    
    if not os.path.exists(filepath):
        pytest.fail(f"Target file not found: {filepath}")
        
    with open(filepath, "r") as f:
        return ast.parse(f.read(), filename=filepath)

def get_class_method(tree, class_name, method_name):
    """Finds a method definition within a class."""
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == class_name:
            for item in node.body:
                if isinstance(item, ast.FunctionDef) and item.name == method_name:
                    return item
    return None

@pytest.mark.xfail(condition=should_xfail(), reason="Legacy code expected to check failed optimization checks", strict=False)
def test_requirements_analyze_text_single_pass():
    """Verify analyze_text has at most one main loop over the text."""
    tree = get_ast_tree(TARGET_FILE)
    method = get_class_method(tree, "ReportGenerator", "analyze_text")
    
    if not method:
        pytest.fail(f"Method ReportGenerator.analyze_text not found in {TARGET_FILE}")
        
    # Count For and While loops
    loops = [node for node in ast.walk(method) if isinstance(node, (ast.For, ast.While))]
    
    # Requirement: Exactly ONE loop (or zero if they did something magical, but one is expected)
    # The original unoptimized code has 5 loops. The optimized should have 1.
    assert len(loops) <= 1, f"Optimization failure: analyze_text has {len(loops)} loops, expected <= 1."

@pytest.mark.xfail(condition=should_xfail(), reason="Legacy code expected to check failed optimization checks", strict=False)
def test_requirements_sanitize_text_uses_replace():
    """Verify sanitize_text uses str.replace instead of manual looping."""
    tree = get_ast_tree(TARGET_FILE)
    method = get_class_method(tree, "ReportGenerator", "sanitize_text")
    
    if not method:
        pytest.fail(f"Method ReportGenerator.sanitize_text not found in {TARGET_FILE}")
    
    # Check for .replace() calls
    calls_replace = False
    for node in ast.walk(method):
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Attribute) and node.func.attr == "replace":
                calls_replace = True
                break
                
    assert calls_replace, "Optimization failure: sanitize_text does not use str.replace()."

@pytest.mark.xfail(condition=should_xfail(), reason="Legacy code expected to check failed optimization checks", strict=False)
def test_requirements_build_table_no_plus_equals_in_loops():
    """Verify build_table does not use += string concatenation inside loops."""
    tree = get_ast_tree(TARGET_FILE)
    method = get_class_method(tree, "ReportGenerator", "build_table")
    
    if not method:
        pytest.fail(f"Method ReportGenerator.build_table not found in {TARGET_FILE}")

    for node in ast.walk(method):
        if isinstance(node, (ast.For, ast.While)):
            # Walk children of the loop
            for child in ast.walk(node):
                if isinstance(child, ast.AugAssign) and isinstance(child.op, ast.Add):
                    pytest.fail(f"Optimization failure: Found '+=' inside loop at line {child.lineno} in build_table.")

