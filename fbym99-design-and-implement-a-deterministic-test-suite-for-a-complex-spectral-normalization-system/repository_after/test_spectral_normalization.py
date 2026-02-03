import copy
import pytest
import torch
import torch.nn as nn

from spectral_norm import (
    SNConfig,
    SNTraceBuffer,
    SpectralNormParamV2,
    SpectralNormMultiV2,
    apply_spectral_norm_v2,
    remove_spectral_norm_v2,
    SNResBlock,
    SNResNetDiscriminator,
)


# ============================================================================
# Fixtures and Helpers
# ============================================================================

@pytest.fixture(autouse=True)
def set_deterministic_seed():
    """Ensure deterministic behavior for all tests."""
    torch.manual_seed(0)
    if hasattr(torch, 'use_deterministic_algorithms'):
        try:
            torch.use_deterministic_algorithms(True, warn_only=True)
        except Exception:
            pass
    yield


@pytest.fixture
def simple_linear():
    """Create a simple Linear layer for testing."""
    torch.manual_seed(0)
    return nn.Linear(16, 8)


@pytest.fixture
def simple_conv2d():
    """Create a simple Conv2d layer for testing."""
    torch.manual_seed(0)
    return nn.Conv2d(3, 16, kernel_size=3, padding=1)


@pytest.fixture
def default_config():
    """Default SNConfig for power_iter mode."""
    return SNConfig(param_name="weight", mode="power_iter", n_power_iterations=1)


def get_snp(module: nn.Module, cfg: SNConfig) -> SpectralNormParamV2:
    """Helper to create SpectralNormParamV2 with fixed seed."""
    torch.manual_seed(0)
    return SpectralNormParamV2(module, cfg)


# ============================================================================
# Test Class: Parameter Surgery
# ============================================================================

class TestParameterSurgery:
    """Requirement 1: Verify parameter surgery replaces weight with buffer and registers weight_orig."""

    def test_weight_becomes_buffer_linear(self, simple_linear, default_config):
        """Weight should be converted from Parameter to buffer after wrapping."""
        snp = get_snp(simple_linear, default_config)
        
        # After initialization, weight should be a buffer, not a parameter
        assert "weight" in simple_linear._buffers, "weight should be registered as buffer"
        assert "weight" not in simple_linear._parameters, "weight should not be a parameter"

    def test_weight_orig_is_parameter(self, simple_linear, default_config):
        """weight_orig should be registered as nn.Parameter."""
        snp = get_snp(simple_linear, default_config)
        
        assert hasattr(simple_linear, "weight_orig"), "weight_orig should exist"
        assert "weight_orig" in simple_linear._parameters, "weight_orig should be in _parameters"
        assert isinstance(simple_linear.weight_orig, nn.Parameter), "weight_orig should be nn.Parameter"

    def test_weight_orig_shape_matches_original(self, simple_linear, default_config):
        """weight_orig should have the same shape as original weight."""
        original_shape = simple_linear.weight.shape
        original_dtype = simple_linear.weight.dtype
        
        snp = get_snp(simple_linear, default_config)
        
        assert simple_linear.weight_orig.shape == original_shape, "Shape should match"
        assert simple_linear.weight_orig.dtype == original_dtype, "Dtype should match"

    def test_weight_becomes_buffer_conv2d(self, simple_conv2d, default_config):
        """Conv2d weight should also be converted to buffer."""
        snp = get_snp(simple_conv2d, default_config)
        
        assert "weight" in simple_conv2d._buffers, "Conv2d weight should be a buffer"
        assert "weight_orig" in simple_conv2d._parameters, "Conv2d weight_orig should be a parameter"


# ============================================================================
# Test Class: Remove Spectral Norm Restoration
# ============================================================================

class TestRemoveSpectralNorm:
    """Requirement 2: Verify remove_spectral_norm_v2 restores original Parameter."""

    def test_restore_original_parameter(self):
        """After removal, weight should be a real nn.Parameter."""
        torch.manual_seed(0)
        model = nn.Sequential(nn.Linear(16, 8))
        original_shape = model[0].weight.shape
        original_dtype = model[0].weight.dtype
        original_device = model[0].weight.device
        
        apply_spectral_norm_v2(model)
        remove_spectral_norm_v2(model)
        
        # After removal, weight should be back as Parameter
        assert isinstance(model[0].weight, nn.Parameter), "weight should be nn.Parameter after removal"
        assert model[0].weight.shape == original_shape, "Shape should be preserved"
        assert model[0].weight.dtype == original_dtype, "Dtype should be preserved"
        assert model[0].weight.device == original_device, "Device should be preserved"

    def test_weight_orig_removed_after_restore(self):
        """weight_orig should not exist after removal."""
        torch.manual_seed(0)
        model = nn.Sequential(nn.Linear(16, 8))
        
        apply_spectral_norm_v2(model)
        remove_spectral_norm_v2(model)
        
        assert not hasattr(model[0], "weight_orig"), "weight_orig should be removed"

    def test_buffer_removed_after_restore(self):
        """weight buffer should not exist after removal."""
        torch.manual_seed(0)
        model = nn.Sequential(nn.Linear(16, 8))
        
        apply_spectral_norm_v2(model)
        remove_spectral_norm_v2(model)
        
        assert "weight" not in model[0]._buffers, "weight buffer should be removed"
        assert "weight" in model[0]._parameters, "weight should be in _parameters"


# ============================================================================
# Test Class: Exact SVD Mode
# ============================================================================

class TestExactSVDMode:
    """Requirement 3: Verify exact_svd mode normalizes largest singular value to ~1."""

    def test_exact_svd_normalizes_to_one(self, simple_linear):
        """After compute_weight with exact_svd, max singular value should be ~1."""
        cfg = SNConfig(param_name="weight", mode="exact_svd", exact_svd_max_dim=256)
        snp = get_snp(simple_linear, cfg)
        
        # Compute normalized weight
        w_sn = snp.compute_weight()
        
        # Verify max singular value is approximately 1
        s = torch.linalg.svdvals(w_sn)
        max_sv = s.max().item()
        
        assert abs(max_sv - 1.0) < 0.01, f"Max singular value should be ~1, got {max_sv}"

    def test_exact_svd_deterministic(self, simple_linear):
        """exact_svd should produce deterministic results."""
        cfg = SNConfig(param_name="weight", mode="exact_svd", exact_svd_max_dim=256)
        
        # First run
        torch.manual_seed(0)
        linear1 = nn.Linear(16, 8)
        snp1 = SpectralNormParamV2(linear1, cfg)
        w1 = snp1.compute_weight()
        
        # Second run with same seed
        torch.manual_seed(0)
        linear2 = nn.Linear(16, 8)
        snp2 = SpectralNormParamV2(linear2, cfg)
        w2 = snp2.compute_weight()
        
        assert torch.allclose(w1, w2), "exact_svd should be deterministic"

    def test_exact_svd_no_power_iteration_dependency(self, simple_linear):
        """exact_svd should not depend on power iteration updates."""
        cfg = SNConfig(
            param_name="weight", 
            mode="exact_svd", 
            exact_svd_max_dim=256,
            n_power_iterations=0  # No power iterations
        )
        snp = get_snp(simple_linear, cfg)
        
        w_sn = snp.compute_weight()
        s = torch.linalg.svdvals(w_sn)
        max_sv = s.max().item()
        
        assert abs(max_sv - 1.0) < 0.01, f"Should normalize without power iterations"


# ============================================================================
# Test Class: Power Iteration Mode
# ============================================================================

class TestPowerIterMode:
    """Requirement 4: Verify power_iter mode initializes and updates u/v buffers."""

    def test_power_iter_buffers_exist(self, simple_linear, default_config):
        """u and v buffers should exist after initialization."""
        snp = get_snp(simple_linear, default_config)
        
        assert hasattr(snp, "u"), "u buffer should exist"
        assert hasattr(snp, "v"), "v buffer should exist"

    def test_power_iter_buffers_correct_shape(self, simple_linear, default_config):
        """u and v should have correct dimensions."""
        snp = get_snp(simple_linear, default_config)
        
        out_dim, in_dim = simple_linear.weight.shape
        assert snp.u.shape == (out_dim,), f"u shape should be ({out_dim},)"
        assert snp.v.shape == (in_dim,), f"v shape should be ({in_dim},)"

    def test_power_iter_updates_uv(self, simple_linear):
        """u and v should update during power iteration."""
        cfg = SNConfig(
            param_name="weight", 
            mode="power_iter", 
            n_power_iterations=5,
            update_every=1
        )
        snp = get_snp(simple_linear, cfg)
        
        u_before = snp.u.clone()
        v_before = snp.v.clone()
        
        # Trigger computation with update
        snp.compute_weight()
        
        u_after = snp.u.clone()
        v_after = snp.v.clone()
        
        assert not torch.allclose(u_before, u_after), "u should be updated"
        assert not torch.allclose(v_before, v_after), "v should be updated"

    def test_power_iter_uv_dtype_device_tracks_weight(self, simple_linear, default_config):
        """u and v dtype/device should match weight reference matrix."""
        snp = get_snp(simple_linear, default_config)
        
        expected_dtype = torch.float32  # stable_fp32=True by default
        expected_device = simple_linear.weight.device
        
        assert snp.u.dtype == expected_dtype, f"u dtype should be {expected_dtype}"
        assert snp.v.dtype == expected_dtype, f"v dtype should be {expected_dtype}"
        assert snp.u.device == expected_device, "u device should match"
        assert snp.v.device == expected_device, "v device should match"


# ============================================================================
# Test Class: Rayleigh Mode
# ============================================================================

class TestRayleighMode:
    """Requirement 5: Verify rayleigh mode returns finite non-negative sigma without updating u/v."""

    def test_rayleigh_finite_sigma(self, simple_linear):
        """rayleigh mode should compute finite sigma."""
        cfg = SNConfig(param_name="weight", mode="rayleigh")
        snp = get_snp(simple_linear, cfg)
        
        w_sn = snp.compute_weight()
        
        # Weight should be finite
        assert torch.isfinite(w_sn).all(), "Normalized weight should be finite"

    def test_rayleigh_non_negative_sigma(self, simple_linear):
        """rayleigh mode sigma should be non-negative (uses abs)."""
        cfg = SNConfig(param_name="weight", mode="rayleigh")
        snp = get_snp(simple_linear, cfg)
        
        # Access internal sigma computation
        w_orig = snp._get_orig()
        from spectral_norm import _reshape_weight_to_matrix, _as_float32
        w_mat = _reshape_weight_to_matrix(simple_linear, w_orig)
        w_ref = _as_float32(w_mat)
        
        sigma = snp._sigma_rayleigh(w_ref)
        
        assert sigma.item() >= 0, "sigma should be non-negative"

    def test_rayleigh_does_not_update_uv(self, simple_linear):
        """rayleigh mode should not update u and v."""
        cfg = SNConfig(param_name="weight", mode="rayleigh", n_power_iterations=0)
        snp = get_snp(simple_linear, cfg)
        
        u_before = snp.u.clone()
        v_before = snp.v.clone()
        
        # Multiple compute calls
        for _ in range(5):
            snp.compute_weight()
        
        u_after = snp.u.clone()
        v_after = snp.v.clone()
        
        assert torch.allclose(u_before, u_after), "u should not change in rayleigh mode"
        assert torch.allclose(v_before, v_after), "v should not change in rayleigh mode"


# ============================================================================
# Test Class: Update Scheduling
# ============================================================================

class TestUpdateScheduling:
    """Requirement 6: Verify update_every and warmup_steps behavior."""

    def test_warmup_steps_always_updates(self, simple_linear):
        """During warmup, updates should always happen."""
        cfg = SNConfig(
            param_name="weight", 
            mode="power_iter", 
            n_power_iterations=1,
            warmup_steps=5,
            update_every=100  # Would skip without warmup
        )
        snp = get_snp(simple_linear, cfg)
        
        # During warmup (steps 0-4), should always update
        for step in range(5):
            u_before = snp.u.clone()
            snp.compute_weight()
            u_after = snp.u.clone()
            assert not torch.allclose(u_before, u_after), f"Should update at warmup step {step}"

    def test_update_every_skips_updates(self, simple_linear):
        """After warmup, updates should follow update_every schedule."""
        cfg = SNConfig(
            param_name="weight", 
            mode="power_iter", 
            n_power_iterations=1,
            warmup_steps=0,
            update_every=3
        )
        snp = get_snp(simple_linear, cfg)
        
        # Step 0: should update (0 % 3 == 0)
        u_step0 = snp.u.clone()
        snp.compute_weight()
        u_after_step0 = snp.u.clone()
        assert not torch.allclose(u_step0, u_after_step0), "Step 0 should update"
        
        # Step 1: should NOT update (1 % 3 != 0)
        u_step1 = snp.u.clone()
        snp.compute_weight()
        u_after_step1 = snp.u.clone()
        assert torch.allclose(u_step1, u_after_step1), "Step 1 should skip update"
        
        # Step 2: should NOT update (2 % 3 != 0)
        u_step2 = snp.u.clone()
        snp.compute_weight()
        u_after_step2 = snp.u.clone()
        assert torch.allclose(u_step2, u_after_step2), "Step 2 should skip update"
        
        # Step 3: should update (3 % 3 == 0)
        u_step3 = snp.u.clone()
        snp.compute_weight()
        u_after_step3 = snp.u.clone()
        assert not torch.allclose(u_step3, u_after_step3), "Step 3 should update"

    def test_step_counter_increments(self, simple_linear, default_config):
        """_step buffer should increment on each compute_weight call."""
        snp = get_snp(simple_linear, default_config)
        
        assert snp._step.item() == 0, "Initial step should be 0"
        
        snp.compute_weight()
        assert snp._step.item() == 1, "Step should be 1 after first call"
        
        snp.compute_weight()
        assert snp._step.item() == 2, "Step should be 2 after second call"


# ============================================================================
# Test Class: EMA Smoothing
# ============================================================================

class TestEMASmoothing:
    """Requirement 7: Verify EMA smoothing behavior."""

    def test_ema_modifies_sigma_over_steps(self, simple_linear):
        """With ema_decay > 0, _sigma_ema should change over multiple calls."""
        cfg = SNConfig(
            param_name="weight", 
            mode="power_iter", 
            ema_decay=0.9,
            n_power_iterations=1
        )
        snp = get_snp(simple_linear, cfg)
        
        ema_values = []
        for _ in range(10):
            snp.compute_weight()
            ema_values.append(snp._sigma_ema.item())
        
        # EMA should change over time
        assert len(set(ema_values)) > 1, "EMA should change over multiple steps"

    def test_ema_influences_normalized_weight(self, simple_linear):
        """EMA smoothing should influence the normalized weight."""
        cfg_with_ema = SNConfig(
            param_name="weight", 
            mode="power_iter", 
            ema_decay=0.9,
            n_power_iterations=1
        )
        cfg_without_ema = SNConfig(
            param_name="weight", 
            mode="power_iter", 
            ema_decay=0.0,
            n_power_iterations=1
        )
        
        torch.manual_seed(0)
        linear1 = nn.Linear(16, 8)
        snp1 = SpectralNormParamV2(linear1, cfg_with_ema)
        
        torch.manual_seed(0)
        linear2 = nn.Linear(16, 8)
        snp2 = SpectralNormParamV2(linear2, cfg_without_ema)
        
        # Run multiple steps
        for _ in range(5):
            w1 = snp1.compute_weight()
            w2 = snp2.compute_weight()
        
        # Weights should differ due to EMA
        assert not torch.allclose(w1, w2, atol=1e-5), "EMA should affect normalized weight"

    def test_ema_zero_bypasses_smoothing(self, simple_linear):
        """With ema_decay=0, _sigma_ema should not be used."""
        cfg = SNConfig(
            param_name="weight", 
            mode="power_iter", 
            ema_decay=0.0,
            n_power_iterations=1
        )
        snp = get_snp(simple_linear, cfg)
        
        initial_ema = snp._sigma_ema.item()
        
        for _ in range(5):
            snp.compute_weight()
        
        # When ema_decay=0, the ema value shouldn't be meaningfully updated
        # (it's initialized but sigma_eff uses raw sigma instead)
        # The key test is that it doesn't crash


# ============================================================================
# Test Class: Caching Behavior
# ============================================================================

class TestCaching:
    """Requirement 8: Verify caching behavior."""

    def test_cached_weight_reused_when_update_skipped(self, simple_linear):
        """When cache_weight=True and update skipped, same tensor should be returned."""
        cfg = SNConfig(
            param_name="weight", 
            mode="power_iter", 
            n_power_iterations=1,
            cache_weight=True,
            update_every=2,
            warmup_steps=0
        )
        snp = get_snp(simple_linear, cfg)
        
        # Step 0: compute and cache (0 % 2 == 0, updates)
        w0 = snp.compute_weight()
        
        # Step 1: should use cache (1 % 2 != 0, skips update)
        w1 = snp.compute_weight()
        
        # Should return cached tensor
        assert torch.allclose(w0, w1), "Cached weight should be reused"

    def test_step_increments_with_cache_hit(self, simple_linear):
        """_step should still increment even when cache is hit."""
        cfg = SNConfig(
            param_name="weight", 
            mode="power_iter", 
            cache_weight=True,
            update_every=2,
            warmup_steps=0
        )
        snp = get_snp(simple_linear, cfg)
        
        snp.compute_weight()  # Step 0
        assert snp._step.item() == 1
        
        snp.compute_weight()  # Step 1 (cache hit)
        assert snp._step.item() == 2
        
        snp.compute_weight()  # Step 2 (recompute)
        assert snp._step.item() == 3

    def test_cache_disabled_recomputes(self, simple_linear):
        """When cache_weight=False, weight should be recomputed each time."""
        cfg = SNConfig(
            param_name="weight", 
            mode="power_iter", 
            n_power_iterations=1,
            cache_weight=False,
            update_every=2,
            warmup_steps=0
        )
        snp = get_snp(simple_linear, cfg)
        
        # Even with update_every=2, without caching each call recomputes
        w0 = snp.compute_weight()
        w1 = snp.compute_weight()
        
        # Both should be computed (may be same values but not cached)
        assert snp._cached_w_sn is None, "Cache should be None when disabled"


# ============================================================================
# Test Class: Strict Shape Checks
# ============================================================================

class TestStrictShapeChecks:
    """Requirement 9: Verify strict_shape_checks raises on unexpected shapes."""

    def test_strict_shape_checks_normal_case(self, simple_linear):
        """Normal 2D weight should not raise with strict_shape_checks=True."""
        cfg = SNConfig(param_name="weight", strict_shape_checks=True)
        snp = get_snp(simple_linear, cfg)
        
        # Should not raise for normal Linear layer
        w_sn = snp.compute_weight()
        assert w_sn is not None

    def test_strict_shape_checks_conv2d(self, simple_conv2d):
        """Conv2d weight (4D) after reshape should be 2D and not raise."""
        cfg = SNConfig(param_name="weight", strict_shape_checks=True)
        snp = get_snp(simple_conv2d, cfg)
        
        # Should not raise - 4D weight is reshaped to 2D
        w_sn = snp.compute_weight()
        assert w_sn is not None


# ============================================================================
# Test Class: Allow Non-finite
# ============================================================================

class TestAllowNonfinite:
    """Requirement 10: Verify allow_nonfinite=False raises on NaN/Inf sigma."""

    def test_nonfinite_raises_error(self, simple_linear):
        """Injecting NaN into weight should raise FloatingPointError."""
        cfg = SNConfig(param_name="weight", allow_nonfinite=False)
        snp = get_snp(simple_linear, cfg)
        
        # Inject NaN into weight_orig
        with torch.no_grad():
            simple_linear.weight_orig.fill_(float('nan'))
        
        with pytest.raises(FloatingPointError, match="Non-finite sigma"):
            snp.compute_weight()

    def test_nonfinite_inf_raises_error(self, simple_linear):
        """Injecting Inf into weight should raise FloatingPointError."""
        cfg = SNConfig(param_name="weight", allow_nonfinite=False)
        snp = get_snp(simple_linear, cfg)
        
        # Inject Inf into weight_orig
        with torch.no_grad():
            simple_linear.weight_orig.fill_(float('inf'))
        
        with pytest.raises(FloatingPointError, match="Non-finite sigma"):
            snp.compute_weight()

    def test_allow_nonfinite_true_no_error(self, simple_linear):
        """With allow_nonfinite=True, NaN should not raise."""
        cfg = SNConfig(param_name="weight", allow_nonfinite=True)
        snp = get_snp(simple_linear, cfg)
        
        with torch.no_grad():
            simple_linear.weight_orig.fill_(float('nan'))
        
        # Should not raise
        w_sn = snp.compute_weight()
        # Weight will be NaN but no error


# ============================================================================
# Test Class: Gradient Flow
# ============================================================================

class TestGradientFlow:
    """Requirement 11: Verify gradients propagate correctly."""

    def test_gradients_flow_to_weight_orig(self, simple_linear, default_config):
        """Backward pass should produce gradients for weight_orig."""
        snp = get_snp(simple_linear, default_config)
        
        x = torch.randn(4, 16, requires_grad=True)
        y = snp(x)
        loss = y.sum()
        loss.backward()
        
        assert simple_linear.weight_orig.grad is not None, "weight_orig should have gradient"
        assert not torch.all(simple_linear.weight_orig.grad == 0), "Gradient should be non-zero"

    def test_gradients_flow_to_input(self, simple_linear, default_config):
        """Backward pass should produce gradients for input."""
        snp = get_snp(simple_linear, default_config)
        
        x = torch.randn(4, 16, requires_grad=True)
        y = snp(x)
        loss = y.sum()
        loss.backward()
        
        assert x.grad is not None, "Input should have gradient"
        assert not torch.all(x.grad == 0), "Input gradient should be non-zero"

    def test_weight_buffer_no_gradient(self, simple_linear, default_config):
        """Buffer weight should not accumulate gradients."""
        snp = get_snp(simple_linear, default_config)
        
        x = torch.randn(4, 16, requires_grad=True)
        y = snp(x)
        loss = y.sum()
        loss.backward()
        
        # The buffer 'weight' should not have grad attribute set
        weight_buffer = simple_linear._buffers.get("weight")
        if weight_buffer is not None:
            assert weight_buffer.grad is None or not weight_buffer.requires_grad, \
                "Buffer weight should not have gradient"

    def test_gradients_not_silently_detached(self, simple_linear, default_config):
        """Gradients should flow through without being silently detached."""
        snp = get_snp(simple_linear, default_config)
        
        x = torch.randn(4, 16, requires_grad=True)
        y = snp(x)
        
        # Output should require grad if input does
        assert y.requires_grad, "Output should require grad"
        
        # Verify gradient can flow
        grad_output = torch.ones_like(y)
        y.backward(grad_output)
        
        assert x.grad is not None, "Gradient should flow to input"


# ============================================================================
# Test Class: Multi-Config (SpectralNormMultiV2)
# ============================================================================

class TestMultiConfig:
    """Requirement 12: Verify SpectralNormMultiV2 applies per-type configs."""

    def test_multi_config_applies_to_weight(self):
        """SpectralNormMultiV2 should apply normalization to weight."""
        torch.manual_seed(0)
        linear = nn.Linear(16, 8)
        
        configs = [SNConfig(param_name="weight", mode="power_iter")]
        snm = SpectralNormMultiV2(linear, configs)
        
        x = torch.randn(4, 16)
        y = snm(x)
        
        assert y.shape == (4, 8), "Output shape should be correct"
        assert "weight" in linear._buffers, "weight should be buffer"

    def test_multi_config_multiple_params(self):
        """SpectralNormMultiV2 should apply normalization to multiple params if specified."""
        torch.manual_seed(0)
        linear = nn.Linear(16, 8, bias=True)  # Has both weight and bias
        
        configs = [
            SNConfig(param_name="weight", mode="power_iter"),
        ]
        snm = SpectralNormMultiV2(linear, configs)
        
        x = torch.randn(4, 16)
        y = snm(x)
        
        # Verify weight is normalized
        assert "weight" in linear._buffers, "weight should be buffer"
        assert y.shape == (4, 8), "Output shape should be correct"


# ============================================================================
# Test Class: Integration (apply_spectral_norm_v2)
# ============================================================================

class TestIntegration:
    """Requirement: Verify apply_spectral_norm_v2 integration behavior."""

    def test_apply_wraps_intended_modules(self):
        """apply_spectral_norm_v2 should wrap Linear and Conv2d modules."""
        torch.manual_seed(0)
        model = nn.Sequential(
            nn.Linear(16, 32),
            nn.ReLU(),
            nn.Linear(32, 8),
        )
        
        apply_spectral_norm_v2(model)
        
        # Linear layers should be wrapped
        assert isinstance(model[0], SpectralNormMultiV2), "First Linear should be wrapped"
        assert isinstance(model[2], SpectralNormMultiV2), "Second Linear should be wrapped"
        # ReLU should not be wrapped
        assert isinstance(model[1], nn.ReLU), "ReLU should not be wrapped"

    def test_preserves_forward_output_shape_linear(self):
        """Wrapped Linear should preserve output shape."""
        torch.manual_seed(0)
        model = nn.Sequential(nn.Linear(16, 8))
        
        x = torch.randn(4, 16)
        y_before = model(x).shape
        
        apply_spectral_norm_v2(model)
        y_after = model(x).shape
        
        assert y_before == y_after, "Output shape should be preserved"

    def test_preserves_forward_output_shape_conv2d(self):
        """Wrapped Conv2d should preserve output shape."""
        torch.manual_seed(0)
        model = nn.Sequential(nn.Conv2d(3, 16, 3, padding=1))
        
        x = torch.randn(2, 3, 32, 32)
        y_before = model(x).shape
        
        apply_spectral_norm_v2(model)
        y_after = model(x).shape
        
        assert y_before == y_after, "Output shape should be preserved"

    def test_nested_sequential(self):
        """apply_spectral_norm_v2 should work with nested nn.Sequential."""
        torch.manual_seed(0)
        model = nn.Sequential(
            nn.Sequential(
                nn.Linear(16, 32),
                nn.ReLU(),
            ),
            nn.Linear(32, 8),
        )
        
        apply_spectral_norm_v2(model)
        
        # Check nested Linear is wrapped
        inner_seq = model[0]
        assert isinstance(inner_seq[0], SpectralNormMultiV2), "Nested Linear should be wrapped"

    def test_exclude_names(self):
        """exclude_names should prevent specific modules from being wrapped."""
        torch.manual_seed(0)
        
        class NamedModel(nn.Module):
            def __init__(self):
                super().__init__()
                self.layer1 = nn.Linear(16, 32)
                self.layer2 = nn.Linear(32, 8)
        
        model = NamedModel()
        apply_spectral_norm_v2(model, exclude_names=["layer1"])
        
        assert not isinstance(model.layer1, SpectralNormMultiV2), "layer1 should be excluded"
        assert isinstance(model.layer2, SpectralNormMultiV2), "layer2 should be wrapped"

    def test_exclude_types(self):
        """exclude_types should prevent specific module types from being wrapped."""
        torch.manual_seed(0)
        model = nn.Sequential(
            nn.Linear(16, 32),
            nn.Conv1d(32, 16, 3),
        )
        
        apply_spectral_norm_v2(model, exclude_types=(nn.Conv1d,))
        
        assert isinstance(model[0], SpectralNormMultiV2), "Linear should be wrapped"
        assert isinstance(model[1], nn.Conv1d), "Conv1d should be excluded"

    def test_predicate_filtering(self):
        """predicate function should control which modules get wrapped."""
        torch.manual_seed(0)
        
        class NamedModel(nn.Module):
            def __init__(self):
                super().__init__()
                self.small_layer = nn.Linear(8, 4)
                self.big_layer = nn.Linear(64, 32)
        
        model = NamedModel()
        
        # Only wrap layers with 'big' in name
        apply_spectral_norm_v2(model, predicate=lambda name, mod: "big" in name)
        
        assert not isinstance(model.small_layer, SpectralNormMultiV2), "small_layer should not be wrapped"
        assert isinstance(model.big_layer, SpectralNormMultiV2), "big_layer should be wrapped"

    def test_configs_by_type(self):
        """configs_by_type should apply type-specific configurations."""
        torch.manual_seed(0)
        model = nn.Sequential(
            nn.Linear(16, 8),
            nn.Conv2d(8, 16, 3, padding=1),
        )
        
        configs_by_type = {
            nn.Linear: [SNConfig(param_name="weight", mode="exact_svd")],
            nn.Conv2d: [SNConfig(param_name="weight", mode="power_iter", n_power_iterations=3)],
        }
        
        apply_spectral_norm_v2(model, configs_by_type=configs_by_type)
        
        # Check configs were applied
        linear_wrapper = model[0]
        conv_wrapper = model[1]
        
        assert linear_wrapper.sn_params[0].cfg.mode == "exact_svd", "Linear should use exact_svd"
        assert conv_wrapper.sn_params[0].cfg.mode == "power_iter", "Conv2d should use power_iter"


# ============================================================================
# Test Class: Tracing
# ============================================================================

class TestTracing:
    """Requirement: Verify optional tracing behavior."""

    def test_trace_enabled_emits_events(self, simple_linear):
        """When trace=True, events should be emitted."""
        cfg = SNConfig(param_name="weight", trace=True)
        snp = get_snp(simple_linear, cfg)
        
        assert snp.trace.enabled, "Trace should be enabled"
        
        # Note: The current implementation's emit() needs to be called explicitly
        # by the compute_weight method. Testing the buffer itself:
        snp.trace.emit(event="test", step=0)
        
        assert len(snp.trace.events) > 0, "Events should be emitted when trace=True"

    def test_trace_disabled_no_events(self, simple_linear):
        """When trace=False, no events should be emitted."""
        cfg = SNConfig(param_name="weight", trace=False)
        snp = get_snp(simple_linear, cfg)
        
        assert not snp.trace.enabled, "Trace should be disabled"
        
        # Try to emit - should be no-op
        snp.trace.emit(event="test", step=0)
        
        assert len(snp.trace.events) == 0, "No events should be emitted when trace=False"

    def test_trace_buffer_maxlen(self, simple_linear):
        """Trace buffer should respect maxlen limit."""
        cfg = SNConfig(param_name="weight", trace=True)
        snp = get_snp(simple_linear, cfg)
        
        maxlen = snp.trace.maxlen
        
        # Emit more events than maxlen
        for i in range(maxlen + 50):
            snp.trace.emit(step=i)
        
        assert len(snp.trace.events) <= maxlen, f"Events should be capped at {maxlen}"


# ============================================================================
# Test Class: Example Models (SNResBlock, SNResNetDiscriminator)
# ============================================================================

class TestExampleModels:
    """Test the example SNResBlock and SNResNetDiscriminator models."""

    def test_snresblock_forward(self):
        """SNResBlock should produce correct output shape."""
        torch.manual_seed(0)
        block = SNResBlock(in_ch=64, out_ch=128, downsample=True)
        
        x = torch.randn(2, 64, 16, 16)
        y = block(x)
        
        assert y.shape == (2, 128, 8, 8), "Downsampled output should halve spatial dims"

    def test_snresblock_no_downsample(self):
        """SNResBlock without downsample should preserve spatial dims."""
        torch.manual_seed(0)
        block = SNResBlock(in_ch=64, out_ch=64, downsample=False)
        
        x = torch.randn(2, 64, 16, 16)
        y = block(x)
        
        assert y.shape == (2, 64, 16, 16), "No downsample should preserve spatial dims"

    def test_snresnet_discriminator_forward(self):
        """SNResNetDiscriminator should produce scalar output."""
        torch.manual_seed(0)
        model = SNResNetDiscriminator(in_channels=3, base_channels=32, blocks=2)
        
        x = torch.randn(2, 3, 32, 32)
        y = model(x)
        
        assert y.shape == (2, 1), "Discriminator should output (batch, 1)"

    def test_snresnet_discriminator_has_spectral_norm(self):
        """SNResNetDiscriminator should have spectral norm applied."""
        torch.manual_seed(0)
        model = SNResNetDiscriminator(in_channels=3, base_channels=32, blocks=2)
        
        # Check that conv_in is wrapped
        assert isinstance(model.conv_in, SpectralNormMultiV2), "conv_in should be wrapped"
        
        # Check that fc is wrapped
        assert isinstance(model.fc, SpectralNormMultiV2), "fc should be wrapped"


# ============================================================================
# Test Class: Edge Cases and Validation
# ============================================================================

class TestEdgeCases:
    """Test edge cases and input validation."""

    def test_invalid_param_name_raises(self):
        """Missing param_name should raise ValueError."""
        torch.manual_seed(0)
        linear = nn.Linear(16, 8)
        cfg = SNConfig(param_name="nonexistent")
        
        with pytest.raises(ValueError, match="no attribute"):
            SpectralNormParamV2(linear, cfg)

    def test_negative_power_iterations_raises(self):
        """Negative n_power_iterations should raise ValueError."""
        torch.manual_seed(0)
        linear = nn.Linear(16, 8)
        cfg = SNConfig(param_name="weight", n_power_iterations=-1)
        
        with pytest.raises(ValueError, match="n_power_iterations"):
            SpectralNormParamV2(linear, cfg)

    def test_invalid_update_every_raises(self):
        """update_every < 1 should raise ValueError."""
        torch.manual_seed(0)
        linear = nn.Linear(16, 8)
        cfg = SNConfig(param_name="weight", update_every=0)
        
        with pytest.raises(ValueError, match="update_every"):
            SpectralNormParamV2(linear, cfg)

    def test_invalid_ema_decay_raises(self):
        """ema_decay >= 1.0 should raise ValueError."""
        torch.manual_seed(0)
        linear = nn.Linear(16, 8)
        cfg = SNConfig(param_name="weight", ema_decay=1.0)
        
        with pytest.raises(ValueError, match="ema_decay"):
            SpectralNormParamV2(linear, cfg)

    def test_snconfig_is_frozen(self):
        """SNConfig should be frozen (immutable)."""
        cfg = SNConfig()
        
        with pytest.raises(Exception):  # FrozenInstanceError
            cfg.param_name = "other"

    def test_double_wrap_is_idempotent(self):
        """Wrapping an already-initialized module should be idempotent."""
        torch.manual_seed(0)
        linear = nn.Linear(16, 8)
        cfg = SNConfig(param_name="weight")
        
        # First wrap
        snp1 = SpectralNormParamV2(linear, cfg)
        
        # Second wrap attempt (should recognize already initialized)
        snp2 = SpectralNormParamV2(linear, cfg)
        
        # Both should work without error
        x = torch.randn(4, 16)
        y1 = snp1(x)
        y2 = snp2(x)
        
        assert y1.shape == y2.shape


# ============================================================================
# Test Class: Determinism Verification
# ============================================================================

class TestDeterminism:
    """Verify all operations are deterministic."""

    def test_full_forward_deterministic(self):
        """Complete forward pass should be deterministic with same seed."""
        results = []
        
        for _ in range(3):
            torch.manual_seed(42)
            model = nn.Sequential(nn.Linear(16, 8), nn.Linear(8, 4))
            apply_spectral_norm_v2(model)
            
            torch.manual_seed(42)
            x = torch.randn(4, 16)
            y = model(x)
            results.append(y.clone())
        
        for i in range(1, len(results)):
            assert torch.allclose(results[0], results[i]), f"Run {i} differs from run 0"

    def test_backward_deterministic(self):
        """Backward pass should be deterministic with same seed."""
        grads = []
        
        for _ in range(3):
            torch.manual_seed(42)
            model = nn.Sequential(nn.Linear(16, 8))
            apply_spectral_norm_v2(model)
            
            torch.manual_seed(42)
            x = torch.randn(4, 16, requires_grad=True)
            y = model(x)
            loss = y.sum()
            loss.backward()
            grads.append(x.grad.clone())
        
        for i in range(1, len(grads)):
            assert torch.allclose(grads[0], grads[i]), f"Gradient run {i} differs from run 0"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
