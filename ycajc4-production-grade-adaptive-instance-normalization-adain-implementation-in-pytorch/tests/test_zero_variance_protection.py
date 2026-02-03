import pytest
import torch
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))
from adain import adain


def test_zero_variance_content_protection():
    content = torch.ones(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()
    
    content_std = content.std(dim=(2, 3), keepdim=True)
    assert torch.all(content_std == 0)


def test_zero_variance_style_protection():
    content = torch.randn(2, 3, 32, 32)
    style = torch.ones(2, 3, 32, 32)
    
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()
    
    style_std = style.std(dim=(2, 3), keepdim=True)
    assert torch.all(style_std == 0)


def test_both_zero_variance_protection():
    content = torch.ones(2, 3, 32, 32)
    style = torch.ones(2, 3, 32, 32)
    
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()
    
    content_std = content.std(dim=(2, 3), keepdim=True)
    style_std = style.std(dim=(2, 3), keepdim=True)
    assert torch.all(content_std == 0)
    assert torch.all(style_std == 0)


def test_zero_variance_with_masks():
    content = torch.ones(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    content_mask = torch.ones(2, 3, 32, 32)
    style_mask = torch.ones(2, 3, 32, 32)
    
    result = adain(content, style, content_mask=content_mask, style_mask=style_mask)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_zero_variance_mixed_precision():
    content = torch.ones(2, 3, 32, 32, dtype=torch.float16)
    style = torch.randn(2, 3, 32, 32, dtype=torch.float16)
    
    result = adain(content, style)
    assert result.shape == content.shape
    assert result.dtype == torch.float16
    assert torch.isfinite(result).all()
