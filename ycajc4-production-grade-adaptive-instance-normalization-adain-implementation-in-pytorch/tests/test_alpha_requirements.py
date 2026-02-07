import pytest
import torch
import warnings
import sys
import os

# Suppress NumPy import warning from PyTorch
warnings.filterwarnings("ignore", message=".*Failed to initialize NumPy.*")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))
from adain import adain


def test_alpha_zero_returns_content():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    result = adain(content, style, alpha=0.0)
    assert torch.allclose(result, content, atol=1e-6)


def test_alpha_one_returns_full_adain():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    result_alpha_one = adain(content, style, alpha=1.0)
    result_direct = adain(content, style)
    assert torch.allclose(result_alpha_one, result_direct, atol=1e-6)


def test_alpha_half_interpolates_correctly():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    result_half = adain(content, style, alpha=0.5)
    result_none = adain(content, style, alpha=None)
    expected = 0.5 * result_none + 0.5 * content
    assert torch.allclose(result_half, expected, atol=1e-6)


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


def test_alpha_with_masks():
    content = torch.randn(2, 3, 32, 32)
    style = torch.randn(2, 3, 32, 32)
    content_mask = torch.ones(2, 3, 32, 32)
    style_mask = torch.ones(2, 3, 32, 32)
    
    result_alpha_zero = adain(content, style, content_mask=content_mask, style_mask=style_mask, alpha=0.0)
    assert torch.allclose(result_alpha_zero, content, atol=1e-6)
