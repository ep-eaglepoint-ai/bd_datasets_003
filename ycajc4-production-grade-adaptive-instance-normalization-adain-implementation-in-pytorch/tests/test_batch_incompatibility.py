import pytest
import torch
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))
from adain import adain


def test_style_batch_incompatible_raises():
    content = torch.randn(3, 2, 32, 32)
    style = torch.randn(2, 2, 32, 32)
    
    with pytest.raises(ValueError, match="style batch size must be 1 or equal to content batch size"):
        adain(content, style)


def test_style_batch_larger_than_content_raises():
    content = torch.randn(2, 3, 16, 16)
    style = torch.randn(4, 3, 16, 16)
    
    with pytest.raises(ValueError, match="style batch size must be 1 or equal to content batch size"):
        adain(content, style)


def test_style_batch_smaller_than_content_not_one_raises():
    content = torch.randn(4, 3, 16, 16)
    style = torch.randn(2, 3, 16, 16)
    
    with pytest.raises(ValueError, match="style batch size must be 1 or equal to content batch size"):
        adain(content, style)


def test_error_message_contains_batch_sizes():
    content = torch.randn(3, 2, 32, 32)
    style = torch.randn(2, 2, 32, 32)
    
    try:
        adain(content, style)
        assert False, "Should have raised ValueError"
    except ValueError as e:
        error_msg = str(e)
        assert "3" in error_msg
        assert "2" in error_msg
        assert "style batch size" in error_msg
        assert "content batch size" in error_msg
