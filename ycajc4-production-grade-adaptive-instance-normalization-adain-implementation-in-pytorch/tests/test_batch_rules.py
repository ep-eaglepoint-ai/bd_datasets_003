import pytest
import torch
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))
from adain import adain


def test_style_batch_size_one_broadcast():
    content = torch.randn(4, 3, 32, 32)
    style = torch.randn(1, 3, 32, 32)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_style_batch_size_match_content():
    content = torch.randn(4, 3, 32, 32)
    style = torch.randn(4, 3, 32, 32)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_style_batch_size_larger_than_content():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(4, 3, 32, 32)
    with pytest.raises(ValueError, match="style batch size must be 1 or equal to content batch size"):
        adain(content, style)


def test_style_batch_size_smaller_than_content_not_one():
    content = torch.randn(4, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    with pytest.raises(ValueError, match="style batch size must be 1 or equal to content batch size"):
        adain(content, style)


def test_style_batch_size_zero():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(0, 3, 32, 32)
    with pytest.raises(ValueError, match="style batch size must be 1 or equal to content batch size"):
        adain(content, style)


def test_content_batch_size_zero():
    content = torch.randn(0, 3, 32, 32)
    style = torch.randn(1, 3, 32, 32)
    with pytest.raises(ValueError, match="content batch size must be greater than 0"):
        adain(content, style)


def test_single_style_multiple_content():
    content = torch.randn(8, 2, 16)
    style = torch.randn(1, 2, 16)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_single_style_single_content():
    content = torch.randn(1, 4, 8, 8, 8)
    style = torch.randn(1, 4, 8, 8, 8)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_large_batch_broadcast():
    content = torch.randn(32, 1, 64, 64)
    style = torch.randn(1, 1, 64, 64)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_different_spatial_dims_broadcast():
    content = torch.randn(3, 2, 16, 32)
    style = torch.randn(1, 2, 16, 32)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_3d_spatial_broadcast():
    content = torch.randn(2, 3, 8, 16, 16)
    style = torch.randn(1, 3, 8, 16, 16)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_broadcast_statistics_independence():
    content = torch.randn(3, 2, 4)
    style = torch.randn(1, 2, 4)
    result = adain(content, style)
    
    for i in range(3):
        content_single = content[i:i+1]
        result_single = adain(content_single, style)
        assert torch.allclose(result[i:i+1], result_single, atol=1e-6)


def test_error_message_content():
    content = torch.randn(3, 2, 4)
    style = torch.randn(2, 2, 4)
    try:
        adain(content, style)
    except ValueError as e:
        assert "style batch size must be 1 or equal to content batch size" in str(e)
        assert "2" in str(e)
        assert "3" in str(e)


def test_style_broadcast_memory_efficiency():
    content = torch.randn(100, 1, 32, 32)
    style = torch.randn(1, 1, 32, 32)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()
