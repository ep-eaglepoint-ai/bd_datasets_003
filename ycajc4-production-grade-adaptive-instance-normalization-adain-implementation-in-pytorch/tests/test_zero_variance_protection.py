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
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    style_mean = style.mean(dim=(2, 3), keepdim=True)
    style_std = style.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-5)
    assert torch.all(result_std > 1e-8)


def test_zero_variance_style_protection():
    content = torch.randn(2, 3, 32, 32)
    style = torch.ones(2, 3, 32, 32)
    
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()
    
    style_std = style.std(dim=(2, 3), keepdim=True)
    assert torch.all(style_std == 0)
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    style_mean = style.mean(dim=(2, 3), keepdim=True)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-5)
    assert torch.all(result_std > 1e-8)
    assert torch.all(result_std < 1e-6)


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
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    style_mean = style.mean(dim=(2, 3), keepdim=True)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-5)
    assert torch.all(result_std > 1e-8)
    assert torch.all(result_std < 1e-6)


def test_zero_variance_with_masks():
    content = torch.ones(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    content_mask = torch.ones(2, 3, 32, 32)
    style_mask = torch.ones(2, 3, 32, 32)
    
    result = adain(content, style, content_mask=content_mask, style_mask=style_mask)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()
    
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    style_mean = style.mean(dim=(2, 3), keepdim=True)
    style_std = style.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-5)
    assert torch.all(result_std > 1e-8)


def test_zero_variance_mixed_precision():
    content = torch.ones(2, 3, 32, 32, dtype=torch.float16)
    style = torch.randn(2, 3, 32, 32, dtype=torch.float16)
    
    result = adain(content, style)
    assert result.shape == content.shape
    assert result.dtype == torch.float16
    assert torch.isfinite(result).all()
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    style_mean = style.mean(dim=(2, 3), keepdim=True)
    

    assert torch.allclose(result_mean, style_mean, atol=1e-3)
    assert torch.all(result_std > 1e-6)  # Larger epsilon for fp16


def test_numerical_stability_extreme_values():
    content = torch.full((2, 3, 32, 32), 1e6, dtype=torch.float32)
    style = torch.full((2, 3, 32, 32), -1e6, dtype=torch.float32)
    
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    style_mean = style.mean(dim=(2, 3), keepdim=True)
    style_std = style.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-3)  # Looser tolerance for extreme values
    assert torch.allclose(result_std, style_std, atol=1e-3)


def test_numerical_stability_tiny_values():
    content = torch.full((2, 3, 32, 32), 1e-10, dtype=torch.float32)
    style = torch.full((2, 3, 32, 32), 1e-8, dtype=torch.float32)
    
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    style_mean = style.mean(dim=(2, 3), keepdim=True)
    style_std = style.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-10)
    assert torch.allclose(result_std, style_std, atol=1e-10)


def test_numerical_stability_mixed_precision_extreme():
    content = torch.randn(2, 3, 32, 32, dtype=torch.float16) * 10
    style = torch.randn(2, 3, 32, 32, dtype=torch.float16) * 10
    
    result = adain(content, style)
    assert result.shape == content.shape
    assert result.dtype == torch.float16
    assert torch.isfinite(result).all()
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    style_mean = style.mean(dim=(2, 3), keepdim=True)
    style_std = style.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-2)
    assert torch.allclose(result_std, style_std, atol=1e-2)


def test_numerical_stability_bf16_extreme():
    content = torch.full((2, 3, 32, 32), 1e6, dtype=torch.bfloat16)
    style = torch.full((2, 3, 32, 32), -1e6, dtype=torch.bfloat16)
    
    result = adain(content, style)
    assert result.shape == content.shape
    assert result.dtype == torch.bfloat16
    assert torch.isfinite(result).all()
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    style_mean = style.mean(dim=(2, 3), keepdim=True)
    style_std = style.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-1)  # Very loose tolerance for bf16 extreme values
    assert torch.allclose(result_std, style_std, atol=1e-1)


def test_numerical_stability_mask_based_zero_variance():
    content = torch.ones(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    content_mask = torch.zeros(2, 3, 32, 32)
    content_mask[:, :, 16:, :] = 1.0
    
    result = adain(content, content_mask=content_mask, style=style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()
    
    masked_region = result[:, :, 16:, :]
    unmasked_region = result[:, :, :16, :]
    
    style_mean = style.mean(dim=(2, 3), keepdim=True)
    style_std = style.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    masked_mean = masked_region.mean(dim=(2, 3), keepdim=True)
    assert torch.allclose(masked_mean, style_mean, atol=1e-5)


def test_numerical_stability_mask_all_zeros():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    content_mask = torch.zeros(2, 3, 32, 32)
    
    result = adain(content, style, content_mask=content_mask)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()
    
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    assert torch.all(result_std > 1e-8)
    assert torch.all(result_std < 1e-6)


def test_numerical_stability_mixed_variance_channels():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    
    content[:, 0, :, :] = 1.0  # Zero variance channel 0
    style[:, 1, :, :] = 1.0  # Zero variance channel 1
    
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()
    
    for ch in range(3):
        result_ch_mean = result[:, ch:ch+1, :, :].mean(dim=(2, 3), keepdim=True)
        result_ch_std = result[:, ch:ch+1, :, :].std(dim=(2, 3), keepdim=True, unbiased=False)
        style_ch_mean = style[:, ch:ch+1, :, :].mean(dim=(2, 3), keepdim=True)
        style_ch_std = style[:, ch:ch+1, :, :].std(dim=(2, 3), keepdim=True, unbiased=False)
        
        assert torch.allclose(result_ch_mean, style_ch_mean, atol=1e-5)
        if ch == 0 or ch == 1:
            assert torch.all(result_ch_std > 1e-8)
            assert torch.all(result_ch_std < 1e-6)


def test_numerical_stability_3d_spatial():
    content = torch.ones(2, 3, 1000)
    style = torch.randn(2, 3, 1000)
    
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()
    
    result_mean = result.mean(dim=2, keepdim=True)
    result_std = result.std(dim=2, keepdim=True, unbiased=False)
    style_mean = style.mean(dim=2, keepdim=True)
    style_std = style.std(dim=2, keepdim=True, unbiased=False)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-5)
    assert torch.all(result_std > 1e-8)


def test_numerical_stability_high_dimensional():
    content = torch.ones(2, 3, 8, 16, 16)
    style = torch.randn(2, 3, 8, 16, 16)
    
    result = adain(content, style)
    assert result.shape == content.shape
    assert torch.isfinite(result).all()
    
    spatial_dims = (2, 3, 4)
    result_mean = result.mean(dim=spatial_dims, keepdim=True)
    result_std = result.std(dim=spatial_dims, keepdim=True, unbiased=False)
    style_mean = style.mean(dim=spatial_dims, keepdim=True)
    style_std = style.std(dim=spatial_dims, keepdim=True, unbiased=False)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-5)
    assert torch.all(result_std > 1e-8)


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
    assert torch.allclose(result, expected, atol=1e-6)


def test_numerical_stability_with_alpha_extreme():
    content = torch.ones(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    
    result_zero = adain(content, style, alpha=0.0)
    result_one = adain(content, style, alpha=1.0)
    
    assert torch.allclose(result_zero, content, atol=1e-6)
    assert torch.isfinite(result_one).all()
    
    result_one_mean = result_one.mean(dim=(2, 3), keepdim=True)
    result_one_std = result_one.std(dim=(2, 3), keepdim=True, unbiased=False)
    style_mean = style.mean(dim=(2, 3), keepdim=True)
    style_std = style.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    assert torch.allclose(result_one_mean, style_mean, atol=1e-5)
    assert torch.all(result_one_std > 1e-8)


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
    
    assert torch.any(content.grad != 0)
    assert torch.any(style.grad != 0)
