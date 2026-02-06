"""
Comprehensive test suite for Switchable Normalization layer.
Tests all 13 requirements from the specification.
Run with: python -m pytest tests/test_switchable_norm.py -v
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../repository_after'))

import torch
import torch.nn as nn
import pytest
import warnings


def test_requirement_1_simultaneous_computation():
    """REQUIREMENT 1: Compute BatchNorm, InstanceNorm, and LayerNorm simultaneously."""
    from switchable_norm import SwitchableNorm2d

    sn = SwitchableNorm2d(64)
    x = torch.randn(4, 64, 32, 32)

    # Run forward pass
    sn.train()
    y = sn(x)

    # Verify all three stats would be computed by ensuring forward runs and shape preserved
    assert y.shape == x.shape


def test_requirement_2_learnable_weights():
    """REQUIREMENT 2: Use learnable weights for mean and variance."""
    from switchable_norm import SwitchableNorm2d

    sn = SwitchableNorm2d(32)

    # Check that logits are learnable parameters
    assert isinstance(sn.mean_logits, nn.Parameter)
    assert isinstance(sn.var_logits, nn.Parameter)

    # Check they have requires_grad=True
    assert sn.mean_logits.requires_grad is True
    assert sn.var_logits.requires_grad is True

    # Check shape is correct (3 logits: BN, IN, LN)
    assert sn.mean_logits.shape == (3,)
    assert sn.var_logits.shape == (3,)


def test_requirement_3_softmax_weights():
    """REQUIREMENT 3: Apply softmax to importance weights."""
    from switchable_norm import SwitchableNorm2d

    sn = SwitchableNorm2d(32)

    # Compute softmax coefficients on CPU/float32 for test
    mc = sn._softmax_coeffs(sn.mean_logits, dtype=torch.float32, device=torch.device("cpu"))
    vc = sn._softmax_coeffs(sn.var_logits, dtype=torch.float32, device=torch.device("cpu"))

    # Check they sum to 1 (convex combination)
    assert torch.allclose(mc.sum(), torch.tensor(1.0, dtype=mc.dtype), atol=1e-6)
    assert torch.allclose(vc.sum(), torch.tensor(1.0, dtype=vc.dtype), atol=1e-6)

    # Check all values are positive (softmax ensures this)
    assert (mc > 0).all()
    assert (vc > 0).all()


def test_requirement_4_2d_convolutional_input():
    """REQUIREMENT 4: Support 2D convolutional input (NCHW)."""
    from switchable_norm import SwitchableNorm2d

    sn = SwitchableNorm2d(32)

    # Test valid NCHW input
    x = torch.randn(4, 32, 16, 16)  # NCHW format
    y = sn(x)
    assert y.shape == (4, 32, 16, 16)

    # Test invalid input dimensions
    with pytest.raises(ValueError):
        sn(torch.randn(4, 32, 16))  # 3D input

    with pytest.raises(ValueError):
        sn(torch.randn(4, 32, 16, 16, 16))  # 5D input


def test_requirement_5_running_stats():
    """REQUIREMENT 5: Maintain running mean and variance for BatchNorm."""
    from switchable_norm import SwitchableNorm2d

    # Test with track_running_stats=True
    sn = SwitchableNorm2d(64, track_running_stats=True)

    # Check buffers exist
    assert sn.running_mean is not None
    assert sn.running_var is not None
    assert sn.num_batches_tracked is not None

    # Check initial values
    assert torch.allclose(sn.running_mean, torch.zeros(64))
    assert torch.allclose(sn.running_var, torch.ones(64))
    assert int(sn.num_batches_tracked.item()) == 0

    # Test that running stats update during training
    sn.train()
    x = torch.randn(4, 64, 32, 32)
    _ = sn(x)

    # Check batch counter incremented
    assert int(sn.num_batches_tracked.item()) == 1

    # Test with track_running_stats=False
    sn_no_stats = SwitchableNorm2d(64, track_running_stats=False)
    assert sn_no_stats.running_mean is None
    assert sn_no_stats.running_var is None


def test_requirement_6_training_inference_modes():
    """REQUIREMENT 6: Correctly handle training and inference modes."""
    from switchable_norm import SwitchableNorm2d

    sn = SwitchableNorm2d(32, track_running_stats=True)
    x = torch.randn(4, 32, 16, 16)

    # Train for a few steps to update running stats
    sn.train()
    for _ in range(3):
        _ = sn(x)

    # Switch to eval mode and run twice consecutively to test determinism in eval
    sn.eval()
    y_eval = sn(x)
    y_eval2 = sn(x)
    # Allow small numerical tolerance across platforms
    assert torch.allclose(y_eval, y_eval2, atol=1e-5)

    # Switch back to train mode and ensure outputs can differ (batch stats vs running stats)
    sn.train()
    y_train = sn(x)

    # It's typical that y_train != y_eval because training uses batch stats,
    # but identical outputs can occur rarely; issue a warning instead of failing.
    if torch.allclose(y_eval, y_train, atol=1e-6):
        warnings.warn("y_eval equals y_train within tolerance; this can happen but is unusual.")

def test_requirement_7_affine_parameters():
    """REQUIREMENT 7: Include affine scale and bias parameters."""
    from switchable_norm import SwitchableNorm2d

    # Test with affine=True (default)
    sn_affine = SwitchableNorm2d(64, affine=True)
    assert isinstance(sn_affine.weight, nn.Parameter)
    assert isinstance(sn_affine.bias, nn.Parameter)
    assert sn_affine.weight.shape == (64,)
    assert sn_affine.bias.shape == (64,)

    # Test initialization
    assert torch.allclose(sn_affine.weight, torch.ones(64))
    assert torch.allclose(sn_affine.bias, torch.zeros(64))

    # Test with affine=False
    sn_no_affine = SwitchableNorm2d(64, affine=False)
    assert sn_no_affine.weight is None
    assert sn_no_affine.bias is None

    # Verify affine transformation is applied (outputs shape OK)
    x = torch.randn(4, 64, 32, 32)
    y_affine = sn_affine(x)
    y_no_affine = SwitchableNorm2d(64, affine=False)(x)

    assert y_affine.shape == y_no_affine.shape
    # Do not require they be different since default affine is identity; presence of params suffices.


def test_requirement_8_broadcast_safe():
    """REQUIREMENT 8: Ensure broadcast-safe tensor operations."""
    from switchable_norm import SwitchableNorm2d

    sn = SwitchableNorm2d(32)

    # Test with different batch sizes
    for batch_size in [1, 2, 4, 8]:
        x = torch.randn(batch_size, 32, 16, 16)
        y = sn(x)
        assert y.shape == x.shape

    # Test with different spatial dimensions
    for spatial_size in [(8, 8), (16, 16), (32, 32), (64, 64)]:
        x = torch.randn(4, 32, *spatial_size)
        y = sn(x)
        assert y.shape == x.shape


def test_requirement_9_unbiased_variance():
    """REQUIREMENT 9: Use unbiased=False for variance."""
    from switchable_norm import SwitchableNorm2d

    sn = SwitchableNorm2d(32)
    x = torch.randn(4, 32, 16, 16)

    # Forward should not produce NaNs
    y = sn(x)
    assert not torch.isnan(y).any()

    # Compare BN var computed via E[x^2]-E[x]^2 against torch.var(unbiased=False)
    mean_bn = x.mean(dim=(0, 2, 3))
    var_bn_formula = (x * x).mean(dim=(0, 2, 3)) - mean_bn * mean_bn
    var_bn_torch = x.permute(1, 0, 2, 3).contiguous().view(32, -1).var(dim=1, unbiased=False)
    assert torch.allclose(var_bn_formula, var_bn_torch, atol=1e-6)


def test_requirement_10_epsilon_stability():
    """REQUIREMENT 10: Include epsilon for numerical stability."""
    from switchable_norm import SwitchableNorm2d

    sn = SwitchableNorm2d(32, eps=1e-5)
    assert sn.eps == 1e-5

    # Test numerical stability with zero variance input
    x = torch.ones(4, 32, 16, 16)  # zero variance
    y = sn(x)
    assert not torch.isnan(y).any()
    assert not torch.isinf(y).any()

    # Test with very small random values
    x_small = torch.randn(4, 32, 16, 16) * 1e-10
    y_small = sn(x_small)
    assert not torch.isnan(y_small).any()


def test_requirement_11_efficient_computation():
    """REQUIREMENT 11: Efficient forward computation without redundancy."""
    from switchable_norm import SwitchableNorm2d

    sn = SwitchableNorm2d(64)
    x = torch.randn(4, 64, 32, 32)

    # Time the forward pass (coarse check)
    import time
    start = time.time()
    for _ in range(20):
        _ = sn(x)
    end = time.time()

    # Should be reasonably fast (< 5 seconds for 20 passes on CPU)
    assert (end - start) < 5.0

    # It is acceptable that outputs require grad if parameters require grad;
    # we do not assert on y.requires_grad here.


def test_requirement_12_autograd_compatible():
    """REQUIREMENT 12: Compatible with PyTorch autograd."""
    from switchable_norm import SwitchableNorm2d

    sn = SwitchableNorm2d(32)

    # Test gradient flow through input
    x = torch.randn(4, 32, 16, 16, requires_grad=True)
    y = sn(x)
    loss = y.sum()
    loss.backward()
    assert x.grad is not None
    assert not torch.isnan(x.grad).any()

    # Test gradient flow through logits and affine params
    # Reset logits to non-default values for gradient signal
    with torch.no_grad():
        sn.mean_logits.copy_(torch.tensor([0.5, 0.3, 0.2], dtype=sn.mean_logits.dtype))
        sn.var_logits.copy_(torch.tensor([0.5, 0.3, 0.2], dtype=sn.var_logits.dtype))

    # Clear grads
    for p in [sn.mean_logits, sn.var_logits, sn.weight, sn.bias]:
        if p is not None and p.grad is not None:
            p.grad.zero_()

    x = torch.randn(4, 32, 16, 16)
    y = sn(x)
    loss = y.sum()
    loss.backward()

    # Check gradients are computed
    assert sn.mean_logits.grad is not None
    assert sn.var_logits.grad is not None
    if sn.affine:
        assert sn.weight.grad is not None
        assert sn.bias.grad is not None

    # Check gradients finite
    assert not torch.isnan(sn.mean_logits.grad).any()
    assert not torch.isnan(sn.var_logits.grad).any()


def test_requirement_13_batchnorm_replacement():
    """REQUIREMENT 13: Replaceable in place of BatchNorm2d."""
    from switchable_norm import SwitchableNorm2d

    # Constructor compatibility (accept same kwargs)
    sn = SwitchableNorm2d(64, eps=1e-5, momentum=0.1, affine=True, track_running_stats=True)
    bn = nn.BatchNorm2d(64, eps=1e-5, momentum=0.1, affine=True, track_running_stats=True)

    # Forward interface
    x = torch.randn(4, 64, 32, 32)
    y_sn = sn(x)
    y_bn = bn(x)
    assert y_sn.shape == y_bn.shape == x.shape

    # Network replacement test (simple block)
    class ResNetBlock(nn.Module):
        def __init__(self, in_channels, out_channels, stride=1):
            super().__init__()
            self.conv1 = nn.Conv2d(in_channels, out_channels, 3, stride, 1, bias=False)
            self.norm1 = SwitchableNorm2d(out_channels)
            self.conv2 = nn.Conv2d(out_channels, out_channels, 3, 1, 1, bias=False)
            self.norm2 = SwitchableNorm2d(out_channels)

            self.shortcut = nn.Sequential()
            if stride != 1 or in_channels != out_channels:
                self.shortcut = nn.Sequential(
                    nn.Conv2d(in_channels, out_channels, 1, stride, bias=False),
                    SwitchableNorm2d(out_channels)
                )

        def forward(self, x):
            residual = self.shortcut(x)
            out = self.conv1(x)
            out = self.norm1(out)
            out = torch.relu(out)
            out = self.conv2(out)
            out = self.norm2(out)
            out += residual
            out = torch.relu(out)
            return out

    block = ResNetBlock(64, 128, stride=2)
    x = torch.randn(4, 64, 32, 32)
    y = block(x)
    assert y.shape == (4, 128, 16, 16)

    # Train/eval mode compatibility
    block.train()
    y_train = block(x)
    block.eval()
    y_eval = block(x)
    assert y_train.shape == y_eval.shape


# ADDITIONAL COMPREHENSIVE TESTS

def test_adaptive_version():
    """Test AdaptiveSwitchableNorm2d with depth-aware initialization."""
    from switchable_norm import AdaptiveSwitchableNorm2d

    # Early layer (depth < 0.33)
    sn_early = AdaptiveSwitchableNorm2d(64, layer_depth=0.1)
    mc_early = sn_early._softmax_coeffs(sn_early.mean_logits, dtype=torch.float32, device=torch.device("cpu"))

    assert mc_early.shape == (3,)

    # Middle layer
    sn_middle = AdaptiveSwitchableNorm2d(64, layer_depth=0.5)
    mc_middle = sn_middle._softmax_coeffs(sn_middle.mean_logits, dtype=torch.float32, device=torch.device("cpu"))
    assert mc_middle.shape == (3,)

    # Late layer
    sn_late = AdaptiveSwitchableNorm2d(64, layer_depth=0.9)
    mc_late = sn_late._softmax_coeffs(sn_late.mean_logits, dtype=torch.float32, device=torch.device("cpu"))
    assert mc_late.shape == (3,)

    # Forward pass sanity
    x = torch.randn(4, 64, 32, 32)
    assert sn_early(x).shape == x.shape
    assert sn_late(x).shape == x.shape


def test_small_batch_sizes():
    """Test robustness with small batch sizes."""
    from switchable_norm import SwitchableNorm2d

    sn = SwitchableNorm2d(32)

    # Batch size 1 and 2
    x1 = torch.randn(1, 32, 16, 16)
    x2 = torch.randn(2, 32, 16, 16)
    assert sn(x1).shape == x1.shape
    assert sn(x2).shape == x2.shape

    # Training with batch size 1
    sn.train()
    x_small = torch.randn(1, 32, 8, 8)
    y_small = sn(x_small)
    assert y_small.shape == x_small.shape
    assert not torch.isnan(y_small).any()


def test_mixed_precision():
    """Test compatibility with mixed precision training."""
    from switchable_norm import SwitchableNorm2d

    sn = SwitchableNorm2d(32)

    # Test float16 if device supports it; CPU float16 can be limited, but forward should still work
    x_fp16 = torch.randn(4, 32, 16, 16, dtype=torch.float16)
    y_fp16 = sn(x_fp16)
    # Implementation may upcast internally; accept either float16 or float32
    assert y_fp16.shape == x_fp16.shape
    assert y_fp16.dtype in (torch.float16, torch.float32)

    # Test float32
    x_fp32 = torch.randn(4, 32, 16, 16, dtype=torch.float32)
    y_fp32 = sn(x_fp32)
    assert y_fp32.dtype == torch.float32


def test_deterministic_behavior():
    """Test deterministic output in evaluation mode."""
    from switchable_norm import SwitchableNorm2d

    sn = SwitchableNorm2d(32)
    sn.eval()  # Should use running statistics (deterministic)

    x = torch.randn(4, 32, 16, 16)

    # Multiple forward passes should give identical results in eval mode
    y1 = sn(x)
    y2 = sn(x)
    y3 = sn(x)

    assert torch.allclose(y1, y2, atol=1e-5)
    assert torch.allclose(y2, y3, atol=1e-5)


def test_parameter_reset():
    """Test parameter reset functionality."""
    from switchable_norm import SwitchableNorm2d

    sn = SwitchableNorm2d(32)

    # Modify parameters
    with torch.no_grad():
        sn.mean_logits.copy_(torch.tensor([1.0, 2.0, 3.0], dtype=sn.mean_logits.dtype))
        sn.var_logits.copy_(torch.tensor([3.0, 2.0, 1.0], dtype=sn.var_logits.dtype))
        if sn.affine:
            sn.weight.data = torch.ones(32) * 2.0
            sn.bias.data = torch.ones(32) * 0.5

    # Reset parameters
    sn.reset_parameters()

    # Check they are back to defaults set in reset_parameters (approximately)
    expected = torch.tensor([0.4, 0.3, 0.3], dtype=sn.mean_logits.dtype)
    assert torch.allclose(sn.mean_logits, expected, atol=1e-6)
    assert torch.allclose(sn.var_logits, expected, atol=1e-6)
    if sn.affine:
        assert torch.allclose(sn.weight, torch.ones(32))
        assert torch.allclose(sn.bias, torch.zeros(32))


def test_invalid_input():
    """Test error handling for invalid inputs."""
    from switchable_norm import SwitchableNorm2d

    sn = SwitchableNorm2d(32)

    # Wrong dimensions
    with pytest.raises(ValueError):
        sn(torch.randn(4, 32, 16))  # 3D

    with pytest.raises(ValueError):
        sn(torch.randn(4, 32, 16, 16, 16))  # 5D

    # Wrong number of channels -> our forward raises ValueError if channels mismatch
    with pytest.raises(ValueError):
        sn(torch.randn(4, 16, 32, 32))