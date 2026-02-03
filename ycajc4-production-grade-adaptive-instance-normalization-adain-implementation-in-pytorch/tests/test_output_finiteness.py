import pytest
import torch
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))
from adain import adain


def test_output_contains_no_nan_values():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    result = adain(content, style)
    assert torch.isfinite(result).all()


def test_output_contains_no_inf_values():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    result = adain(content, style)
    assert torch.isfinite(result).all()


def test_output_finiteness_with_zero_variance_content():
    content = torch.ones(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    result = adain(content, style)
    assert torch.isfinite(result).all()


def test_output_finiteness_with_zero_variance_style():
    content = torch.randn(2, 3, 32, 32)
    style = torch.ones(2, 3, 32, 32)
    result = adain(content, style)
    assert torch.isfinite(result).all()


def test_output_finiteness_with_both_zero_variance():
    content = torch.ones(2, 3, 32, 32)
    style = torch.ones(2, 3, 32, 32)
    result = adain(content, style)
    assert torch.isfinite(result).all()


def test_output_finiteness_with_mixed_precision_fp16():
    content = torch.randn(2, 3, 32, 32, dtype=torch.float16)
    style = torch.randn(2, 3, 32, 32, dtype=torch.float16)
    result = adain(content, style)
    assert torch.isfinite(result).all()


def test_output_finiteness_with_mixed_precision_bf16():
    content = torch.randn(2, 3, 32, 32, dtype=torch.bfloat16)
    style = torch.randn(2, 3, 32, 32, dtype=torch.bfloat16)
    result = adain(content, style)
    assert torch.isfinite(result).all()


def test_output_finiteness_with_masks():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    content_mask = torch.ones(2, 3, 32, 32)
    style_mask = torch.ones(2, 3, 32, 32)
    result = adain(content, style, content_mask=content_mask, style_mask=style_mask)
    assert torch.isfinite(result).all()


def test_output_finiteness_with_alpha_interpolation():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    result = adain(content, style, alpha=0.5)
    assert torch.isfinite(result).all()


def test_output_finiteness_with_style_detach():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    result = adain(content, style, style_detach=True)
    assert torch.isfinite(result).all()


def test_output_finiteness_with_batch_broadcast():
    content = torch.randn(4, 3, 32, 32)
    style = torch.randn(1, 3, 32, 32)
    result = adain(content, style)
    assert torch.isfinite(result).all()


def test_output_finiteness_with_arbitrary_spatial_dimensions():
    content = torch.randn(2, 3, 8, 16, 16)
    style = torch.randn(2, 3, 8, 16, 16)
    result = adain(content, style)
    assert torch.isfinite(result).all()
