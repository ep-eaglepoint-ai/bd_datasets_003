from __future__ import annotations
import re


_WS_RE = re.compile(r"\s+")


def sanitize_text(text: str, *, max_len: int = 5000) -> str:
    """
    Normalize input:
    - force string
    - strip
    - collapse whitespace
    - truncate to max_len
    """
    if text is None:
        return ""
    if not isinstance(text, str):
        text = str(text)

    text = text.strip()
    text = _WS_RE.sub(" ", text)
    if len(text) > max_len:
        text = text[:max_len]
    return text
