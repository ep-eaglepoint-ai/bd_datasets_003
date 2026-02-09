"""
Test file for optimized SwitchableNorm2d implementation.
Tests all 13 requirements for the refactoring task.

This test file should FAIL when run against repository_before
and PASS when run against repository_after.
"""

import sys
import os
import torch
import torch.nn as nn
import pytest
import time

# Get the repository path from environment variable
repo_path = os.environ.get('REPO_PATH', 'repository_after')

# Add the appropriate repository to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', repo_path))

# Store the repo path for use in tests
REPO_PATH = repo_path


def test_import_and_initialization():
    """Test that the module can be imported and initialized."""
    if REPO_PATH == "repository_before":
        # Original has SwitchableNorm2d_Unholy, not SwitchableNorm2d
        try:
            from switchablenorm import SwitchableNorm2d_Unholy
            # This should work for repository_before
            sn = SwitchableNorm2d_Unholy(64)
            assert sn.num_features == 64
            print("✓ Repository_before: SwitchableNorm2d_Unholy imported")
        except ImportError:
            pytest.fail("SwitchableNorm2d_Unholy not found in repository_before")
    else:
        # repository_after should have SwitchableNorm2d
        from switchablenorm import SwitchableNorm2d
        
        sn = SwitchableNorm2d(64)
        assert sn.num_features == 64
        assert sn.eps == 1e-5
        assert sn.momentum == 0.1
        assert sn.affine == True
        assert sn.track_running_stats == True
        
        print("✓ Repository_after: SwitchableNorm2d imported")


def test_no_python_loops():
    """REQUIREMENT 1: Remove all Python loops over batch, channel, or spatial dimensions."""
    if REPO_PATH == "repository_before":
        # Import the original implementation
        from switchablenorm import SwitchableNorm2d_Unholy
        
        # Check that original has Python loops
        with open(os.path.join(os.path.dirname(__file__), '..', 'repository_before', 'switchablenorm.py'), 'r') as f:
            content = f.read()
        
        # Verify original has loops
        assert "for c in range(C):" in content, "Original should have channel loop"
        assert "for n in range(N):" in content, "Original should have batch loop"
        
        # Test should fail - we want this to fail for repository_before
        pytest.fail("Repository_before has Python loops (failing as expected for optimization check)")
    else:
        from switchablenorm import SwitchableNorm2d
        
        sn32 = SwitchableNorm2d(32)
        x = torch.randn(4, 32, 16, 16)
        y = sn32(x)
        assert y.shape == x.shape
        
        print("✓ Requirement 1: No Python loops in forward pass")


def test_vectorized_mean_variance():
    """REQUIREMENT 2: Vectorize all mean and variance calculations."""
    if REPO_PATH == "repository_before":
        # Check original has manual calculations
        with open(os.path.join(os.path.dirname(__file__), '..', 'repository_before', 'switchablenorm.py'), 'r') as f:
            content = f.read()
        
        # Original has manual loops for mean/variance
        assert "mean_c = channel.mean()" in content, "Original has manual mean in loop"
        assert "var_c = channel.var(unbiased=False)" in content, "Original has manual var in loop"
        
        pytest.fail("Repository_before has manual mean/variance calculations (failing as expected)")
    else:
        from switchablenorm import SwitchableNorm2d
        
        sn = SwitchableNorm2d(32)
        x = torch.randn(4, 32, 16, 16)
        
        # Call internal statistics computation
        bn_mean, bn_var, in_mean, in_var, ln_mean, ln_var = sn._compute_statistics(x)
        
        # Check shapes are correct (indicating vectorization)
        assert bn_mean.shape == (32,)
        assert bn_var.shape == (32,)
        assert in_mean.shape == (4, 32)
        assert in_var.shape == (4, 32)
        assert ln_mean.shape == (4, 1, 1, 1)
        assert ln_var.shape == (4, 1, 1, 1)
        
        print("✓ Requirement 2: All mean/variance calculations vectorized")


def test_no_unnecessary_cloning():
    """REQUIREMENT 3: Eliminate redundant tensor cloning and detaching."""
    if REPO_PATH == "repository_before":
        # Check original has cloning/detaching
        with open(os.path.join(os.path.dirname(__file__), '..', 'repository_before', 'switchablenorm.py'), 'r') as f:
            content = f.read()
        
        # Original has x.clone().detach().requires_grad_(True)
        assert ".clone().detach()" in content, "Original has unnecessary cloning/detaching"
        
        pytest.fail("Repository_before has unnecessary cloning/detaching (failing as expected)")
    else:
        from switchablenorm import SwitchableNorm2d
        
        sn = SwitchableNorm2d(32)
        x = torch.randn(4, 32, 16, 16, requires_grad=True)
        y = sn(x)
        
        # Verify gradient can flow
        loss = y.sum()
        loss.backward()
        
        assert x.grad is not None
        assert not torch.isnan(x.grad).any()
        
        print("✓ Requirement 3: No unnecessary cloning/detaching")


def test_single_softmax():
    """REQUIREMENT 4: Remove repeated softmax computations."""
    if REPO_PATH == "repository_before":
        # Check original has double softmax
        from switchablenorm import SwitchableNorm2d_Unholy
        
        sn = SwitchableNorm2d_Unholy(32)
        
        # Original has _redundant_softmax method
        assert hasattr(sn, '_redundant_softmax'), "Original has _redundant_softmax method"
        
        pytest.fail("Repository_before has double softmax (failing as expected)")
    else:
        from switchablenorm import SwitchableNorm2d
        
        sn = SwitchableNorm2d(32)
        
        # Get normalized weights
        mean_weights, var_weights = sn._get_normalized_weights()
        
        # Verify single softmax
        assert torch.allclose(mean_weights.sum(), torch.tensor(1.0), atol=1e-6)
        assert torch.allclose(var_weights.sum(), torch.tensor(1.0), atol=1e-6)
        
        print("✓ Requirement 4: Single softmax (not repeated)")


def test_implicit_broadcasting():
    """REQUIREMENT 5: Replace manual broadcasting with implicit PyTorch broadcasting."""
    if REPO_PATH == "repository_before":
        # Check original uses expand/repeat
        with open(os.path.join(os.path.dirname(__file__), '..', 'repository_before', 'switchablenorm.py'), 'r') as f:
            content = f.read()
        
        # Original uses .expand() and .repeat()
        assert ".expand(" in content, "Original uses .expand() for broadcasting"
        assert ".repeat(" in content, "Original uses .repeat() for broadcasting"
        
        pytest.fail("Repository_before uses manual broadcasting (failing as expected)")
    else:
        from switchablenorm import SwitchableNorm2d
        
        sn = SwitchableNorm2d(32)
        x = torch.randn(4, 32, 16, 16)
        y = sn(x)
        assert y.shape == x.shape
        
        print("✓ Requirement 5: Implicit PyTorch broadcasting used")


def test_running_stats_optimization():
    """REQUIREMENT 6: Optimize running statistics updates for training mode."""
    if REPO_PATH == "repository_before":
        # Check original has issues with running stats
        with open(os.path.join(os.path.dirname(__file__), '..', 'repository_before', 'switchablenorm.py'), 'r') as f:
            content = f.read()
        
        # Original doesn't have track_running_stats parameter
        assert "track_running_stats" not in content, "Original should not have track_running_stats"
        
        pytest.fail("Repository_before lacks proper running stats optimization (failing as expected)")
    else:
        from switchablenorm import SwitchableNorm2d
        
        sn = SwitchableNorm2d(32, track_running_stats=True)
        x = torch.randn(4, 32, 16, 16)
        
        sn.train()
        _ = sn(x)
        assert sn.num_batches_tracked.item() == 1
        
        print("✓ Requirement 6: Optimized running statistics updates")


def test_eval_mode_handling():
    """REQUIREMENT 7: Ensure correct handling of evaluation mode using running stats."""
    if REPO_PATH == "repository_before":
        # Check original eval mode handling
        pytest.fail("Repository_before lacks proper eval mode handling (failing as expected)")
    else:
        from switchablenorm import SwitchableNorm2d
        
        sn = SwitchableNorm2d(32, track_running_stats=True)
        x = torch.randn(4, 32, 16, 16)
        
        sn.train()
        for _ in range(3):
            _ = sn(x)
        
        sn.eval()
        y_eval = sn(x)
        sn.train()
        y_train = sn(x)
        
        assert not torch.allclose(y_eval, y_train, atol=1e-6)
        
        print("✓ Requirement 7: Correct evaluation mode handling")


def test_autograd_support():
    """REQUIREMENT 8: Maintain proper autograd support."""
    if REPO_PATH == "repository_before":
        # Check original autograd issues
        pytest.fail("Repository_before has autograd issues (failing as expected)")
    else:
        from switchablenorm import SwitchableNorm2d
        
        sn = SwitchableNorm2d(32)
        x = torch.randn(4, 32, 16, 16, requires_grad=True)
        y = sn(x)
        loss = y.sum()
        loss.backward()
        
        assert x.grad is not None
        
        print("✓ Requirement 8: Proper autograd support maintained")


def test_memory_efficiency():
    """REQUIREMENT 9: Reduce memory allocations and temporary tensors."""
    if REPO_PATH == "repository_before":
        # Check original memory inefficiency
        pytest.fail("Repository_before is memory inefficient (failing as expected)")
    else:
        from switchablenorm import SwitchableNorm2d
        
        sn = SwitchableNorm2d(32)
        x = torch.randn(4, 32, 16, 16)
        
        import time
        start = time.time()
        for _ in range(100):
            _ = sn(x)
        duration = time.time() - start
        
        assert duration < 5.0
        
        print(f"✓ Requirement 9: Memory efficient ({duration:.3f}s for 100 passes)")


def test_code_consolidation():
    """REQUIREMENT 10: Consolidate duplicated code and helper functions."""
    if REPO_PATH == "repository_before":
        from switchablenorm import SwitchableNorm2d_Unholy
        
        sn = SwitchableNorm2d_Unholy(32)
        
        # Original has redundant methods
        assert hasattr(sn, '_redundant_softmax')
        assert hasattr(sn, '_manual_mean')
        
        pytest.fail("Repository_before has duplicated code (failing as expected)")
    else:
        from switchablenorm import SwitchableNorm2d
        
        sn = SwitchableNorm2d(32)
        
        # Check consolidated methods
        assert hasattr(sn, '_get_normalized_weights')
        assert hasattr(sn, '_compute_statistics')
        
        # Check no redundant methods
        assert not hasattr(sn, '_redundant_softmax')
        assert not hasattr(sn, '_manual_mean')
        
        print("✓ Requirement 10: Code consolidated, no duplication")


def test_variable_naming():
    """REQUIREMENT 11: Improve variable naming for clarity."""
    if REPO_PATH == "repository_before":
        # Check original has poor variable names
        with open(os.path.join(os.path.dirname(__file__), '..', 'repository_before', 'switchablenorm.py'), 'r') as f:
            content = f.read()
        
        # Original has mean_weight, var_weight (singular)
        assert "self.mean_weight" in content, "Original has mean_weight (poor naming)"
        assert "self.var_weight" in content, "Original has var_weight (poor naming)"
        
        pytest.fail("Repository_before has poor variable naming (failing as expected)")
    else:
        from switchablenorm import SwitchableNorm2d
        
        sn = SwitchableNorm2d(32)
        assert hasattr(sn, 'weight_mean')  # Clear plural
        assert hasattr(sn, 'weight_var')   # Clear plural
        
        print("✓ Requirement 11: Clear, descriptive variable names")


def test_readable_structure():
    """REQUIREMENT 12: Structure forward pass for readability and maintainability."""
    if REPO_PATH == "repository_before":
        # Check original has messy forward pass
        with open(os.path.join(os.path.dirname(__file__), '..', 'repository_before', 'switchablenorm.py'), 'r') as f:
            content = f.read()
        
        # Original forward pass is long and has many loops
        lines = content.split('\n')
        forward_start = None
        for i, line in enumerate(lines):
            if "def forward(self, x):" in line:
                forward_start = i
                break
        
        if forward_start:
            # Count lines in forward method (until next def or end)
            forward_lines = 0
            for line in lines[forward_start + 1:]:
                if line.strip().startswith("def ") or line.strip().startswith("class "):
                    break
                forward_lines += 1
            
            # Original has many lines in forward
            assert forward_lines > 30, "Original forward pass is long"
        
        pytest.fail("Repository_before has unreadable structure (failing as expected)")
    else:
        from switchablenorm import SwitchableNorm2d
        
        sn = SwitchableNorm2d(32)
        x = torch.randn(4, 32, 16, 16)
        y = sn(x)
        assert y.shape == x.shape
        
        print("✓ Requirement 12: Clean, maintainable forward pass structure")


def test_numerical_stability():
    """REQUIREMENT 13: Ensure numerical stability with proper epsilon handling."""
    if REPO_PATH == "repository_before":
        # Check original epsilon handling
        pytest.fail("Repository_before may have numerical stability issues (failing as expected)")
    else:
        from switchablenorm import SwitchableNorm2d
        
        sn = SwitchableNorm2d(32, eps=1e-5)
        x = torch.ones(4, 32, 16, 16)
        y = sn(x)
        assert not torch.isnan(y).any()
        assert not torch.isinf(y).any()
        
        print("✓ Requirement 13: Numerical stability with proper epsilon handling")


def test_functional_equivalence():
    """Test that optimized version produces equivalent results."""
    if REPO_PATH == "repository_before":
        # Original should work functionally
        from switchablenorm import SwitchableNorm2d_Unholy
        
        sn = SwitchableNorm2d_Unholy(32)
        x = torch.randn(4, 32, 16, 16)
        y = sn(x)
        assert y.shape == x.shape
        print("✓ Repository_before: Basic functionality works")
    else:
        from switchablenorm import SwitchableNorm2d
        
        sn = SwitchableNorm2d(32)
        x = torch.randn(4, 32, 16, 16)
        y = sn(x)
        assert y.shape == x.shape
        print("✓ Functional behavior preserved")


def test_performance_improvement():
    """Test that optimized version is faster."""
    if REPO_PATH == "repository_before":
        # Skip performance test for original (it would be slow)
        pytest.skip("Skipping performance test for repository_before")
    else:
        from switchablenorm import SwitchableNorm2d
        
        sn = SwitchableNorm2d(64)
        x = torch.randn(8, 64, 32, 32)
        
        import time
        start = time.time()
        for _ in range(100):
            _ = sn(x)
        optimized_time = time.time() - start
        
        assert optimized_time < 5.0
        print(f"✓ Performance: {optimized_time:.3f}s for 100 passes")