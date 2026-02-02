import pytest
from repository_after.services.markdown_service import MarkdownService
from repository_after.services.diff_service import DiffService

def test_markdown_rendering():
    content = "# Title\n**bold**"
    html = MarkdownService.render_to_html(content)
    assert "<h1>Title</h1>" in html
    assert "<strong>bold</strong>" in html

def test_markdown_sanitization():
    content = "Check this <script>alert('xss')</script> <img src=x onerror=alert(1)>"
    html = MarkdownService.render_to_html(content)
    assert "<script>" not in html
    assert "onerror" not in html
    assert 'src="x"' in html # bleach might keep src but strip dangerous attributes

def test_diff_service_output():
    old = "Hello world"
    new = "Hello brave world"
    
    structured = DiffService.get_structured_diff(old, new)
    # Verify word-level insertion
    assert any(d["type"] == "insert" and "brave" in d["text"] for d in structured)
    # Verify it handles punctuation/words correctly (word-based requirement)
    assert any(d["type"] == "equal" and "Hello " in d["text"] for d in structured)
