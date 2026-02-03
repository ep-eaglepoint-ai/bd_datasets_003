import pytest
import torch
import warnings
import sys
import os

# Suppress warnings
warnings.filterwarnings("ignore", message=".*CPU autocast.*only supports.*bfloat16.*")
warnings.filterwarnings("ignore", message=".*Failed to initialize NumPy.*")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))
from adain import adain


def test_mixed_precision_autocast_fp16():
    import warnings
    content = torch.randn(2, 3, 32, 32, dtype=torch.float32)
    style = torch.randn(2, 3, 32, 32, dtype=torch.float32)
    
    # Test that we handle the PyTorch CPU autocast limitation gracefully
    # PyTorch raises RuntimeError when trying to use float16 autocast on CPU
    # Suppress the expected warning about unsupported autocast dtype
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", message=".*CPU autocast.*only supports.*bfloat16.*")
        try:
            with torch.autocast(device_type='cpu', dtype=torch.float16):
                result = adain(content, style)
            # If we get here, we're on a platform that supports float16 autocast
            assert result.shape == content.shape
            assert torch.isfinite(result).all()
        except RuntimeError as e:
            # Expected on CPU - PyTorch only supports bfloat16 autocast on CPU
            assert "Currently, AutocastCPU only support Bfloat16" in str(e)
            # Test that the function still works normally without autocast
            result = adain(content, style)
            assert result.shape == content.shape
            assert torch.isfinite(result).all()
            assert result.dtype == torch.float32


def test_mixed_precision_autocast_bf16():
    content = torch.randn(2, 3, 32, 32, dtype=torch.float32)
    style = torch.randn(2, 3, 32, 32, dtype=torch.float32)
    
    with torch.autocast(device_type='cpu', dtype=torch.bfloat16):
        result = adain(content, style)
    
    assert result.shape == content.shape
    assert torch.isfinite(result).all()
    assert result.dtype == torch.float32


def test_mixed_precision_fp16_inputs():
    content = torch.randn(2, 3, 32, 32, dtype=torch.float16)
    style = torch.randn(2, 3, 32, 32, dtype=torch.float16)
    result = adain(content, style)
    
    assert result.shape == content.shape
    assert result.dtype == torch.float16
    assert torch.isfinite(result).all()


def test_mixed_precision_bf16_inputs():
    content = torch.randn(2, 3, 32, 32, dtype=torch.bfloat16)
    style = torch.randn(2, 3, 32, 32, dtype=torch.bfloat16)
    result = adain(content, style)
    
    assert result.shape == content.shape
    assert result.dtype == torch.bfloat16
    assert torch.isfinite(result).all()


def test_mixed_precision_mixed_dtypes():
    content = torch.randn(2, 3, 32, 32, dtype=torch.float16)
    style = torch.randn(2, 3, 32, 32, dtype=torch.float32)
    result = adain(content, style)
    
    assert result.shape == content.shape
    assert result.dtype == torch.float32
    assert torch.isfinite(result).all()


def test_mixed_precision_numerical_stability():
    content = torch.ones(2, 3, 32, 32, dtype=torch.float16)
    style = torch.randn(2, 3, 32, 32, dtype=torch.float16)
    result = adain(content, style)
    
    assert result.shape == content.shape
    assert result.dtype == torch.float16
    assert torch.isfinite(result).all()


def test_mixed_precision_with_masks():
    content = torch.randn(2, 3, 32, 32, dtype=torch.float16)
    style = torch.randn(2, 3, 32, 32, dtype=torch.float16)
    content_mask = torch.ones(2, 3, 32, 32, dtype=torch.float16)
    style_mask = torch.ones(2, 3, 32, 32, dtype=torch.float16)
    
    result = adain(content, style, content_mask=content_mask, style_mask=style_mask)
    
    assert result.shape == content.shape
    assert result.dtype == torch.float16
    assert torch.isfinite(result).all()
