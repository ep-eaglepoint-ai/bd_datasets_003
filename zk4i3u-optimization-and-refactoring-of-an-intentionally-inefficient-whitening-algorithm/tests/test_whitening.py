import ast
import importlib.util
import os
import sys
from pathlib import Path

import numpy as np


def _repo_under_test() -> Path:
    repo = os.environ.get("REPO_UNDER_TEST", "repository_before")
    return Path(__file__).resolve().parents[1] / repo


def _load_module():
    repo = _repo_under_test()
    module_path = repo / "pca_zca_whitening.py"
    spec = importlib.util.spec_from_file_location("pca_zca_whitening", module_path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules["pca_zca_whitening"] = module
    spec.loader.exec_module(module)
    return module, module_path


def _deterministic_data():
    rng = np.random.default_rng(42)
    # Generate full rank data: 2000 samples, 6 features.
    X = rng.standard_normal((2000, 6))
    # Mix it to introduce covariance
    A = rng.standard_normal((6, 6))
    return X @ A


def test_public_api_exists():
    module, _ = _load_module()
    assert hasattr(module, "Whitener")
    assert hasattr(module, "WhiteningParams")
    for name in ("fit", "transform", "inverse_transform", "fit_transform", "diagnostics"):
        assert hasattr(module.Whitener, name)


def test_keep_dims_output_dim():
    module, _ = _load_module()
    X = _deterministic_data()
    whitener = module.Whitener(method="pca", keep_dims=4)
    Xw = whitener.fit_transform(X)
    assert Xw.shape == (X.shape[0], 4)


def test_pca_whiten_covariance_close_to_identity():
    module, _ = _load_module()
    X = _deterministic_data()
    # Use shrinkage=0.0 to strictly test the unit-variance property.
    # With shrinkage > 0, the output covariance variance is approx 1/(1-shrinkage) != 1.
    whitener = module.Whitener(method="pca", eps=1e-5, shrinkage=0.0, keep_dims=None)
    Xw = whitener.fit_transform(X)
    cov = np.cov(Xw, rowvar=False, bias=False)
    assert np.allclose(cov, np.eye(cov.shape[0]), atol=1e-2, rtol=1e-2)


def test_zca_preserves_orientation_dimension():
    module, _ = _load_module()
    X = _deterministic_data()
    whitener = module.Whitener(method="zca", eps=1e-5, shrinkage=0.01, keep_dims=None)
    Xw = whitener.fit_transform(X)
    assert Xw.shape == X.shape


def test_inverse_transform_reconstruction_full_rank():
    module, _ = _load_module()
    X = _deterministic_data()
    whitener = module.Whitener(method="pca", eps=1e-5, shrinkage=0.0, keep_dims=None)
    Xw = whitener.fit_transform(X)
    Xrec = whitener.inverse_transform(Xw)
    assert np.allclose(Xrec, X, atol=1e-6, rtol=1e-6)


def test_eps_and_shrinkage_affect_solution():
    module, _ = _load_module()
    X = _deterministic_data()
    base = module.Whitener(method="pca", eps=1e-5, shrinkage=0.0, keep_dims=None).fit(X)
    eps = module.Whitener(method="pca", eps=1e-1, shrinkage=0.0, keep_dims=None).fit(X)
    shr = module.Whitener(method="pca", eps=1e-5, shrinkage=0.2, keep_dims=None).fit(X)
    assert not np.allclose(base.params.W_, eps.params.W_)
    assert not np.allclose(base.params.W_, shr.params.W_)


def test_diagnostics_keys_and_types():
    module, _ = _load_module()
    X = _deterministic_data()
    whitener = module.Whitener(method="zca", eps=1e-5, shrinkage=0.01, keep_dims=None)
    diag = whitener.fit(X).diagnostics(X)
    for key in (
        "whitened_mean_l2",
        "cov_frobenius_error",
        "cov_max_abs_error",
        "output_dim",
        "cov_trace",
    ):
        assert key in diag


def test_no_python_loops_in_core_paths():
    module, module_path = _load_module()
    tree = ast.parse(Path(module_path).read_text())

    def _has_loops(node: ast.AST) -> bool:
        return any(isinstance(n, (ast.For, ast.While)) for n in ast.walk(node))

    forbidden_nodes = []
    for node in tree.body:
        if isinstance(node, ast.FunctionDef):
            if _has_loops(node):
                forbidden_nodes.append(node.name)
        if isinstance(node, ast.ClassDef) and node.name == "Whitener":
            for child in node.body:
                if isinstance(child, ast.FunctionDef) and _has_loops(child):
                    forbidden_nodes.append(f"Whitener.{child.name}")
        if isinstance(node, (ast.For, ast.While)):
            forbidden_nodes.append("module")

    assert not forbidden_nodes, f"Loops found in: {forbidden_nodes}"


def test_zca_whitening_matrix_is_symmetric():
    """
    Requirement 8: ZCA whitening preserves original feature orientation.
    Mathematically, the ZCA whitening matrix W must be symmetric (W = W.T).
    PCA whitening matrix is generally not symmetric.
    """
    module, _ = _load_module()
    X = _deterministic_data()
    whitener = module.Whitener(method="zca", eps=1e-5, shrinkage=0.0, keep_dims=None)
    whitener.fit(X)
    W = whitener.params.W_
    assert np.allclose(W, W.T, atol=1e-8), "ZCA Whiten Matrix should be symmetric"


def test_performance_large_dataset():
    """
    Requirement 5: Runtime performance improves measurably on large datasets.
    We assert that fitting and transforming 10,000 samples takes less than 1 second.
    The 'before' implementation is expected to take significantly longer (e.g., >10s).
    """
    import time
    module, _ = _load_module()
    
    # n=10000, d=6 as per requirement benchmark suggestion
    rng = np.random.default_rng(42)
    X = rng.standard_normal((10000, 6))
    
    start_time = time.perf_counter()
    whitener = module.Whitener(method="zca")
    whitener.fit_transform(X)
    duration = time.perf_counter() - start_time
    
    # Threshold chosen to represent "efficient" vectorized implementation.
    # Unoptimized python loops would likely take 5-20 seconds.
    assert duration < 1.0, f"Performance too slow: {duration:.4f}s (Expected < 1.0s)"
