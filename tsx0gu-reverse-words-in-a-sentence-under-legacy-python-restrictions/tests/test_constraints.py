import pytest
import ast
import inspect
import sys
import os


@pytest.fixture(scope="module")
def reverse_words_source(request):
    """Fixture to get the source code of reverse_words function."""
    repo = request.config.getoption("--repo")
    
    if repo == "before":
        repo_path = os.path.join(os.path.dirname(__file__), '../repository_before')
    else:
        repo_path = os.path.join(os.path.dirname(__file__), '../repository_after')
    
    sys.path.insert(0, repo_path)
    
    from reverse_words import reverse_words
    
    source = inspect.getsource(reverse_words)
    return source, reverse_words


class TestConstraintValidation:
    """Tests to validate boundary constraints are enforced."""
    
    def test_no_split_method_used(self, reverse_words_source):
        """Constraint: Must not use split()."""
        source, _ = reverse_words_source
        assert '.split(' not in source, "Implementation uses forbidden split() method"
    
    def test_no_join_method_used(self, reverse_words_source):
        """Constraint: Must not use join()."""
        source, _ = reverse_words_source
        assert '.join(' not in source, "Implementation uses forbidden join() method"
    
    def test_no_reversed_function_used(self, reverse_words_source):
        """Constraint: Must not use reversed()."""
        source, _ = reverse_words_source
        assert 'reversed(' not in source, "Implementation uses forbidden reversed() function"
    
    def test_no_negative_step_slicing(self, reverse_words_source):
        """Constraint: Must not use slicing with negative steps ([::-1])."""
        source, _ = reverse_words_source
        # Check for common patterns of negative step slicing
        assert '[::-1]' not in source, "Implementation uses forbidden negative step slicing [::-1]"
        assert '::-1' not in source, "Implementation uses forbidden negative step slicing"
        
        # Parse AST to check for any slice with negative step
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, ast.Slice):
                if node.step and isinstance(node.step, ast.UnaryOp) and isinstance(node.step.op, ast.USub):
                    pytest.fail("Implementation uses negative step slicing")
                if node.step and isinstance(node.step, ast.Constant) and node.step.value < 0:
                    pytest.fail("Implementation uses negative step slicing")
    
    def test_no_list_creation(self, reverse_words_source):
        """Constraint: Must not use any form of list creation or usage."""
        source, _ = reverse_words_source
        tree = ast.parse(source)
        
        for node in ast.walk(tree):
            # Check for list literals []
            if isinstance(node, ast.List):
                pytest.fail("Implementation uses forbidden list literal []")
            
            # Check for list() constructor
            if isinstance(node, ast.Call):
                if isinstance(node.func, ast.Name) and node.func.id == 'list':
                    pytest.fail("Implementation uses forbidden list() constructor")
            
            # Check for list methods (append, insert, etc.)
            if isinstance(node, ast.Attribute):
                if node.attr in ['append', 'insert', 'extend', 'pop', 'remove']:
                    pytest.fail(f"Implementation uses forbidden list method .{node.attr}()")
    
    def test_exactly_one_while_loop(self, reverse_words_source):
        """Constraint: Must use exactly one while loop."""
        source, _ = reverse_words_source
        tree = ast.parse(source)
        
        while_count = 0
        for node in ast.walk(tree):
            if isinstance(node, ast.While):
                while_count += 1
        
        assert while_count == 1, f"Implementation must have exactly one while loop, found {while_count}"
    
    def test_no_for_loops(self, reverse_words_source):
        """Constraint: Must use no for loops."""
        source, _ = reverse_words_source
        tree = ast.parse(source)
        
        for node in ast.walk(tree):
            if isinstance(node, ast.For):
                pytest.fail("Implementation uses forbidden for loop")
    
    def test_uses_string_concatenation(self, reverse_words_source):
        """Constraint: Must build result using only string concatenation (+)."""
        source, _ = reverse_words_source
        tree = ast.parse(source)
        
        # Check that there's at least one Add operation (string concatenation)
        has_add = False
        for node in ast.walk(tree):
            if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
                has_add = True
                break
        
        assert has_add, "Implementation must use string concatenation (+) to build result"
    
    def test_required_comment_present(self, reverse_words_source):
        """Constraint: Must include exactly one comment with required wording."""
        source, _ = reverse_words_source
        required_comment = "Forced to use string concatenation and while loop due to banned list and slice operations"
        
        assert required_comment in source, f"Implementation must include the exact comment: '{required_comment}'"
        
        # Count occurrences to ensure exactly one
        comment_count = source.count(required_comment)
        assert comment_count == 1, f"Implementation must have exactly one required comment, found {comment_count}"
    
    def test_no_docstring_present(self, reverse_words_source):
        """Constraint: Must not include docstrings."""
        source, _ = reverse_words_source
        tree = ast.parse(source)
        
        # Get the function definition
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) and node.name == 'reverse_words':
                # Check if first statement is a string (docstring)
                if node.body and isinstance(node.body[0], ast.Expr):
                    if isinstance(node.body[0].value, (ast.Str, ast.Constant)):
                        if isinstance(node.body[0].value, ast.Constant) and isinstance(node.body[0].value.value, str):
                            pytest.fail("Implementation contains forbidden docstring")
                        elif isinstance(node.body[0].value, ast.Str):
                            pytest.fail("Implementation contains forbidden docstring")
    
    def test_no_print_statements(self, reverse_words_source):
        """Constraint: Must not include print statements."""
        source, _ = reverse_words_source
        tree = ast.parse(source)
        
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                if isinstance(node.func, ast.Name) and node.func.id == 'print':
                    pytest.fail("Implementation contains forbidden print statement")
    
    def test_processes_right_to_left(self, reverse_words_source):
        """Constraint: Must process the string from right to left."""
        source, _ = reverse_words_source
        
        # Check for initialization pattern: i = len(sentence) - 1
        assert 'len(' in source, "Implementation should use len() for right-to-left processing"
        assert '- 1' in source or '-1' in source, "Implementation should start from len(sentence) - 1"
    
    def test_single_comment_only(self, reverse_words_source):
        """Constraint: Must not include any additional comments beyond the required one."""
        source, _ = reverse_words_source
        
        # Count comment lines (lines starting with # after stripping whitespace)
        lines = source.split('\n')
        comment_lines = [line.strip() for line in lines if line.strip().startswith('#')]
        
        assert len(comment_lines) == 1, f"Implementation must have exactly one comment, found {len(comment_lines)}"
    
    def test_function_signature_correct(self, reverse_words_source):
        """Validate function has correct signature."""
        source, func = reverse_words_source
        
        # Check function name
        assert func.__name__ == 'reverse_words', "Function must be named 'reverse_words'"
        
        # Check parameter count
        sig = inspect.signature(func)
        params = list(sig.parameters.keys())
        assert len(params) == 1, f"Function must accept exactly one parameter, found {len(params)}"
    
    def test_no_list_comprehension(self, reverse_words_source):
        """Constraint: Must not use list comprehensions."""
        source, _ = reverse_words_source
        tree = ast.parse(source)
        
        for node in ast.walk(tree):
            if isinstance(node, ast.ListComp):
                pytest.fail("Implementation uses forbidden list comprehension")
    
    def test_no_generator_to_list_conversion(self, reverse_words_source):
        """Constraint: Must not use generator expressions converted to lists."""
        source, _ = reverse_words_source
        tree = ast.parse(source)
        
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                if isinstance(node.func, ast.Name) and node.func.id == 'list':
                    if node.args and isinstance(node.args[0], ast.GeneratorExp):
                        pytest.fail("Implementation uses forbidden generator-to-list conversion")

