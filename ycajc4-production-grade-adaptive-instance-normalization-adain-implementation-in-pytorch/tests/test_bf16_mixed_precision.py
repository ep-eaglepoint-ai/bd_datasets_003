import pytest
import torch
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))
from adain import adain


def test_bf16_inputs():
    content = torch.randn(2, 3, 32, 32, dtype=torch.bfloat16)
    style = torch.randn(2, 3, 32, 32, dtype=torch.bfloat16)
    result = adain(content, style)
    assert result.shape == content.shape
    assert result.dtype == torch.bfloat16
    assert torch.isfinite(result).all()


def test_bf16_mixed_dtypes():
    content = torch.randn(2, 3, 32, 32, dtype=torch.bfloat16)
    style = torch.randn(2, 3, 32, 32, dtype=torch.float32)
    result = adain(content, style)
    assert result.shape == content.shape
    assert result.dtype == torch.float32
    assert torch.isfinite(result).all()


def test_bf16_with_masks():
    content = torch.randn(2, 3, 32, 32, dtype=torch.bfloat16)
    style = torch.randn(2, 3, 32, 32, dtype=torch.bfloat16)
    content_mask = torch.ones(2, 3, 32, 32, dtype=torch.bfloat16)
    style_mask = torch.ones(2, 3, 32, 32, dtype=torch.bfloat16)
    result = adain(content, style, content_mask=content_mask, style_mask=style_mask)
    assert result.shape == content.shape
    assert result.dtype == torch.bfloat16
    assert torch.isfinite(result).all()


def test_bf16_with_alpha():
    content = torch.randn(2, 3, 32, 32, dtype=torch.bfloat16)
    style = torch.randn(2, 3, 32, 32, dtype=torch.bfloat16)
    result = adain(content, style, alpha=0.5)
    assert result.shape == content.shape
    assert result.dtype == torch.bfloat16
    assert torch.isfinite(result).all()


def test_bf16_zero_variance():
    content = torch.ones(2, 3, 32, 32, dtype=torch.bfloat16)
    style = torch.randn(2, 3, 32, 32, dtype=torch.bfloat16)
    result = adain(content, style)
    assert result.shape == content.shape
    assert result.dtype == torch.bfloat16
    assert torch.isfinite(result).all()


def test_bf16_autocast():
    content = torch.randn(2, 3, 32, 32, dtype=torch.float32)
    style = torch.randn(2, 3, 32, 32, dtype=torch.float32)
    
    with torch.autocast(device_type='cpu', dtype=torch.bfloat16):
        result = adain(content, style)
    
    assert result.shape == content.shape
    assert torch.isfinite(result).all()
    assert result.dtype == torch.float32
