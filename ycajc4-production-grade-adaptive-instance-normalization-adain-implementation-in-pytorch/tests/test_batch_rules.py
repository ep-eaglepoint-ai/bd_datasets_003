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
    
    style_expanded = style.expand(4, -1, -1, -1)
    style_mean = style_expanded.mean(dim=(2, 3), keepdim=True)
    style_std = style_expanded.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-5)
    assert torch.allclose(result_std, style_std, atol=1e-5)


def test_style_batch_size_match_content():
    content = torch.randn(4, 3, 32, 32)
    style = torch.randn(4, 3, 32, 32)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    style_mean = style.mean(dim=(2, 3), keepdim=True)
    style_std = style.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-5)
    assert torch.allclose(result_std, style_std, atol=1e-5)


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
    
    style_expanded = style.expand(8, -1, -1)
    style_mean = style_expanded.mean(dim=2, keepdim=True)
    style_std = style_expanded.std(dim=2, keepdim=True, unbiased=False)
    
    result_mean = result.mean(dim=2, keepdim=True)
    result_std = result.std(dim=2, keepdim=True, unbiased=False)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-5)
    assert torch.allclose(result_std, style_std, atol=1e-5)


def test_single_style_single_content():
    content = torch.randn(1, 4, 8, 8, 8)
    style = torch.randn(1, 4, 8, 8, 8)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()
    
    spatial_dims = (2, 3, 4)
    result_mean = result.mean(dim=spatial_dims, keepdim=True)
    result_std = result.std(dim=spatial_dims, keepdim=True, unbiased=False)
    style_mean = style.mean(dim=spatial_dims, keepdim=True)
    style_std = style.std(dim=spatial_dims, keepdim=True, unbiased=False)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-5)
    assert torch.allclose(result_std, style_std, atol=1e-5)


def test_large_batch_broadcast():
    content = torch.randn(32, 1, 64, 64)
    style = torch.randn(1, 1, 64, 64)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()
    
    style_expanded = style.expand(32, -1, -1, -1)
    style_mean = style_expanded.mean(dim=(2, 3), keepdim=True)
    style_std = style_expanded.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-4)  # Looser tolerance for large tensors
    assert torch.allclose(result_std, style_std, atol=1e-4)


def test_different_spatial_dims_broadcast():
    content = torch.randn(3, 2, 16, 32)
    style = torch.randn(1, 2, 16, 32)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()
    
    style_expanded = style.expand(3, -1, -1, -1)
    style_mean = style_expanded.mean(dim=(2, 3), keepdim=True)
    style_std = style_expanded.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-5)
    assert torch.allclose(result_std, style_std, atol=1e-5)


def test_3d_spatial_broadcast():
    content = torch.randn(2, 3, 8, 16, 16)
    style = torch.randn(1, 3, 8, 16, 16)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()
    
    style_expanded = style.expand(2, -1, -1, -1, -1)
    spatial_dims = (2, 3, 4)
    style_mean = style_expanded.mean(dim=spatial_dims, keepdim=True)
    style_std = style_expanded.std(dim=spatial_dims, keepdim=True, unbiased=False)
    
    result_mean = result.mean(dim=spatial_dims, keepdim=True)
    result_std = result.std(dim=spatial_dims, keepdim=True, unbiased=False)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-5)
    assert torch.allclose(result_std, style_std, atol=1e-5)


def test_broadcast_statistics_independence():
    content = torch.randn(3, 2, 4)
    style = torch.randn(1, 2, 4)
    result = adain(content, style)
    
    for i in range(3):
        content_single = content[i:i+1]
        result_single = adain(content_single, style)
        assert torch.allclose(result[i:i+1], result_single, atol=1e-6)
    
    style_expanded = style.expand(3, -1, -1)
    style_mean = style_expanded.mean(dim=2, keepdim=True)
    style_std = style_expanded.std(dim=2, keepdim=True, unbiased=False)
    
    result_mean = result.mean(dim=2, keepdim=True)
    result_std = result.std(dim=2, keepdim=True, unbiased=False)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-5)
    assert torch.allclose(result_std, style_std, atol=1e-5)


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
    
    style_expanded = style.expand(100, -1, -1, -1)
    style_mean = style_expanded.mean(dim=(2, 3), keepdim=True)
    style_std = style_expanded.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-4)  # Looser tolerance for large tensors
    assert torch.allclose(result_std, style_std, atol=1e-4)
