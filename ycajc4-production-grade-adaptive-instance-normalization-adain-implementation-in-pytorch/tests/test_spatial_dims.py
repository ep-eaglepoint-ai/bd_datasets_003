import pytest
import torch
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))
from adain import adain


def test_1d_spatial_dimensions():
    content = torch.randn(2, 4, 16)
    style = torch.randn(2, 4, 16)
    result = adain(content, style)
    assert result.shape == content.shape


def test_2d_spatial_dimensions():
    content = torch.randn(2, 4, 32, 32)
    style = torch.randn(2, 4, 32, 32)
    result = adain(content, style)
    assert result.shape == content.shape


def test_3d_spatial_dimensions():
    content = torch.randn(2, 4, 8, 16, 16)
    style = torch.randn(2, 4, 8, 16, 16)
    result = adain(content, style)
    assert result.shape == content.shape


def test_4d_spatial_dimensions():
    content = torch.randn(2, 4, 4, 8, 16, 16)
    style = torch.randn(2, 4, 4, 8, 16, 16)
    result = adain(content, style)
    assert result.shape == content.shape


def test_different_spatial_sizes():
    content = torch.randn(1, 3, 64)
    style = torch.randn(1, 3, 64)
    result = adain(content, style)
    assert result.shape == content.shape


def test_single_spatial_dimension():
    content = torch.randn(1, 2, 1)
    style = torch.randn(1, 2, 1)
    result = adain(content, style)
    assert result.shape == content.shape


def test_large_spatial_dimensions():
    content = torch.randn(1, 2, 128, 256)
    style = torch.randn(1, 2, 128, 256)
    result = adain(content, style)
    assert result.shape == content.shape


def test_non_square_spatial():
    content = torch.randn(1, 3, 32, 64)
    style = torch.randn(1, 3, 32, 64)
    result = adain(content, style)
    assert result.shape == content.shape


def test_odd_spatial_dimensions():
    content = torch.randn(1, 3, 31, 33)
    style = torch.randn(1, 3, 31, 33)
    result = adain(content, style)
    assert result.shape == content.shape


def test_even_spatial_dimensions():
    content = torch.randn(1, 3, 32, 64)
    style = torch.randn(1, 3, 32, 64)
    result = adain(content, style)
    assert result.shape == content.shape


def test_invalid_0d_spatial():
    content = torch.randn(2, 4)
    style = torch.randn(2, 4)
    with pytest.raises(ValueError, match="content must have at least 3 dimensions"):
        adain(content, style)


def test_invalid_0d_spatial_style():
    content = torch.randn(2, 4, 16)
    style = torch.randn(2, 4)
    with pytest.raises(ValueError, match="style must have at least 3 dimensions"):
        adain(content, style)


def test_identical_spatial_dimensions():
    content = torch.randn(1, 3, 32, 32)
    style = torch.randn(1, 3, 32, 32)
    result = adain(content, style)
    assert result.shape == content.shape


def test_statistics_computation_1d():
    content = torch.ones(1, 2, 4)
    style = torch.zeros(1, 2, 4)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.allclose(result, style, atol=1e-6)


def test_statistics_computation_3d():
    content = torch.ones(1, 2, 2, 2, 2)
    style = torch.zeros(1, 2, 2, 2, 2)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.allclose(result, style, atol=1e-6)
