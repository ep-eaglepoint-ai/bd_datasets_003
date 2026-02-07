import ast
import io
import os
import tokenize


def _load_adain_source():
    adain_path = os.path.join(os.path.dirname(__file__), "..", "repository_after", "adain.py")
    with open(adain_path, "r", encoding="utf-8") as handle:
        return handle.read()


def test_no_docstrings():
    source = _load_adain_source()
    tree = ast.parse(source)

    if ast.get_docstring(tree) is not None:
        raise AssertionError("Module docstring is not allowed")

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            if ast.get_docstring(node) is not None:
                raise AssertionError(f"Docstring is not allowed for {node.__class__.__name__} '{node.name}'")


def test_no_inline_comments():
    source = _load_adain_source()
    tokens = tokenize.generate_tokens(io.StringIO(source).readline)
    for tok in tokens:
        if tok.type == tokenize.COMMENT:
            comment = tok.string.strip()
            if comment.startswith("#!"):
                continue
            raise AssertionError("Inline comments are not allowed in adain.py")
