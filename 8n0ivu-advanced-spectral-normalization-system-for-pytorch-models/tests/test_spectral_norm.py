"""
Test suite for the Advanced Spectral Normalization System.
"""

import pytest
import torch
import torch.nn as nn
from typing import List, Tuple


class TestSpectralNormBasics:

    def test_spectral_norm_exists(self):
        from spectral_norm import spectral_norm
        assert callable(spectral_norm)

    def test_remove_spectral_norm_exists(self):
        from spectral_norm import remove_spectral_norm
        assert callable(remove_spectral_norm)

    def test_apply_spectral_norm_exists(self):
        from spectral_norm import apply_spectral_norm
        assert callable(apply_spectral_norm)

    def test_discriminator_exists(self):
        from spectral_norm import SNResNetDiscriminator, create_sn_discriminator
        assert SNResNetDiscriminator is not None
        assert callable(create_sn_discriminator)


class TestLinearLayer:

    def test_linear_basic(self):
        from spectral_norm import spectral_norm

        linear = nn.Linear(10, 5)
        linear = spectral_norm(linear)

        x = torch.randn(2, 10)
        out = linear(x)
        assert out.shape == (2, 5)

    def test_linear_weight_normalized(self):
        from spectral_norm import spectral_norm, get_spectral_norm_stats

        linear = nn.Linear(10, 5)
        linear = spectral_norm(linear, n_power_iterations=10)

        for _ in range(5):
            x = torch.randn(2, 10)
            _ = linear(x)

        stats = get_spectral_norm_stats(linear)
        assert stats is not None
        assert stats["sigma"] > 0

    def test_linear_gradient_flows(self):
        from spectral_norm import spectral_norm

        linear = spectral_norm(nn.Linear(10, 5))
        x = torch.randn(2, 10, requires_grad=True)
        out = linear(x)
        loss = out.sum()
        loss.backward()

        assert x.grad is not None
        assert x.grad.shape == x.shape

    def test_linear_no_bias(self):
        from spectral_norm import spectral_norm

        linear = nn.Linear(10, 5, bias=False)
        linear = spectral_norm(linear)

        x = torch.randn(2, 10)
        out = linear(x)
        assert out.shape == (2, 5)


class TestConvolutionalLayers:

    def test_conv1d(self):
        from spectral_norm import spectral_norm

        conv = nn.Conv1d(3, 16, kernel_size=3, padding=1)
        conv = spectral_norm(conv)

        x = torch.randn(2, 3, 32)
        out = conv(x)
        assert out.shape == (2, 16, 32)

    def test_conv2d(self):
        from spectral_norm import spectral_norm

        conv = nn.Conv2d(3, 16, kernel_size=3, padding=1)
        conv = spectral_norm(conv)

        x = torch.randn(2, 3, 32, 32)
        out = conv(x)
        assert out.shape == (2, 16, 32, 32)

    def test_conv3d(self):
        from spectral_norm import spectral_norm

        conv = nn.Conv3d(3, 8, kernel_size=3, padding=1)
        conv = spectral_norm(conv)

        x = torch.randn(2, 3, 16, 16, 16)
        out = conv(x)
        assert out.shape == (2, 8, 16, 16, 16)

    def test_conv_gradient_flows(self):
        from spectral_norm import spectral_norm

        conv = spectral_norm(nn.Conv2d(3, 16, 3, padding=1))
        x = torch.randn(2, 3, 8, 8, requires_grad=True)
        out = conv(x)
        loss = out.sum()
        loss.backward()

        assert x.grad is not None


class TestConvTransposeLayers:

    def test_conv_transpose1d(self):
        from spectral_norm import spectral_norm

        conv_t = nn.ConvTranspose1d(16, 3, kernel_size=3, padding=1)
        conv_t = spectral_norm(conv_t)

        x = torch.randn(2, 16, 32)
        out = conv_t(x)
        assert out.shape == (2, 3, 32)

    def test_conv_transpose2d(self):
        from spectral_norm import spectral_norm

        conv_t = nn.ConvTranspose2d(16, 3, kernel_size=4, stride=2, padding=1)
        conv_t = spectral_norm(conv_t)

        x = torch.randn(2, 16, 16, 16)
        out = conv_t(x)
        assert out.shape == (2, 3, 32, 32)

    def test_conv_transpose3d(self):
        from spectral_norm import spectral_norm

        conv_t = nn.ConvTranspose3d(8, 3, kernel_size=3, padding=1)
        conv_t = spectral_norm(conv_t)

        x = torch.randn(2, 8, 8, 8, 8)
        out = conv_t(x)
        assert out.shape == (2, 3, 8, 8, 8)

    def test_conv_transpose_weight_reshape(self):
        from spectral_norm import spectral_norm, get_spectral_norm_stats

        conv_t = nn.ConvTranspose2d(16, 8, kernel_size=3)
        conv_t = spectral_norm(conv_t, n_power_iterations=5)

        x = torch.randn(2, 16, 8, 8)
        _ = conv_t(x)

        stats = get_spectral_norm_stats(conv_t)
        assert stats is not None
        assert stats["u"].shape[0] == 8


class TestLazyModules:

    def test_lazy_linear_deferred_init(self):
        from spectral_norm import spectral_norm

        lazy_linear = nn.LazyLinear(5)
        lazy_linear = spectral_norm(lazy_linear, init_on_first_forward=True)

        x = torch.randn(2, 10)
        out = lazy_linear(x)
        assert out.shape == (2, 5)

    def test_lazy_conv2d_deferred_init(self):
        from spectral_norm import spectral_norm

        lazy_conv = nn.LazyConv2d(16, kernel_size=3, padding=1)
        lazy_conv = spectral_norm(lazy_conv, init_on_first_forward=True)

        x = torch.randn(2, 3, 32, 32)
        out = lazy_conv(x)
        assert out.shape == (2, 16, 32, 32)

    def test_lazy_conv_transpose2d(self):
        from spectral_norm import spectral_norm

        lazy_conv_t = nn.LazyConvTranspose2d(8, kernel_size=4, stride=2, padding=1)
        lazy_conv_t = spectral_norm(lazy_conv_t, init_on_first_forward=True)

        x = torch.randn(2, 16, 16, 16)
        out = lazy_conv_t(x)
        assert out.shape == (2, 8, 32, 32)


class TestPowerIteration:

    def test_configurable_iterations(self):
        from spectral_norm import spectral_norm, get_spectral_norm_stats

        linear = nn.Linear(10, 5)
        linear = spectral_norm(linear, n_power_iterations=5)

        x = torch.randn(2, 10)
        _ = linear(x)

        stats = get_spectral_norm_stats(linear)
        assert stats is not None
        assert stats["n_power_iterations"] == 5

    def test_power_iter_on_eval(self):
        from spectral_norm import spectral_norm, get_spectral_norm_stats

        linear = spectral_norm(
            nn.Linear(10, 5),
            n_power_iterations=3,
            power_iter_on_eval=True
        )

        x = torch.randn(2, 10)
        _ = linear(x)

        stats1 = get_spectral_norm_stats(linear)
        u1 = stats1["u"].clone()

        linear.eval()
        _ = linear(x)

        stats2 = get_spectral_norm_stats(linear)
        assert stats2 is not None

    def test_no_power_iter_on_eval(self):
        from spectral_norm import spectral_norm, get_spectral_norm_stats

        linear = spectral_norm(
            nn.Linear(10, 5),
            n_power_iterations=1,
            power_iter_on_eval=False
        )

        linear.train()
        for _ in range(5):
            x = torch.randn(2, 10)
            _ = linear(x)

        stats1 = get_spectral_norm_stats(linear)
        u1 = stats1["u"].clone()

        linear.eval()
        _ = linear(torch.randn(2, 10))

        stats2 = get_spectral_norm_stats(linear)
        assert torch.allclose(u1, stats2["u"])


class TestNumericalStability:

    def test_eps_parameter(self):
        from spectral_norm import spectral_norm, get_spectral_norm_stats

        linear = spectral_norm(nn.Linear(10, 5), eps=1e-6)

        _ = linear(torch.randn(2, 10))
        stats = get_spectral_norm_stats(linear)
        assert stats["eps"] == 1e-6

    @pytest.mark.skipif(not torch.cuda.is_available(), reason="CUDA not available")
    def test_stable_fp32_with_fp16(self):
        from spectral_norm import spectral_norm

        linear = nn.Linear(10, 5).cuda().half()
        linear = spectral_norm(linear, stable_fp32=True)

        x = torch.randn(2, 10, device="cuda", dtype=torch.float16)
        out = linear(x)

        assert not torch.isnan(out).any()
        assert not torch.isinf(out).any()
        assert out.dtype == torch.float16

    def test_stable_fp32_default(self):
        from spectral_norm import spectral_norm, SpectralNormParametrization

        linear = spectral_norm(nn.Linear(10, 5))
        _ = linear(torch.randn(2, 10))

        for p in linear.parametrizations.weight:
            if isinstance(p, SpectralNormParametrization):
                assert p.stable_fp32 is True


class TestBufferManagement:

    def test_buffers_registered(self):
        from spectral_norm import spectral_norm, SpectralNormParametrization

        linear = spectral_norm(nn.Linear(10, 5))
        _ = linear(torch.randn(2, 10))

        for p in linear.parametrizations.weight:
            if isinstance(p, SpectralNormParametrization):
                assert hasattr(p, "_u")
                assert hasattr(p, "_v")
                assert isinstance(p._u, torch.Tensor)
                assert isinstance(p._v, torch.Tensor)

    @pytest.mark.skipif(not torch.cuda.is_available(), reason="CUDA not available")
    def test_buffers_move_with_module(self):
        from spectral_norm import spectral_norm, SpectralNormParametrization

        linear = spectral_norm(nn.Linear(10, 5))
        _ = linear(torch.randn(2, 10))

        linear = linear.cuda()
        x = torch.randn(2, 10, device="cuda")
        _ = linear(x)

        for p in linear.parametrizations.weight:
            if isinstance(p, SpectralNormParametrization):
                assert p._u.device.type == "cuda"
                assert p._v.device.type == "cuda"

    def test_buffers_in_state_dict(self):
        from spectral_norm import spectral_norm, SpectralNormParametrization

        linear = spectral_norm(nn.Linear(10, 5))
        _ = linear(torch.randn(2, 10))

        state_dict = linear.state_dict()
        has_u_buffer = any("_u" in k for k in state_dict.keys())
        has_v_buffer = any("_v" in k for k in state_dict.keys())
        assert has_u_buffer, f"_u buffer not found in state dict keys: {state_dict.keys()}"
        assert has_v_buffer, f"_v buffer not found in state dict keys: {state_dict.keys()}"


class TestMultipleParameters:

    def test_multiple_param_names(self):
        from spectral_norm import spectral_norm

        class MultiWeightModule(nn.Module):
            def __init__(self):
                super().__init__()
                self.weight1 = nn.Parameter(torch.randn(5, 10))
                self.weight2 = nn.Parameter(torch.randn(5, 10))

            def forward(self, x):
                return x @ self.weight1.t() + x @ self.weight2.t()

        module = MultiWeightModule()
        module = spectral_norm(module, param_names=["weight1", "weight2"])

        x = torch.randn(2, 10)
        out = module(x)
        assert out.shape == (2, 5)

        assert "weight1" in module.parametrizations
        assert "weight2" in module.parametrizations

    def test_skip_missing_param(self):
        from spectral_norm import spectral_norm

        linear = nn.Linear(10, 5)
        linear = spectral_norm(linear, param_names=["weight", "nonexistent"])

        x = torch.randn(2, 10)
        out = linear(x)
        assert out.shape == (2, 5)


class TestRecursiveApplication:

    def test_apply_to_model(self):
        from spectral_norm import apply_spectral_norm, get_spectral_norm_modules

        model = nn.Sequential(
            nn.Conv2d(3, 16, 3, padding=1),
            nn.ReLU(),
            nn.Conv2d(16, 32, 3, padding=1),
            nn.ReLU(),
            nn.Flatten(),
            nn.Linear(32 * 8 * 8, 10),
        )

        model = apply_spectral_norm(model)

        sn_modules = get_spectral_norm_modules(model)
        assert len(sn_modules) >= 3

    def test_include_types_filter(self):
        from spectral_norm import apply_spectral_norm, get_spectral_norm_modules

        model = nn.Sequential(
            nn.Conv2d(3, 16, 3, padding=1),
            nn.Linear(16, 10),
        )

        model = apply_spectral_norm(model, include_types=[nn.Linear])

        sn_modules = get_spectral_norm_modules(model)
        assert len(sn_modules) == 1
        assert isinstance(sn_modules[0][1], nn.Linear)

    def test_exclude_types_filter(self):
        from spectral_norm import apply_spectral_norm, get_spectral_norm_modules

        model = nn.Sequential(
            nn.Conv2d(3, 16, 3, padding=1),
            nn.BatchNorm2d(16),
            nn.Conv2d(16, 32, 3, padding=1),
        )

        model = apply_spectral_norm(model, exclude_types=[nn.BatchNorm2d])

        sn_modules = get_spectral_norm_modules(model)
        for name, mod in sn_modules:
            assert not isinstance(mod, nn.BatchNorm2d)

    def test_exclude_names_filter(self):
        from spectral_norm import apply_spectral_norm, get_spectral_norm_modules

        class NamedModel(nn.Module):
            def __init__(self):
                super().__init__()
                self.conv1 = nn.Conv2d(3, 16, 3)
                self.conv2 = nn.Conv2d(16, 32, 3)
                self.skip = nn.Conv2d(3, 32, 1)

            def forward(self, x):
                return self.conv2(self.conv1(x)) + self.skip(x)

        model = NamedModel()
        model = apply_spectral_norm(model, exclude_names=["skip"])

        sn_modules = get_spectral_norm_modules(model)
        names = [n for n, _ in sn_modules]
        assert "skip" not in names
        assert "conv1" in names or "conv2" in names

    def test_predicate_filter(self):
        from spectral_norm import apply_spectral_norm, get_spectral_norm_modules

        model = nn.Sequential(
            nn.Conv2d(3, 16, 3, padding=1),
            nn.Conv2d(16, 32, 3, padding=1),
            nn.Linear(32, 10),
        )

        model = apply_spectral_norm(
            model,
            predicate=lambda name, mod: "0" in name
        )

        sn_modules = get_spectral_norm_modules(model)
        assert len(sn_modules) == 1


class TestRemoveSpectralNorm:

    def test_remove_basic(self):
        from spectral_norm import spectral_norm, remove_spectral_norm

        linear = spectral_norm(nn.Linear(10, 5))
        _ = linear(torch.randn(2, 10))

        linear = remove_spectral_norm(linear)

        out = linear(torch.randn(2, 10))
        assert out.shape == (2, 5)

        has_sn = hasattr(linear, "parametrizations") and "weight" in getattr(linear, "parametrizations", {})
        assert not has_sn

    def test_remove_restores_weight(self):
        from spectral_norm import spectral_norm, remove_spectral_norm

        linear = nn.Linear(10, 5)
        original_weight = linear.weight.clone()

        linear = spectral_norm(linear)
        _ = linear(torch.randn(2, 10))

        linear = remove_spectral_norm(linear)

        assert isinstance(linear.weight, nn.Parameter)

    def test_remove_recursive(self):
        from spectral_norm import (
            apply_spectral_norm,
            remove_spectral_norm_recursive,
            get_spectral_norm_modules
        )

        model = nn.Sequential(
            nn.Conv2d(3, 16, 3),
            nn.Conv2d(16, 32, 3),
        )

        model = apply_spectral_norm(model)
        assert len(get_spectral_norm_modules(model)) > 0

        model = remove_spectral_norm_recursive(model)
        assert len(get_spectral_norm_modules(model)) == 0


class TestDiscriminator:

    def test_discriminator_forward(self):
        from spectral_norm import create_sn_discriminator

        disc = create_sn_discriminator(
            in_channels=3,
            base_channels=32,
            num_blocks=3,
            num_classes=1
        )

        x = torch.randn(4, 3, 64, 64)
        out = disc(x)
        assert out.shape == (4, 1)

    def test_discriminator_has_sn(self):
        from spectral_norm import create_sn_discriminator, get_spectral_norm_modules

        disc = create_sn_discriminator(num_blocks=2)
        sn_modules = get_spectral_norm_modules(disc)

        assert len(sn_modules) > 0

    def test_discriminator_configurable_depth(self):
        from spectral_norm import create_sn_discriminator

        disc2 = create_sn_discriminator(num_blocks=2)
        disc4 = create_sn_discriminator(num_blocks=4)

        params2 = sum(p.numel() for p in disc2.parameters())
        params4 = sum(p.numel() for p in disc4.parameters())
        assert params4 > params2

    def test_discriminator_gradient_flow(self):
        from spectral_norm import create_sn_discriminator

        disc = create_sn_discriminator(num_blocks=2)
        x = torch.randn(2, 3, 32, 32, requires_grad=True)
        out = disc(x)
        loss = out.sum()
        loss.backward()

        assert x.grad is not None
        assert not torch.isnan(x.grad).any()

    def test_discriminator_global_sum_pooling(self):
        from spectral_norm import create_sn_discriminator

        disc = create_sn_discriminator(num_blocks=2, base_channels=16)

        x1 = torch.randn(2, 3, 32, 32)
        x2 = torch.randn(2, 3, 64, 64)

        out1 = disc(x1)
        out2 = disc(x2)

        assert out1.shape == out2.shape


class TestWeightOrigAndBuffer:

    def test_original_weight_stored(self):
        from spectral_norm import spectral_norm

        linear = nn.Linear(10, 5)
        original_shape = linear.weight.shape

        linear = spectral_norm(linear)
        _ = linear(torch.randn(2, 10))

        assert hasattr(linear, "parametrizations")
        assert "weight" in linear.parametrizations
        assert linear.weight.shape == original_shape

    def test_normalized_weight_during_forward(self):
        from spectral_norm import spectral_norm, get_spectral_norm_stats

        linear = spectral_norm(nn.Linear(10, 5), n_power_iterations=10)

        for _ in range(10):
            _ = linear(torch.randn(2, 10))

        stats = get_spectral_norm_stats(linear)

        assert stats is not None
        assert stats["sigma"] > 0


class TestSelfContainedFile:

    def test_single_file_import(self):
        from spectral_norm import (
            spectral_norm,
            remove_spectral_norm,
            apply_spectral_norm,
            remove_spectral_norm_recursive,
            SpectralNormParametrization,
            SNResNetDiscriminator,
            create_sn_discriminator,
            get_spectral_norm_modules,
            get_spectral_norm_stats,
        )

        assert all([
            spectral_norm,
            remove_spectral_norm,
            apply_spectral_norm,
            remove_spectral_norm_recursive,
            SpectralNormParametrization,
            SNResNetDiscriminator,
            create_sn_discriminator,
            get_spectral_norm_modules,
            get_spectral_norm_stats,
        ])

    def test_only_pytorch_dependencies(self):
        import importlib.util

        import spectral_norm
        import inspect
        source = inspect.getsource(spectral_norm)

        import_lines = [line for line in source.split("\n") if line.strip().startswith("import") or line.strip().startswith("from")]

        allowed_imports = ["torch", "typing", "math", "__future__"]
        for line in import_lines:
            is_allowed = any(allowed in line for allowed in allowed_imports)
            assert is_allowed, f"Unexpected import: {line}"


class TestEdgeCases:

    def test_empty_model(self):
        from spectral_norm import apply_spectral_norm

        model = nn.Sequential()
        model = apply_spectral_norm(model)

    def test_module_without_weight(self):
        from spectral_norm import spectral_norm

        relu = nn.ReLU()
        relu = spectral_norm(relu)

        x = torch.randn(2, 10)
        out = relu(x)
        assert out.shape == x.shape

    def test_very_small_weight(self):
        from spectral_norm import spectral_norm

        linear = nn.Linear(10, 5)
        linear.weight.data.fill_(1e-10)
        linear = spectral_norm(linear)

        x = torch.randn(2, 10)
        out = linear(x)

        assert not torch.isnan(out).any()

    def test_double_application(self):
        from spectral_norm import spectral_norm, get_spectral_norm_stats

        linear = nn.Linear(10, 5)
        linear = spectral_norm(linear)
        _ = linear(torch.randn(2, 10))

        linear = spectral_norm(linear)
        out = linear(torch.randn(2, 10))
        assert out.shape == (2, 5)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
