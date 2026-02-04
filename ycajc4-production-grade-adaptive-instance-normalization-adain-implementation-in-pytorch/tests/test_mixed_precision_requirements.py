import pytest
import torch
import warnings
import sys
import os

warnings.filterwarnings("ignore", message=".*CPU autocast.*only supports.*bfloat16.*")
warnings.filterwarnings("ignore", message=".*Failed to initialize NumPy.*")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))
from adain import adain


def test_mixed_precision_autocast_fp16():
    import warnings
    content = torch.randn(2, 3, 32, 32, dtype=torch.float32)
    style = torch.randn(2, 3, 32, 32, dtype=torch.float32)
    
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", message=".*CPU autocast.*only supports.*bfloat16.*")
        try:
            with torch.autocast(device_type='cpu', dtype=torch.float16):
                result = adain(content, style)
            assert result.shape == content.shape
            assert torch.isfinite(result).all()
        except RuntimeError as e:
            assert "Currently, AutocastCPU only support Bfloat16" in str(e)
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
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    style_mean = style.mean(dim=(2, 3), keepdim=True)
    style_std = style.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-3)
    assert torch.allclose(result_std, style_std, atol=1e-3)


def test_mixed_precision_bf16_inputs():
    content = torch.randn(2, 3, 32, 32, dtype=torch.bfloat16)
    style = torch.randn(2, 3, 32, 32, dtype=torch.bfloat16)
    result = adain(content, style)
    
    assert result.shape == content.shape
    assert result.dtype == torch.bfloat16
    assert torch.isfinite(result).all()
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    style_mean = style.mean(dim=(2, 3), keepdim=True)
    style_std = style.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-2)
    assert torch.allclose(result_std, style_std, atol=1e-2)


def test_mixed_precision_mixed_dtypes():
    content = torch.randn(2, 3, 32, 32, dtype=torch.float16)
    style = torch.randn(2, 3, 32, 32, dtype=torch.float32)
    result = adain(content, style)
    
    assert result.shape == content.shape
    assert result.dtype == torch.float32
    assert torch.isfinite(result).all()
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    style_mean = style.mean(dim=(2, 3), keepdim=True)
    style_std = style.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-3)
    assert torch.allclose(result_std, style_std, atol=1e-3)


def test_mixed_precision_numerical_stability():
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
    assert torch.all(result_std > 1e-7)


def test_mixed_precision_with_masks():
    content = torch.randn(2, 3, 32, 32, dtype=torch.float16)
    style = torch.randn(2, 3, 32, 32, dtype=torch.float16)
    content_mask = torch.ones(2, 3, 32, 32, dtype=torch.float16)
    style_mask = torch.ones(2, 3, 32, 32, dtype=torch.float16)
    
    result = adain(content, style, content_mask=content_mask, style_mask=style_mask)
    
    assert result.shape == content.shape
    assert result.dtype == torch.float16
    assert torch.isfinite(result).all()
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    style_mean = style.mean(dim=(2, 3), keepdim=True)
    style_std = style.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-3)
    assert torch.allclose(result_std, style_std, atol=1e-3)


def test_mixed_precision_autocast_gpu_fp16():
    content = torch.randn(2, 3, 32, 32, dtype=torch.float32)
    style = torch.randn(2, 3, 32, 32, dtype=torch.float32)
    
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    content = content.to(device)
    style = style.to(device)
    
    if device == 'cuda':
        with torch.autocast(device_type=device, dtype=torch.float16):
            result = adain(content, style)
        
        assert result.shape == content.shape
        assert torch.isfinite(result).all()
        assert result.dtype == torch.float32
    else:
        with pytest.raises(RuntimeError, match="AutocastCPU only support Bfloat16"):
            with torch.autocast(device_type='cpu', dtype=torch.float16):
                result = adain(content, style)


def test_mixed_precision_autocast_gpu_bf16():
    content = torch.randn(2, 3, 32, 32, dtype=torch.float32)
    style = torch.randn(2, 3, 32, 32, dtype=torch.float32)
    
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    content = content.to(device)
    style = style.to(device)
    
    with torch.autocast(device_type=device, dtype=torch.bfloat16):
        result = adain(content, style)
    
    assert result.shape == content.shape
    assert torch.isfinite(result).all()
    assert result.dtype == torch.float32


def test_mixed_precision_mask_precision_preservation():
    content = torch.randn(2, 3, 32, 32, dtype=torch.float16)
    style = torch.randn(2, 3, 32, 32, dtype=torch.float32)
    content_mask = torch.ones(2, 3, 32, 32, dtype=torch.float16)
    style_mask = torch.ones(2, 3, 32, 32, dtype=torch.float32)
    
    result = adain(content, style, content_mask=content_mask, style_mask=style_mask)
    
    assert result.shape == content.shape
    assert result.dtype == torch.float32
    assert torch.isfinite(result).all()
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    style_mean = style.mean(dim=(2, 3), keepdim=True)
    style_std = style.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-3)
    assert torch.allclose(result_std, style_std, atol=1e-3)


def test_mixed_precision_gradient_behavior_with_detachment():
    content = torch.randn(2, 3, 32, 32, dtype=torch.float16, requires_grad=True)
    style = torch.randn(2, 3, 32, 32, dtype=torch.float16, requires_grad=True)
    
    result = adain(content, style, style_detach=True)
    
    content_grad = torch.autograd.grad(result.sum(), content, retain_graph=True)[0]
    assert content_grad is not None
    assert content_grad.dtype == torch.float16
    assert torch.isfinite(content_grad).all()
    
    style_grad = torch.autograd.grad(result.sum(), style, allow_unused=True)[0]
    assert style_grad is None


def test_mixed_precision_epsilon_values_fp16():
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
    assert torch.all(result_std > 1e-6)


def test_mixed_precision_epsilon_values_bf16():
    content = torch.ones(2, 3, 32, 32, dtype=torch.bfloat16)
    style = torch.randn(2, 3, 32, 32, dtype=torch.bfloat16)
    
    result = adain(content, style)
    assert result.shape == content.shape
    assert result.dtype == torch.bfloat16
    assert torch.isfinite(result).all()
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    style_mean = style.mean(dim=(2, 3), keepdim=True)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-2)


def test_mixed_precision_epsilon_values_fp32():
    content = torch.ones(2, 3, 32, 32, dtype=torch.float32)
    style = torch.randn(2, 3, 32, 32, dtype=torch.float32)
    
    result = adain(content, style)
    assert result.shape == content.shape
    assert result.dtype == torch.float32
    assert torch.isfinite(result).all()
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    style_mean = style.mean(dim=(2, 3), keepdim=True)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-5)
    assert torch.all(result_std > 1e-8)


def test_mixed_precision_with_alpha_interpolation():
    content = torch.randn(2, 3, 32, 32, dtype=torch.float16)
    style = torch.randn(2, 3, 32, 32, dtype=torch.float16)
    
    alpha = 0.5
    result = adain(content, style, alpha=alpha)
    assert result.shape == content.shape
    assert result.dtype == torch.float16
    assert torch.isfinite(result).all()
    
    result_full = adain(content, style, alpha=1.0)
    expected = alpha * result_full + (1 - alpha) * content
    
    assert torch.allclose(result, expected, atol=1e-3)


def test_mixed_precision_batch_broadcast():
    content = torch.randn(4, 3, 32, 32, dtype=torch.float16)
    style = torch.randn(1, 3, 32, 32, dtype=torch.float16)
    
    result = adain(content, style)
    assert result.shape == content.shape
    assert result.dtype == torch.float16
    assert torch.isfinite(result).all()
    
    style_expanded = style.expand(4, -1, -1, -1)
    style_mean = style_expanded.mean(dim=(2, 3), keepdim=True)
    style_std = style_expanded.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    result_mean = result.mean(dim=(2, 3), keepdim=True)
    result_std = result.std(dim=(2, 3), keepdim=True, unbiased=False)
    
    assert torch.allclose(result_mean, style_mean, atol=1e-3)
    assert torch.allclose(result_std, style_std, atol=1e-3)


def test_mixed_precision_extreme_values():
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
    
    assert torch.allclose(result_mean, style_mean, atol=1e-2)  # Looser tolerance for extreme values
    assert torch.allclose(result_std, style_std, atol=1e-2)
