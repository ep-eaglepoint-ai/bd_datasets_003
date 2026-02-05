import os
import sys
import pytest
import importlib.util

parser_dir = os.environ.get("PARSER_PATH")
if not parser_dir:
    raise RuntimeError("PARSER_PATH environment variable not set")
parser_path = os.path.join(parser_dir, "parser.py")
if not os.path.isfile(parser_path):
    raise FileNotFoundError(f"PARSER_PATH does not exist: {parser_path}")

spec = importlib.util.spec_from_file_location("parse_markdown", parser_path)
parse_module = importlib.util.module_from_spec(spec)
sys.modules["parse_markdown"] = parse_module
spec.loader.exec_module(parse_module)
parse_markdown = parse_module.parse_markdown

def test_empty_input():
    assert parse_markdown("") == ""
    assert parse_markdown("   \n  ") == ""


def test_headings():
    md = "# H1\n## H2 ##\n### H3"
    html = parse_markdown(md)
    assert "<h1>H1</h1>" in html
    assert "<h2>H2</h2>" in html
    assert "<h3>H3</h3>" in html


def test_paragraph_merging():
    md = "Line one\nLine two\n\nLine three"
    html = parse_markdown(md)
    assert "<p>Line one Line two</p>" in html
    assert "<p>Line three</p>" in html


def test_bold_and_italic():
    md = "**bold** *italic* __bold2__ _italic2_"
    html = parse_markdown(md)
    assert "<strong>bold</strong>" in html
    assert "<em>italic</em>" in html
    assert "<strong>bold2</strong>" in html
    assert "<em>italic2</em>" in html


def test_unclosed_formatting_literal():
    md = "**bold *italic"
    html = parse_markdown(md)
    assert "**bold *italic" in html


def test_inline_code():
    md = "`<script>`"
    html = parse_markdown(md)
    assert "<code>&lt;script&gt;</code>" in html


def test_code_block_no_parsing():
    md = """```python
**not bold**
<script>
```"""
    html = parse_markdown(md)
    assert "<strong>" not in html
    assert "&lt;script&gt;" in html


def test_safe_link():
    md = "[ok](https://example.com)"
    html = parse_markdown(md)
    assert '<a href="https://example.com">ok</a>' in html


def test_block_javascript_link():
    md = "[bad](javascript:alert(1))"
    html = parse_markdown(md)
    assert "<a" not in html
    assert "bad" in html


def test_unordered_list():
    md = "- a\n- b\n- c"
    html = parse_markdown(md)
    assert "<ul>" in html
    assert html.count("<li>") == 3


def test_ordered_list():
    md = "1. a\n2. b\n3. c"
    html = parse_markdown(md)
    assert "<ol>" in html
    assert html.count("<li>") == 3


def test_horizontal_rule():
    md = "before\n\n---\n\nafter"
    html = parse_markdown(md)
    assert "<hr>" in html


def test_html_escaping():
    md = "<b>x</b>"
    html = parse_markdown(md)
    assert "&lt;b&gt;x&lt;/b&gt;" in html


def test_large_input_no_crash():
    md = "word " * 50000
    html = parse_markdown(md)
    assert "<p>" in html
