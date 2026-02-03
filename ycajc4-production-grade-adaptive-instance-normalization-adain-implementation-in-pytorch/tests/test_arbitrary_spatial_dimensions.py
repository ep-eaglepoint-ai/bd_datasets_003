import pytest
import torch
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))
from adain import adain


def test_5d_spatial_dimensions():
    content = torch.randn(2, 3, 4, 8, 16)
    style = torch.randn(2, 3, 4, 8, 16)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_5d_spatial_with_alpha():
    content = torch.randn(2, 3, 4, 8, 16)
    style = torch.randn(2, 3, 4, 8, 16)
    result = adain(content, style, alpha=0.7)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_5d_spatial_mixed_precision():
    content = torch.randn(2, 3, 4, 8, 16, dtype=torch.float16)
    style = torch.randn(2, 3, 4, 8, 16, dtype=torch.float16)
    result = adain(content, style)
    assert result.shape == content.shape
    assert result.dtype == torch.float16
    assert torch.isfinite(result).all()


def test_5d_spatial_with_masks():
    content = torch.randn(2, 3, 4, 8, 16)
    style = torch.randn(2, 3, 4, 8, 16)
    content_mask = torch.ones(2, 3, 4, 8, 16)
    style_mask = torch.ones(2, 3, 4, 8, 16)
    result = adain(content, style, content_mask=content_mask, style_mask=style_mask)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_6d_spatial_dimensions():
    content = torch.randn(2, 3, 2, 4, 8, 16)
    style = torch.randn(2, 3, 2, 4, 8, 16)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_1d_spatial_dimensions():
    content = torch.randn(2, 3, 64)
    style = torch.randn(2, 3, 64)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_non_cubic_spatial_dimensions():
    content = torch.randn(2, 3, 7, 13, 23)
    style = torch.randn(2, 3, 7, 13, 23)
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()
