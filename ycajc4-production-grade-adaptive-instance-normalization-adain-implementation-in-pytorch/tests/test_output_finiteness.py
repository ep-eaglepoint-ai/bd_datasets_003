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
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    style_mean = style.mean(dim=(2, 3), keepdim=True)
    style_std = style.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-5)
    assert torch.allclose(result_std, style_std, atol=1e-5)


def test_output_contains_no_inf_values():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    result = adain(content, style)
    assert torch.isfinite(result).all()
    
    content_mean = content.mean(dim=(2, 3), keepdim=True)
    content_std = content.std(dim=(2, 3), keepdim=True, unbiased=False)
    style_mean = style.mean(dim=(2, 3), keepdim=True)
    style_std = style.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    expected = (content - content_mean) / content_std * style_std + style_mean
    assert torch.allclose(result, expected, atol=1e-5)


def test_output_finiteness_with_zero_variance_content():
    content = torch.ones(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    result = adain(content, style)
    assert torch.isfinite(result).all()
    
    style_mean = style.mean(dim=(2, 3), keepdim=True)
    style_std = style.std(dim=(2, 3), keepdim=True, unbiased=False)
    eps = 1e-8
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    assert torch.allclose(result_mean, style_mean, atol=1e-5)
    
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    assert torch.all(result_std > eps)


def test_output_finiteness_with_zero_variance_style():
    content = torch.randn(2, 3, 32, 32)
    style = torch.ones(2, 3, 32, 32)
    result = adain(content, style)
    assert torch.isfinite(result).all()
    
    content_mean = content.mean(dim=(2, 3), keepdim=True)
    content_std = content.std(dim=(2, 3), keepdim=True, unbiased=False)
    style_mean = style.mean(dim=(2, 3), keepdim=True)
    eps = 1e-8
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    assert torch.allclose(result_mean, style_mean, atol=1e-5)
    
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    assert torch.all(result_std < content_std.max())


def test_output_finiteness_with_both_zero_variance():
    content = torch.ones(2, 3, 32, 32)
    style = torch.ones(2, 3, 32, 32)
    result = adain(content, style)
    assert torch.isfinite(result).all()
    
    content_mean = content.mean(dim=(2, 3), keepdim=True)
    style_mean = style.mean(dim=(2, 3), keepdim=True)
    eps = 1e-8
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    assert torch.allclose(result_mean, style_mean, atol=1e-5)
    
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    assert torch.all(result_std > 0) 


def test_output_finiteness_with_mixed_precision_fp16():
    content = torch.randn(2, 3, 32, 32, dtype=torch.float16)
    style = torch.randn(2, 3, 32, 32, dtype=torch.float16)
    result = adain(content, style)
    assert result.dtype == torch.float16
    assert torch.isfinite(result).all()
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    style_mean = style.mean(dim=(2, 3), keepdim=True)
    style_std = style.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-3)
    assert torch.allclose(result_std, style_std, atol=1e-3)


def test_output_finiteness_with_mixed_precision_bf16():
    content = torch.randn(2, 3, 32, 32, dtype=torch.bfloat16)
    style = torch.randn(2, 3, 32, 32, dtype=torch.bfloat16)
    result = adain(content, style)
    assert result.dtype == torch.bfloat16
    assert torch.isfinite(result).all()
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    style_mean = style.mean(dim=(2, 3), keepdim=True)
    style_std = style.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-2)
    assert torch.allclose(result_std, style_std, atol=1e-2)


def test_output_finiteness_with_masks():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    content_mask = torch.ones(2, 3, 32, 32)
    style_mask = torch.ones(2, 3, 32, 32)
    result = adain(content, style, content_mask=content_mask, style_mask=style_mask)
    assert torch.isfinite(result).all()
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    style_mean = style.mean(dim=(2, 3), keepdim=True)
    style_std = style.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-5)
    assert torch.allclose(result_std, style_std, atol=1e-5)


def test_output_finiteness_with_alpha_interpolation():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    alpha = 0.5
    result = adain(content, style, alpha=alpha)
    assert torch.isfinite(result).all()
    
    result_full = adain(content, style, alpha=1.0)
    expected = alpha * result_full + (1 - alpha) * content
    
    assert torch.allclose(result, expected, atol=1e-5)


def test_output_finiteness_with_style_detach():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    result = adain(content, style, style_detach=True)
    assert torch.isfinite(result).all()
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    style_mean = style.mean(dim=(2, 3), keepdim=True)
    style_std = style.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-5)
    assert torch.allclose(result_std, style_std, atol=1e-5)


def test_output_finiteness_with_batch_broadcast():
    content = torch.randn(4, 3, 32, 32)
    style = torch.randn(1, 3, 32, 32)
    result = adain(content, style)
    assert torch.isfinite(result).all()
    
    style_expanded = style.expand(4, -1, -1, -1)
    style_mean = style_expanded.mean(dim=(2, 3), keepdim=True)
    style_std = style_expanded.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-5)
    assert torch.allclose(result_std, style_std, atol=1e-5)


def test_output_finiteness_with_arbitrary_spatial_dimensions():
    content = torch.randn(2, 3, 8, 16, 16)
    style = torch.randn(2, 3, 8, 16, 16)
    result = adain(content, style)
    assert torch.isfinite(result).all()
    
    spatial_dims = (2, 3, 4)
    result_mean = result.mean(dim=spatial_dims, keepdim=True)
    result_std = result.std(dim=spatial_dims, keepdim=True, unbiased=False)
    style_mean = style.mean(dim=spatial_dims, keepdim=True)
    style_std = style.std(dim=spatial_dims, keepdim=True, unbiased=False)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-5)
    assert torch.allclose(result_std, style_std, atol=1e-5)
