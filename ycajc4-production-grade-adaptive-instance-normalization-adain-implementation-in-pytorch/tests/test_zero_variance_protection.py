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


def test_numerical_stability_extreme_values():
    content = torch.full((2, 3, 32, 32), 1e6, dtype=torch.float32)
    style = torch.full((2, 3, 32, 32), -1e6, dtype=torch.float32)
    
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_numerical_stability_tiny_values():
    content = torch.full((2, 3, 32, 32), 1e-10, dtype=torch.float32)
    style = torch.full((2, 3, 32, 32), 1e-8, dtype=torch.float32)
    
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_numerical_stability_mixed_precision_extreme():
    # Test mixed precision with reasonable values to ensure stability
    content = torch.randn(2, 3, 32, 32, dtype=torch.float16) * 10
    style = torch.randn(2, 3, 32, 32, dtype=torch.float16) * 10
    
    result = adain(content, style)
    assert result.shape == content.shape
    assert result.dtype == torch.float16
    assert torch.isfinite(result).all()


def test_numerical_stability_bf16_extreme():
    content = torch.full((2, 3, 32, 32), 1e6, dtype=torch.bfloat16)
    style = torch.full((2, 3, 32, 32), -1e6, dtype=torch.bfloat16)
    
    result = adain(content, style)
    assert result.shape == content.shape
    assert result.dtype == torch.bfloat16
    assert torch.isfinite(result).all()


def test_numerical_stability_mask_based_zero_variance():
    content = torch.ones(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    content_mask = torch.zeros(2, 3, 32, 32)
    content_mask[:, :, 16:, :] = 1.0
    
    result = adain(content, style, content_mask=content_mask)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_numerical_stability_mask_all_zeros():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    content_mask = torch.zeros(2, 3, 32, 32)
    
    with pytest.raises(ValueError, match="content_mask must cover at least one spatial element per channel"):
        adain(content, style, content_mask=content_mask)


def test_numerical_stability_mixed_variance_channels():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    
    content[:, 0, :, :] = 1.0
    style[:, 1, :, :] = 1.0
    
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_numerical_stability_3d_spatial():
    content = torch.ones(2, 3, 1000)
    style = torch.randn(2, 3, 1000)
    
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_numerical_stability_high_dimensional():
    content = torch.ones(2, 3, 8, 16, 16)
    style = torch.randn(2, 3, 8, 16, 16)
    
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()


def test_numerical_stability_statistical_accuracy():
    content = torch.ones(2, 2, 4, 4)
    content[:, :, 2:, 2:] = 3.0
    style = torch.zeros(2, 2, 4, 4)
    style[:, :, :, :] = 2.0
    
    result = adain(content, style)
    
    assert result.shape == content.shape
    assert torch.isfinite(result).all()
    
    content_mean = content.mean(dim=(2, 3), keepdim=True)
    content_std = content.std(dim=(2, 3), keepdim=True, unbiased=False)
    style_mean = style.mean(dim=(2, 3), keepdim=True)
    style_std = style.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    eps = 1e-8
    content_std_safe = torch.maximum(content_std, torch.tensor(eps))
    style_std_safe = torch.maximum(style_std, torch.tensor(eps))
    
    expected = (content - content_mean) / content_std_safe * style_std_safe + style_mean
    assert torch.allclose(result, expected, atol=1e-3)


def test_numerical_stability_with_alpha_extreme():
    content = torch.ones(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    
    result_zero = adain(content, style, alpha=0.0)
    result_one = adain(content, style, alpha=1.0)
    
    assert torch.allclose(result_zero, content, atol=1e-6)
    assert torch.isfinite(result_one).all()


def test_numerical_stability_gradient_flow():
    content = torch.ones(2, 3, 32, 32, requires_grad=True)
    style = torch.randn(2, 3, 32, 32, requires_grad=True)
    
    result = adain(content, style)
    loss = result.sum()
    loss.backward()
    
    assert content.grad is not None
    assert style.grad is not None
    assert torch.isfinite(content.grad).all()
    assert torch.isfinite(style.grad).all()
