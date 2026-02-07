import pytest
import torch
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))
from adain import adain


def test_content_nan_raises():
    content = torch.randn(2, 3, 32, 32)
    content[0, 0, 0, 0] = float('nan')
    style = torch.randn(2, 3, 32, 32)
    
    with pytest.raises(ValueError, match="content contains NaN or Inf values"):
        adain(content, style)


def test_content_inf_raises():
    content = torch.randn(2, 3, 32, 32)
    content[0, 0, 0, 0] = float('inf')
    style = torch.randn(2, 3, 32, 32)
    
    with pytest.raises(ValueError, match="content contains NaN or Inf values"):
        adain(content, style)


def test_style_nan_raises():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    style[0, 0, 0, 0] = float('nan')
    
    with pytest.raises(ValueError, match="style contains NaN or Inf values"):
        adain(content, style)


def test_style_inf_raises():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    style[0, 0, 0, 0] = float('inf')
    
    with pytest.raises(ValueError, match="style contains NaN or Inf values"):
        adain(content, style)


def test_content_mask_nan_raises():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    content_mask = torch.ones(2, 3, 32, 32)
    content_mask[0, 0, 0, 0] = float('nan')
    
    with pytest.raises(ValueError, match="content_mask values must be in range \\[0, 1\\]"):
        adain(content, style, content_mask=content_mask)


def test_style_mask_nan_raises():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    style_mask = torch.ones(2, 3, 32, 32)
    style_mask[0, 0, 0, 0] = float('nan')
    
    with pytest.raises(ValueError, match="style_mask values must be in range \\[0, 1\\]"):
        adain(content, style, style_mask=style_mask)


def test_content_mask_inf_raises():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    content_mask = torch.ones(2, 3, 32, 32)
    content_mask[0, 0, 0, 0] = float('inf')
    
    with pytest.raises(ValueError, match="content_mask values must be in range \\[0, 1\\]"):
        adain(content, style, content_mask=content_mask)


def test_style_mask_inf_raises():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    style_mask = torch.ones(2, 3, 32, 32)
    style_mask[0, 0, 0, 0] = float('inf')
    
    with pytest.raises(ValueError, match="style_mask values must be in range \\[0, 1\\]"):
        adain(content, style, style_mask=style_mask)
