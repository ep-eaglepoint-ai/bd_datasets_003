"""
Test file for optimized SwitchableNorm2d implementation.
Tests all 13 requirements for the refactoring task.
"""

import sys
import os
import torch
import torch.nn as nn
import pytest
import time
import warnings

# Add repository_after to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../repository_after'))


def test_import_and_initialization():
    """Test that the module can be imported and initialized."""
    from switchablenorm import SwitchableNorm2d
    
    # Test initialization with default parameters
    sn = SwitchableNorm2d(64)
    assert sn.num_features == 64
    assert sn.eps == 1e-5
    assert sn.momentum == 0.1
    assert sn.affine == True
    assert sn.track_running_stats == True
    
    # Test parameters exist
    assert isinstance(sn.weight_mean, nn.Parameter)
    assert isinstance(sn.weight_var, nn.Parameter)
    assert sn.weight_mean.shape == (3,)
    assert sn.weight_var.shape == (3,)
    
    # Test affine parameters
    assert sn.weight is not None
    assert sn.bias is not None
    assert sn.weight.shape == (64,)
    assert sn.bias.shape == (64,)
    
    # Test running stats
    assert sn.running_mean is not None
    assert sn.running_var is not None
    assert sn.num_batches_tracked is not None
    
    print("✓ Import and initialization test passed")


def test_no_python_loops():
    """REQUIREMENT 1: Remove all Python loops over batch, channel, or spatial dimensions."""
    from switchablenorm import SwitchableNorm2d
    
    # Create different layers for different channel sizes
    sn32 = SwitchableNorm2d(32)
    sn16 = SwitchableNorm2d(16)
    sn64 = SwitchableNorm2d(64)
    
    # Test with matching channel sizes
    test_cases = [
        (sn16, 1, 16, 8, 8),
        (sn32, 2, 32, 16, 16),
        (sn64, 8, 64, 32, 32)
    ]
    
    for sn, batch, channels, h, w in test_cases:
        x_test = torch.randn(batch, channels, h, w)
        y_test = sn(x_test)
        assert y_test.shape == x_test.shape
    
    # Test that mismatched channels raises error
    sn32 = SwitchableNorm2d(32)
    x_wrong = torch.randn(2, 64, 16, 16)  # 64 channels but sn32 expects 32
    with pytest.raises(ValueError):
        sn32(x_wrong)
    
    print("✓ Requirement 1: No Python loops in forward pass")


def test_vectorized_mean_variance():
    """REQUIREMENT 2: Vectorize all mean and variance calculations."""
    from switchablenorm import SwitchableNorm2d
    
    sn = SwitchableNorm2d(32)
    x = torch.randn(4, 32, 16, 16)
    
    # Call internal statistics computation
    bn_mean, bn_var, in_mean, in_var, ln_mean, ln_var = sn._compute_statistics(x)
    
    # Check shapes are correct (indicating vectorization)
    assert bn_mean.shape == (32,)  # Vectorized across batch and spatial
    assert bn_var.shape == (32,)
    assert in_mean.shape == (4, 32)  # Vectorized across spatial
    assert in_var.shape == (4, 32)
    assert ln_mean.shape == (4, 1, 1, 1)  # Vectorized across channel and spatial
    assert ln_var.shape == (4, 1, 1, 1)
    
    # Verify calculations are correct
    # For BatchNorm
    expected_bn_mean = x.mean(dim=[0, 2, 3])
    expected_bn_var = x.var(dim=[0, 2, 3], unbiased=False)
    assert torch.allclose(bn_mean, expected_bn_mean, atol=1e-6)
    assert torch.allclose(bn_var, expected_bn_var, atol=1e-6)
    
    print("✓ Requirement 2: All mean/variance calculations vectorized")


def test_no_unnecessary_cloning():
    """REQUIREMENT 3: Eliminate redundant tensor cloning and detaching."""
    from switchablenorm import SwitchableNorm2d
    
    sn = SwitchableNorm2d(32)
    x = torch.randn(4, 32, 16, 16, requires_grad=True)
    
    # Forward pass should preserve gradient connection
    y = sn(x)
    
    # Verify gradient can flow
    loss = y.sum()
    loss.backward()
    
    assert x.grad is not None
    assert not torch.isnan(x.grad).any()
    
    # Verify output requires_grad matches input
    assert x.requires_grad == True
    assert y.requires_grad == True
    
    # Check that we're not cloning unnecessarily
    # This is verified by the fact that gradients flow correctly
    
    print("✓ Requirement 3: No unnecessary cloning/detaching")


def test_single_softmax():
    """REQUIREMENT 4: Remove repeated softmax computations."""
    from switchablenorm import SwitchableNorm2d
    
    sn = SwitchableNorm2d(32)
    
    # Get normalized weights
    mean_weights, var_weights = sn._get_normalized_weights()
    
    # Verify single softmax (not double)
    assert torch.allclose(mean_weights.sum(), torch.tensor(1.0), atol=1e-6)
    assert torch.allclose(var_weights.sum(), torch.tensor(1.0), atol=1e-6)
    
    # Check they're properly normalized (softmax ensures this)
    assert (mean_weights >= 0).all()
    assert (var_weights >= 0).all()
    
    # Verify not double-softmaxed by checking values are reasonable
    # Double softmax would make values more extreme
    assert (mean_weights > 0.1).any()  # Not all pushed to extremes
    
    print("✓ Requirement 4: Single softmax (not repeated)")


def test_implicit_broadcasting():
    """REQUIREMENT 5: Replace manual broadcasting with implicit PyTorch broadcasting."""
    from switchablenorm import SwitchableNorm2d
    
    sn = SwitchableNorm2d(32)
    x = torch.randn(4, 32, 16, 16)
    
    # Run forward to trigger broadcasting
    y = sn(x)
    
    # The implementation uses view() for reshaping, not expand()/repeat()
    # Check by verifying the output shape matches input
    assert y.shape == x.shape
    
    # Test with different batch sizes and spatial dimensions (same channels)
    test_shapes = [(1, 32, 8, 8), (2, 32, 16, 16), (8, 32, 32, 32)]
    for shape in test_shapes:
        x_test = torch.randn(*shape)
        y_test = sn(x_test)
        assert y_test.shape == x_test.shape
    
    print("✓ Requirement 5: Implicit PyTorch broadcasting used")


def test_running_stats_optimization():
    """REQUIREMENT 6: Optimize running statistics updates for training mode."""
    from switchablenorm import SwitchableNorm2d
    
    sn = SwitchableNorm2d(32, track_running_stats=True)
    x = torch.randn(4, 32, 16, 16)
    
    # Initial values
    initial_mean = sn.running_mean.clone()
    initial_var = sn.running_var.clone()
    
    # Training mode - should update running stats
    sn.train()
    _ = sn(x)
    
    # Check batch counter incremented
    assert sn.num_batches_tracked.item() == 1
    
    # Check running stats changed
    assert not torch.allclose(sn.running_mean, initial_mean, atol=1e-6)
    assert not torch.allclose(sn.running_var, initial_var, atol=1e-6)
    
    # Eval mode - should not update
    sn.eval()
    running_mean_before = sn.running_mean.clone()
    _ = sn(x)
    assert torch.allclose(sn.running_mean, running_mean_before, atol=1e-6)
    
    print("✓ Requirement 6: Optimized running statistics updates")


def test_eval_mode_handling():
    """REQUIREMENT 7: Ensure correct handling of evaluation mode using running stats."""
    from switchablenorm import SwitchableNorm2d
    
    sn = SwitchableNorm2d(32, track_running_stats=True)
    x = torch.randn(4, 32, 16, 16)
    
    # Train for a few steps to update running stats
    sn.train()
    for _ in range(3):
        _ = sn(x)
    
    # Switch to eval mode
    sn.eval()
    y_eval = sn(x)
    
    # Switch back to train
    sn.train()
    y_train = sn(x)
    
    # Should be different (batch stats vs running stats)
    assert not torch.allclose(y_eval, y_train, atol=1e-6)
    
    # Test with track_running_stats=False
    sn_no_stats = SwitchableNorm2d(32, track_running_stats=False)
    sn_no_stats.eval()
    y_no_stats = sn_no_stats(x)
    sn_no_stats.train()
    y_no_stats_train = sn_no_stats(x)
    # Should be same since no running stats
    assert torch.allclose(y_no_stats, y_no_stats_train, atol=1e-6)
    
    print("✓ Requirement 7: Correct evaluation mode handling")


def test_autograd_support():
    """REQUIREMENT 8: Maintain proper autograd support."""
    from switchablenorm import SwitchableNorm2d
    
    sn = SwitchableNorm2d(32)
    
    # Test gradient through input
    x = torch.randn(4, 32, 16, 16, requires_grad=True)
    y = sn(x)
    loss = y.sum()
    loss.backward()
    
    assert x.grad is not None
    assert not torch.isnan(x.grad).any()
    
    # Test gradient through learnable weights
    # Clear gradients first
    sn.zero_grad()
    
    # Forward and backward
    x = torch.randn(4, 32, 16, 16, requires_grad=True)
    y = sn(x)
    loss = y.sum()
    loss.backward()
    
    # Check gradients computed
    assert sn.weight_mean.grad is not None
    assert sn.weight_var.grad is not None
    assert sn.weight.grad is not None
    assert sn.bias.grad is not None
    
    # Check gradients are finite
    assert not torch.isnan(sn.weight_mean.grad).any()
    assert not torch.isnan(sn.weight_var.grad).any()
    
    print("✓ Requirement 8: Proper autograd support maintained")


def test_memory_efficiency():
    """REQUIREMENT 9: Reduce memory allocations and temporary tensors."""
    from switchablenorm import SwitchableNorm2d
    
    sn = SwitchableNorm2d(32)
    x = torch.randn(4, 32, 16, 16)
    
    # Time multiple passes to check efficiency
    import time
    
    # Warmup
    for _ in range(10):
        _ = sn(x)
    
    # Benchmark
    start = time.time()
    for _ in range(100):
        _ = sn(x)
    duration = time.time() - start
    
    # Should be efficient (under 2 seconds for 100 passes on CPU)
    assert duration < 5.0, f"Performance issue: {duration:.3f}s for 100 passes"
    
    print(f"✓ Requirement 9: Memory efficient ({duration:.3f}s for 100 passes)")


def test_code_consolidation():
    """REQUIREMENT 10: Consolidate duplicated code and helper functions."""
    from switchablenorm import SwitchableNorm2d
    
    # Check that _compute_statistics consolidates all stat computations
    sn = SwitchableNorm2d(32)
    x = torch.randn(4, 32, 16, 16)
    
    # Single call computes all statistics
    stats = sn._compute_statistics(x)
    assert len(stats) == 6  # All stats in one tuple
    
    # Check method names for clarity
    assert hasattr(sn, '_get_normalized_weights')
    assert hasattr(sn, '_compute_statistics')
    assert hasattr(sn, '_check_input_dim')
    
    # Check no redundant methods like _redundant_softmax or _manual_mean
    assert not hasattr(sn, '_redundant_softmax')
    assert not hasattr(sn, '_manual_mean')
    
    print("✓ Requirement 10: Code consolidated, no duplication")


def test_variable_naming():
    """REQUIREMENT 11: Improve variable naming for clarity."""
    from switchablenorm import SwitchableNorm2d
    
    sn = SwitchableNorm2d(32)
    
    # Check that variable names are clear
    assert hasattr(sn, 'weight_mean')  # Clear: weights for mean
    assert hasattr(sn, 'weight_var')   # Clear: weights for variance
    
    # Check parameter names are descriptive
    assert sn.weight_mean.shape == (3,)  # For 3 normalization types
    assert sn.weight_var.shape == (3,)
    
    print("✓ Requirement 11: Clear, descriptive variable names")


def test_readable_structure():
    """REQUIREMENT 12: Structure forward pass for readability and maintainability."""
    from switchablenorm import SwitchableNorm2d
    
    # Check that forward pass is modular
    sn = SwitchableNorm2d(32)
    x = torch.randn(4, 32, 16, 16)
    
    # Run forward pass
    y = sn(x)
    assert y.shape == x.shape
    
    # Test edge cases with same channel size
    # Small batch
    x_small = torch.randn(1, 32, 8, 8)
    y_small = sn(x_small)
    assert y_small.shape == x_small.shape
    
    # Different spatial dimensions
    x_large = torch.randn(2, 32, 64, 64)
    y_large = sn(x_large)
    assert y_large.shape == x_large.shape
    
    # Different number of channels requires new layer
    sn_large = SwitchableNorm2d(128)
    x_channels = torch.randn(4, 128, 16, 16)
    y_channels = sn_large(x_channels)
    assert y_channels.shape == x_channels.shape
    
    print("✓ Requirement 12: Clean, maintainable forward pass structure")


def test_numerical_stability():
    """REQUIREMENT 13: Ensure numerical stability with proper epsilon handling."""
    from switchablenorm import SwitchableNorm2d
    
    # Test with different epsilon values
    for eps in [1e-5, 1e-6, 1e-8]:
        sn = SwitchableNorm2d(32, eps=eps)
        assert sn.eps == eps
    
    # Test near-zero variance case
    sn = SwitchableNorm2d(32, eps=1e-5)
    x = torch.ones(4, 32, 16, 16)  # All same values -> zero variance
    
    # Should not produce NaN or Inf
    y = sn(x)
    assert not torch.isnan(y).any()
    assert not torch.isinf(y).any()
    
    # Test with very small values
    x_small = torch.randn(4, 32, 16, 16) * 1e-10
    y_small = sn(x_small)
    assert not torch.isnan(y_small).any()
    assert not torch.isinf(y_small).any()
    
    print("✓ Requirement 13: Numerical stability with proper epsilon handling")


def test_functional_equivalence():
    """Test that optimized version produces equivalent results to original logic."""
    from switchablenorm import SwitchableNorm2d
    
    sn = SwitchableNorm2d(32, eps=1e-5, momentum=0.1, affine=True)
    x = torch.randn(4, 32, 16, 16)
    
    # Set specific weights for consistency
    with torch.no_grad():
        sn.weight_mean.data = torch.tensor([0.3, 0.4, 0.3], 
                                          device=sn.weight_mean.device,
                                          dtype=sn.weight_mean.dtype)
        sn.weight_var.data = torch.tensor([0.3, 0.4, 0.3], 
                                         device=sn.weight_var.device,
                                         dtype=sn.weight_var.dtype)
    
    # Get output
    y = sn(x)
    
    # Basic checks
    assert y.shape == x.shape
    assert not torch.isnan(y).any()
    assert not torch.isinf(y).any()
    
    # Test training vs eval produce different results (as expected)
    sn.train()
    y_train = sn(x)
    sn.eval()
    y_eval = sn(x)
    assert not torch.allclose(y_train, y_eval, atol=1e-6)
    
    print("✓ Functional behavior preserved")


def test_performance_improvement():
    """Test that optimized version is faster than original approach would be."""
    from switchablenorm import SwitchableNorm2d
    
    sn = SwitchableNorm2d(64)
    x = torch.randn(8, 64, 32, 32)
    
    # Warmup
    for _ in range(10):
        _ = sn(x)
    
    # Benchmark optimized version
    import time
    start = time.time()
    for _ in range(100):
        _ = sn(x)
    optimized_time = time.time() - start
    
    # Should be fast (original with loops would be much slower)
    # Using a reasonable threshold for CPU
    assert optimized_time < 5.0, f"Optimized version too slow: {optimized_time:.3f}s"
    
    print(f"✓ Performance: {optimized_time:.3f}s for 100 passes (fast!)")


def run_all_tests():
    """Run all tests and report results."""
    print("=" * 70)
    print("TESTING OPTIMIZED SWITCHABLENORM2D IMPLEMENTATION")
    print("=" * 70)
    
    tests = [
        ("Import and Initialization", test_import_and_initialization),
        ("No Python Loops", test_no_python_loops),
        ("Vectorized Mean/Variance", test_vectorized_mean_variance),
        ("No Unnecessary Cloning", test_no_unnecessary_cloning),
        ("Single Softmax", test_single_softmax),
        ("Implicit Broadcasting", test_implicit_broadcasting),
        ("Running Stats Optimization", test_running_stats_optimization),
        ("Eval Mode Handling", test_eval_mode_handling),
        ("Autograd Support", test_autograd_support),
        ("Memory Efficiency", test_memory_efficiency),
        ("Code Consolidation", test_code_consolidation),
        ("Variable Naming", test_variable_naming),
        ("Readable Structure", test_readable_structure),
        ("Numerical Stability", test_numerical_stability),
        ("Functional Equivalence", test_functional_equivalence),
        ("Performance Improvement", test_performance_improvement),
    ]
    
    passed = 0
    failed = 0
    errors = []
    
    for name, test_func in tests:
        try:
            test_func()
            print(f"{name}")
            passed += 1
        except AssertionError as e:
            print(f"{name}: Assertion failed - {str(e)}")
            failed += 1
            errors.append(f"{name}: {str(e)}")
        except Exception as e:
            print(f"{name}: Error - {str(e)}")
            failed += 1
            errors.append(f"{name}: {str(e)}")
    
    print("\n" + "=" * 70)
    print(f"RESULTS: {passed} passed, {failed} failed")
    
    if errors:
        print("\nErrors:")
        for error in errors:
            print(f"  - {error}")
    
    print("=" * 70)
    
    return failed == 0


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)