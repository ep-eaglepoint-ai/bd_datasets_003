import math
import sys
import os
import pytest
import torch
from torch import nn

# Add repository_after or repository_before to path for imports
# Use REPO_STATE environment variable to switch: "before" or "after" (default: "after")
repo_state = os.environ.get('REPO_STATE', 'after')
repo_dir = f'repository_{repo_state}'
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', repo_dir))

from rmsnorm import RMSNorm, RMSNormWithResidual


# -------------------------
# Utilities
# -------------------------

def rms(x: torch.Tensor, dim, eps):
    """Compute RMS over specified dimensions."""
    if isinstance(dim, (tuple, list)):
        # Handle multiple dimensions
        x_sq = x * x
        for d in dim:
            x_sq = x_sq.sum(dim=d, keepdim=True)
        num_elements = 1
        for d in dim:
            num_elements *= x.shape[d if d >= 0 else d + x.dim()]
        mean_sq = x_sq / num_elements
        return torch.sqrt(mean_sq + eps)
    else:
        return torch.sqrt(torch.mean(x * x, dim=dim, keepdim=True) + eps)


# -------------------------
# 1. Basic correctness
# -------------------------

def test_rmsnorm_basic_correctness():
    x = torch.randn(2, 4, 8)
    norm = RMSNorm(normalized_shape=8, bias=False)

    y = norm(x)

    expected = x / rms(x, dim=-1, eps=norm.eps)
    assert torch.allclose(y, expected, atol=1e-5)


# -------------------------
# 2. Scale (gamma) support
# -------------------------

def test_rmsnorm_with_scale():
    x = torch.randn(3, 5)
    norm = RMSNorm(normalized_shape=5, bias=False)

    norm.weight.data.fill_(2.0)
    y = norm(x)

    expected = (x / rms(x, dim=-1, eps=norm.eps)) * 2.0
    assert torch.allclose(y, expected, atol=1e-5)


# -------------------------
# 3. Bias (beta) support
# -------------------------

def test_rmsnorm_with_bias():
    x = torch.randn(4, 6)
    norm = RMSNorm(normalized_shape=6, bias=True)

    norm.bias.data.fill_(1.0)
    y = norm(x)

    expected = (x / rms(x, dim=-1, eps=norm.eps)) + 1.0
    assert torch.allclose(y, expected, atol=1e-5)


# -------------------------
# 4. Multiple normalization axes
# -------------------------

def test_rmsnorm_multiple_axes():
    x = torch.randn(2, 3, 4, 5)
    axes = (-2, -1)

    norm = RMSNorm(normalized_shape=(4, 5), normalized_axes=axes, bias=False)
    y = norm(x)

    expected = x / rms(x, dim=axes, eps=norm.eps)
    assert torch.allclose(y, expected, atol=1e-5)


# -------------------------
# 5. Dynamic shapes & broadcasting
# -------------------------

@pytest.mark.parametrize("shape", [
    (8,),
    (2, 8),
    (3, 4, 8),
    (1, 2, 3, 8),
])
def test_rmsnorm_dynamic_shapes(shape):
    x = torch.randn(*shape)
    norm = RMSNorm(normalized_shape=shape[-1])

    y = norm(x)
    assert y.shape == x.shape


# -------------------------
# 6. Mixed precision safety
# -------------------------

@pytest.mark.parametrize("dtype", [
    torch.float16,
    torch.bfloat16,
    torch.float32,
])
def test_rmsnorm_mixed_precision(dtype):
    x = torch.randn(2, 4, 8, device="cpu").to(dtype)
    norm = RMSNorm(normalized_shape=8).to(dtype)

    y = norm(x)

    assert y.dtype == dtype
    assert torch.isfinite(y).all()


# -------------------------
# 7. Zero-vector stability
# -------------------------

def test_rmsnorm_zero_vector():
    x = torch.zeros(4, 8)
    norm = RMSNorm(normalized_shape=8)

    y = norm(x)

    assert torch.isfinite(y).all()
    assert torch.allclose(y, torch.zeros_like(y))


# -------------------------
# 8. Learnable epsilon
# -------------------------

def test_rmsnorm_learnable_epsilon():
    x = torch.randn(2, 8)
    norm = RMSNorm(normalized_shape=8, learnable_eps=True)

    assert isinstance(norm.eps_param, nn.Parameter)

    y1 = norm(x)
    norm.eps_param.data.fill_(1e-1)
    y2 = norm(x)

    assert not torch.allclose(y1, y2)


# -------------------------
# 9. Preserve input dtype
# -------------------------

def test_rmsnorm_preserves_dtype():
    x = torch.randn(3, 8, dtype=torch.float16)
    norm = RMSNorm(normalized_shape=8).half()

    y = norm(x)
    assert y.dtype == torch.float16


# -------------------------
# 10. Residual scaling support
# -------------------------

def test_rmsnorm_residual_scaling():
    x = torch.randn(2, 8)
    residual = torch.randn(2, 8)
    residual_scale = 0.5

    norm = RMSNormWithResidual(
        normalized_shape=8,
        residual_scale=residual_scale
    )

    y = norm(x, residual)

    # Test that residual is properly scaled and added
    base = x / rms(x, dim=-1, eps=norm.rmsnorm.eps)
    expected = base + residual_scale * residual

    assert torch.allclose(y, expected, atol=1e-5)


# -------------------------
# 11. TorchScript compatibility
# -------------------------

def test_rmsnorm_torchscript():
    x = torch.randn(2, 8)
    norm = RMSNorm(normalized_shape=8)

    scripted = torch.jit.script(norm)
    y1 = norm(x)
    y2 = scripted(x)

    assert torch.allclose(y1, y2, atol=1e-5)


# -------------------------
# 12. ONNX export compatibility
# -------------------------

def test_rmsnorm_onnx_export(tmp_path):
    x = torch.randn(2, 8)
    norm = RMSNorm(normalized_shape=8)

    onnx_path = tmp_path / "rmsnorm.onnx"

    torch.onnx.export(
        norm,
        x,
        onnx_path,
        opset_version=17,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={"input": {0: "batch"}, "output": {0: "batch"}},
    )

    assert onnx_path.exists()


# -------------------------
# 13. Gradient correctness
# -------------------------

def test_rmsnorm_backward():
    x = torch.randn(4, 8, requires_grad=True)
    norm = RMSNorm(normalized_shape=8)

    y = norm(x).sum()
    y.backward()

    assert x.grad is not None
    assert torch.isfinite(x.grad).all()
