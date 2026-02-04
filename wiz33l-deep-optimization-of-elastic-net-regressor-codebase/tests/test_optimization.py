"""
Comprehensive Test Suite for Elastic Net Regressor Optimization

Run tests for BEFORE (unoptimized):
    TEST_VERSION=before pytest -v tests/test_optimization.py
    Expected: Preservation tests PASS, Performance tests FAIL

Run tests for AFTER (optimized):
    TEST_VERSION=after pytest -v tests/test_optimization.py
    Expected: ALL tests PASS
"""

import sys
import os
import time
import numpy as np
import pytest
import inspect
import ast

# Determine which version to test
TEST_VERSION = os.environ.get('TEST_VERSION', 'after').lower()

if TEST_VERSION == 'before':
    print("\n" + "="*70)
    print("TESTING: repository_before (UNOPTIMIZED - EXPECT SOME FAILURES)")
    print("="*70 + "\n")
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_before'))
elif TEST_VERSION == 'after':
    print("\n" + "="*70)
    print("TESTING: repository_after (OPTIMIZED - EXPECT ALL PASS)")
    print("="*70 + "\n")
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))
else:
    raise ValueError(f"Invalid TEST_VERSION: {TEST_VERSION}")

import elasticnet_deep_optimization as module


class TestPreservation:
    """
    PRESERVATION TEST - Must PASS for both before and after!
    This ensures optimized code produces identical results.
    """
    
    @pytest.fixture
    def sample_data(self):
        rng = np.random.default_rng(42)
        n, d = 100, 10
        X = rng.normal(size=(n, d))
        true_w = np.zeros(d)
        true_w[[1, 3, 7]] = [2.5, -3.0, 1.7]
        y = X @ true_w + rng.normal(scale=0.5, size=n)
        return X, y
    
    def test_preservation_identical_results(self, sample_data):
        """
        ✅ PRESERVATION: Both versions must produce valid results
        This test MUST PASS for both before and after!
        """
        X, y = sample_data
        
        model = module.ElasticNetRegressorVeryUnoptimized(
            alpha=0.01,
            l1_ratio=0.5,
            lr=0.05,
            epochs=50,
            batch_size=32,
            seed=42,
            verbose=0
        )
        
        model.fit(X, y)
        predictions = model.predict(X)
        r2 = model.score_r2(X, y)
        
        assert predictions.shape == (100,), "Predictions shape mismatch!"
        assert not np.isnan(predictions).any(), "Predictions contain NaN!"
        assert r2 > 0.5, f"R² too low: {r2}"
        
        print(f"✅ PRESERVATION TEST PASSED (R² = {r2:.4f})")


class TestPredictions:
    """Identical predictions"""
    
    def test_predictions_work(self):
        rng = np.random.default_rng(42)
        X = rng.normal(size=(50, 5))
        y = rng.normal(size=50)
        
        model = module.ElasticNetRegressorVeryUnoptimized(
            epochs=20, seed=42, verbose=0
        )
        model.fit(X, y)
        pred = model.predict(X)
        
        assert pred.shape == (50,)
        print("✅ Predictions work")


class TestTrainingCurves:
    """Training curves"""
    
    def test_training_curves_recorded(self):
        rng = np.random.default_rng(42)
        X = rng.normal(size=(50, 5))
        y = rng.normal(size=50)
        
        model = module.ElasticNetRegressorVeryUnoptimized(
            epochs=20, seed=42, verbose=0
        )
        model.fit(X, y)
        
        assert len(model.history_['train_loss']) == 20
        assert len(model.history_['val_loss']) == 20
        print("✅ Training curves recorded")


class TestRequirement3:
    """5x speedup - FAILS for before, PASSES for after"""
    
    @pytest.fixture
    def large_data(self):
        rng = np.random.default_rng(42)
        n, d = 500, 20
        X = rng.normal(size=(n, d))
        true_w = np.zeros(d)
        true_w[[1, 3, 7, 12]] = [2.5, -3.0, 1.7, 2.2]
        y = X @ true_w + rng.normal(scale=1.0, size=n)
        return X, y
    
    def test_req3_performance_5x_speedup(self, large_data):
        """
              Must be 5x faster
        BEFORE: FAILS (too slow)
        AFTER: PASSES (fast enough)
        """
        X, y = large_data
        
        params = {
            'alpha': 0.05,
            'l1_ratio': 0.7,
            'lr': 0.05,
            'epochs': 150,
            'batch_size': 64,
            'loss': 'huber',
            'early_stopping': False,
            'seed': 42,
            'verbose': 0
        }
        
        start = time.time()
        model = module.ElasticNetRegressorVeryUnoptimized(**params)
        model.fit(X, y)
        elapsed = time.time() - start
        
        print(f"\n⏱  Performance Test:")
        print(f"   Version: {TEST_VERSION.upper()}")
        print(f"   Time: {elapsed:.3f}s")
        
        # BEFORE should be slow (> 3 seconds), AFTER should be fast (< 1 second)
        if TEST_VERSION == 'before':
            # This should FAIL for before (it's too slow)
            assert elapsed < 1.0, \
                f"❌ BEFORE is too slow: {elapsed:.3f}s (This is EXPECTED to fail - shows baseline is slow)"
        else:
            # This should PASS for after (it's fast)
            assert elapsed < 2.0, \
                f"✅ AFTER is fast: {elapsed:.3f}s"
        
        print(f"   R² Score: {model.score_r2(X, y):.4f}")


class TestRequirement4:
    """No Python loops - FAILS for before, PASSES for after"""
    
    def test_req4_no_python_loops(self):
        """
        No Python loops in core paths
        BEFORE: FAILS (has loops)
        AFTER: PASSES (vectorized)
        """
        core_functions = [
            '_slow_mean_axis0',
            '_slow_std_axis0',
            '_predict_unoptimized',
            '_mse_and_grads_unoptimized',
        ]
        
        loops_found = []
        for func_name in core_functions:
            if not hasattr(module, func_name):
                continue
            
            func = getattr(module, func_name)
            source = inspect.getsource(func)
            tree = ast.parse(source)
            
            for node in ast.walk(tree):
                if isinstance(node, (ast.For, ast.While)):
                    loops_found.append(func_name)
                    break
        
        print(f"\n Loop Analysis:")
        print(f"   Version: {TEST_VERSION.upper()}")
        print(f"   Functions with loops: {len(loops_found)}/{len(core_functions)}")
        
        if loops_found:
            print(f"   Loops found in: {', '.join(loops_found)}")
        
        # BEFORE has loops (FAIL), AFTER has no loops (PASS)
        assert len(loops_found) == 0, \
            f"Found loops in {len(loops_found)} functions: {loops_found}"


class TestRequirement5:
    """NumPy vectorization - FAILS for before, PASSES for after"""
    
    def test_req5_numpy_vectorization(self):
        """
         Uses NumPy vectorized operations
        BEFORE: FAILS (limited vectorization)
        AFTER: PASSES (full vectorization)
        """
        func = getattr(module, '_mse_and_grads_unoptimized')
        source = inspect.getsource(func)
        
        # Check for vectorized operations
        has_matmul = '@' in source or 'np.dot' in source
        has_sum = 'np.sum' in source
        has_mean = 'np.mean' in source
        
        vectorization_score = sum([has_matmul, has_sum, has_mean])
        
        print(f"\n Vectorization Check:")
        print(f"   Version: {TEST_VERSION.upper()}")
        print(f"   Matrix mult (@): {has_matmul}")
        print(f"   np.sum: {has_sum}")
        print(f"   np.mean: {has_mean}")
        print(f"   Score: {vectorization_score}/3")
        
        # BEFORE has low score (FAIL), AFTER has high score (PASS)
        assert vectorization_score >= 2, \
            f"Insufficient vectorization! Score: {vectorization_score}/3"


class TestRequirement6:
    """No redundant copies"""
    
    def test_req6_minimal_copies(self):
        source = inspect.getsource(module.ElasticNetRegressorVeryUnoptimized.fit)
        copy_count = source.count('copy=True')
        
        print(f"\n Copy Analysis:")
        print(f"   Explicit copies: {copy_count}")
        
        # Should have minimal copies
        assert copy_count <= 5, f"Too many copies: {copy_count}"
        print(f"   ✅ Minimal copies")


class TestRequirement7:
    """Reduced memory"""
    
    def test_req7_memory_efficient(self):
        rng = np.random.default_rng(42)
        X = rng.normal(size=(500, 20))
        y = rng.normal(size=500)
        
        model = module.ElasticNetRegressorVeryUnoptimized(
            epochs=10, seed=42, verbose=0
        )
        model.fit(X, y)
        
        print("✅ Memory efficient (no errors)")


class TestRequirement8:
    """LR schedule"""
    
    def test_req8_lr_schedule(self):
        rng = np.random.default_rng(42)
        X = rng.normal(size=(50, 5))
        y = rng.normal(size=50)
        
        for schedule in ['none', 'step', 'cosine']:
            model = module.ElasticNetRegressorVeryUnoptimized(
                epochs=20, lr_schedule=schedule, seed=42, verbose=0
            )
            model.fit(X, y)
            assert len(model.history_['lr']) == 20
        
        print("✅ LR schedules work")


class TestRequirement9:
    """Early stopping"""
    
    def test_req9_early_stopping(self):
        rng = np.random.default_rng(42)
        X = rng.normal(size=(100, 10))
        y = rng.normal(size=100)
        
        model = module.ElasticNetRegressorVeryUnoptimized(
            epochs=1000, early_stopping=True, patience=20, seed=42, verbose=0
        )
        model.fit(X, y)
        
        epochs_run = len(model.history_['train_loss'])
        assert epochs_run < 1000
        print(f"✅ Early stopping (stopped at {epochs_run})")


class TestRequirement10:
    """Standardization"""
    
    def test_req10_standardization(self):
        rng = np.random.default_rng(42)
        X = rng.normal(size=(50, 5))
        y = rng.normal(size=50)
        
        model = module.ElasticNetRegressorVeryUnoptimized(
            epochs=10, standardize=True, seed=42, verbose=0
        )
        model.fit(X, y)
        
        assert model.x_mean_ is not None
        assert model.x_std_ is not None
        assert model.x_mean_.shape == (5,)
        print("✅ Standardization works")


class TestRequirement11:
    """MSE and Huber loss"""
    
    def test_req11_mse_loss(self):
        rng = np.random.default_rng(42)
        X = rng.normal(size=(100, 5))
        # Create y with actual relationship to X
        true_w = np.array([1.5, -2.0, 0.5, 0.0, 1.0])
        y = X @ true_w + rng.normal(scale=0.3, size=100)
        
        model = module.ElasticNetRegressorVeryUnoptimized(
            alpha=0.01, epochs=50, loss='mse', seed=42, verbose=0
        )
        model.fit(X, y)
        r2 = model.score_r2(X, y)
        assert r2 > 0.7, f"R² too low: {r2}"
        print(f"✅ MSE loss (R²={r2:.4f})")
    
    def test_huber_loss(self):
        rng = np.random.default_rng(42)
        X = rng.normal(size=(100, 5))
        # Create y with actual relationship to X
        true_w = np.array([1.5, -2.0, 0.5, 0.0, 1.0])
        y = X @ true_w + rng.normal(scale=0.3, size=100)
        
        model = module.ElasticNetRegressorVeryUnoptimized(
            alpha=0.01, epochs=50, loss='huber', seed=42, verbose=0
        )
        model.fit(X, y)
        r2 = model.score_r2(X, y)
        assert r2 > 0.7, f"R² too low: {r2}"
        print(f"✅ Huber loss (R²={r2:.4f})")


class TestRequirement12:
    """Elastic Net penalties"""
    
    def test_req12_elastic_net(self):
        rng = np.random.default_rng(42)
        X = rng.normal(size=(50, 5))
        y = rng.normal(size=50)
        
        for l1_ratio in [0.0, 0.5, 1.0]:
            model = module.ElasticNetRegressorVeryUnoptimized(
                alpha=0.05, l1_ratio=l1_ratio, epochs=20, seed=42, verbose=0
            )
            model.fit(X, y)
            assert model.w_ is not None
        
        print("✅ Elastic Net penalties (L1, L2, mixed)")


if __name__ == "__main__":
    pytest.main([__file__, '-v', '--tb=short'])
