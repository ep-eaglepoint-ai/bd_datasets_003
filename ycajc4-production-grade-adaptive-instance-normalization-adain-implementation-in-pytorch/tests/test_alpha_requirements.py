import pytest
import torch
import warnings
import sys
import os

warnings.filterwarnings("ignore", message=".*Failed to initialize NumPy.*")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))
from adain import adain


def test_alpha_zero_returns_content():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    result = adain(content, style, alpha=0.0)
    assert torch.allclose(result, content, atol=1e-6)
    
    assert torch.equal(result, content)


def test_alpha_one_returns_full_adain():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    result_alpha_one = adain(content, style, alpha=1.0)
    result_direct = adain(content, style)
    assert torch.allclose(result_alpha_one, result_direct, atol=1e-6)
    
    result_mean = result_alpha_one.mean(dim=(2, 3), keepdim=True)
    result_std = result_alpha_one.std(dim=(2, 3), keepdim=True, unbiased=False)
    style_mean = style.mean(dim=(2, 3), keepdim=True)
    style_std = style.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-5)
    assert torch.allclose(result_std, style_std, atol=1e-5)


def test_alpha_half_interpolates_correctly():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    result_half = adain(content, style, alpha=0.5)
    result_none = adain(content, style, alpha=None)
    expected = 0.5 * result_none + 0.5 * content
    assert torch.allclose(result_half, expected, atol=1e-6)
    
    for alpha_val in [0.25, 0.75]:
        result_alpha = adain(content, style, alpha=alpha_val)
        expected_alpha = alpha_val * result_none + (1 - alpha_val) * content
        assert torch.allclose(result_alpha, expected_alpha, atol=1e-6)


def test_alpha_below_zero_fails():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    with pytest.raises(ValueError, match="alpha must be in range \\[0, 1\\]"):
        adain(content, style, alpha=-0.1)


def test_alpha_above_one_fails():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    with pytest.raises(ValueError, match="alpha must be in range \\[0, 1\\]"):
        adain(content, style, alpha=1.1)


def test_alpha_scalar_tensor():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    alpha_tensor = torch.tensor(0.7)
    result = adain(content, style, alpha=alpha_tensor)
    result_float = adain(content, style, alpha=0.7)
    assert torch.allclose(result, result_float, atol=1e-6)
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    result_float_mean = result_float.mean(dim=(2, 3), keepdim=True)
    assert torch.allclose(result_mean, result_float_mean, atol=1e-6)


def test_alpha_with_masks():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    content_mask = torch.ones(2, 3, 32, 32)
    style_mask = torch.ones(2, 3, 32, 32)
    
    result_alpha_zero = adain(content, style, content_mask=content_mask, style_mask=style_mask, alpha=0.0)
    assert torch.allclose(result_alpha_zero, content, atol=1e-6)
    
    assert torch.equal(result_alpha_zero, content)
    
    result_half = adain(content, style, content_mask=content_mask, style_mask=style_mask, alpha=0.5)
    result_full = adain(content, style, content_mask=content_mask, style_mask=style_mask, alpha=1.0)
    expected_half = 0.5 * result_full + 0.5 * content
    assert torch.allclose(result_half, expected_half, atol=1e-6)
