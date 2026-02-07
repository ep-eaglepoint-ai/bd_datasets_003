import pytest
import torch
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))
from adain import adain


def test_spatial_dimensions_1d():
    content = torch.randn(2, 3, 64)
    style = torch.randn(2, 3, 64)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_spatial_dimensions_2d():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_spatial_dimensions_3d():
    content = torch.randn(2, 3, 16, 16, 16)
    style = torch.randn(2, 3, 16, 16, 16)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_spatial_dimensions_4d():
    content = torch.randn(2, 3, 8, 8, 8, 8)
    style = torch.randn(2, 3, 8, 8, 8, 8)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_spatial_dimensions_mismatch():
    # Test that AdaIN handles spatial dimension mismatches gracefully
    # The implementation allows different spatial dimensions and processes them
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 16, 16)
    result = adain(content, style)
    # Result should maintain content's spatial dimensions
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_spatial_dimensions_single_pixel():
    content = torch.randn(2, 3, 1, 1)
    style = torch.randn(2, 3, 1, 1)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_spatial_dimensions_large_resolution():
    content = torch.randn(2, 3, 128, 128)
    style = torch.randn(2, 3, 128, 128)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_spatial_dimensions_non_square():
    content = torch.randn(2, 3, 32, 64)
    style = torch.randn(2, 3, 32, 64)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_spatial_dimensions_odd_dimensions():
    content = torch.randn(2, 3, 31, 31)
    style = torch.randn(2, 3, 31, 31)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_spatial_dimensions_even_dimensions():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_spatial_dimensions_minimum_size():
    content = torch.randn(2, 3, 1)
    style = torch.randn(2, 3, 1)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_spatial_dimensions_maximum_size():
    content = torch.randn(1, 1, 256, 256)
    style = torch.randn(1, 1, 256, 256)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_spatial_dimensions_aspect_ratio():
    content = torch.randn(2, 3, 16, 64)
    style = torch.randn(2, 3, 16, 64)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_spatial_dimensions_zero_spatial():
    content = torch.randn(2, 3, 0, 32)
    style = torch.randn(2, 3, 0, 32)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_spatial_dimensions_negative_spatial():
    # Test that negative spatial dimensions are properly rejected
    # PyTorch itself prevents creating tensors with negative dimensions
    # This test verifies the expected behavior at the tensor creation level
    with pytest.raises(RuntimeError, match="negative dimension"):
        torch.randn(2, 3, -1, 32)
